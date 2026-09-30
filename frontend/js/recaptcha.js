/**
 * reCAPTCHA integration for the storefront.
 *
 * Two design rules drive everything here:
 *
 *  1. The widget is invisible to the developer until keys exist. The site key
 *     is served by the API at GET /api/config/public, so this file contains no
 *     key and no environment-specific URL. Drop the keys into .env and the
 *     widgets appear; leave them out and the app works exactly as it did.
 *
 *  2. A missing widget must never silently skip verification. If the API says
 *     the captcha is enabled but the widget failed to load (blocked CDN, network
 *     hiccup), getToken() returns a sentinel that the server rejects, so the
 *     user is told to retry instead of the request being quietly unprotected.
 *
 * Usage:
 *   const token = await elsRecaptcha.token('login');
 *   if (token === elsRecaptcha.LOAD_FAILED) { ...tell the user to reload... }
 */
(function () {
  'use strict';

  // Thrown-sentinel values. Distinct from '' so callers must handle them.
  const DISABLED = 'els-recaptcha-disabled';
  const LOAD_FAILED = 'els-recaptcha-load-failed';

  const SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';

  const state = {
    loaded: false,
    loading: null,
    enabled: false,
    siteKey: '',
    ready: false,       // config has been fetched at least once
    widgets: new Map(), // id -> widgetId
    attempts: 0
  };

  const MAX_LOAD_ATTEMPTS = 3;

  function log(...args) {
    if (window.console && console.warn) console.warn('[recaptcha]', ...args);
  }

  /** Inject Google's script once. Resolves false if it cannot be loaded. */
  function loadScript() {
    if (state.loaded) return Promise.resolve(true);
    if (state.loading) return state.loading;

    state.loading = new Promise((resolve) => {
      if (window.grecaptcha && window.grecaptcha.render) {
        state.loaded = true;
        return resolve(true);
      }

      const existing = document.querySelector(`script[src^="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => { state.loaded = true; resolve(true); });
        existing.addEventListener('error', () => resolve(false));
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => { state.loaded = true; resolve(true); };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return state.loading;
  }

  /**
   * Ask the API whether the captcha is on, and with which site key.
   *
   * Called once on boot. Any failure leaves the captcha disabled, which is the
   * safe local-development outcome: the server has its own enforcement and its
   * own rate limits, and in production it would have refused to boot without
   * keys.
   */
  async function init() {
    if (state.ready) return state.enabled;

    try {
      const base = window.API_BASE || 'http://localhost:8001/api';
      const res = await fetch(`${base}/config/public`, { headers: { Accept: 'application/json' } });

      if (!res.ok) throw new Error(`config responded ${res.status}`);

      const data = await res.json();
      const config = (data && data.config) || {};

      state.enabled = Boolean(config.recaptcha_enabled && config.recaptcha_site_key);
      state.siteKey = config.recaptcha_site_key || '';
      state.ready = true;

      if (state.enabled) {
        const ok = await loadScript();
        if (!ok) log('script failed to load; forms will report a captcha error until it is reachable');
      } else {
        log('disabled by server config (no RECAPTCHA_SITE_KEY)');
      }
    } catch (err) {
      state.ready = true;
      state.enabled = false;
      log('could not read public config, treating captcha as disabled:', err && err.message);
    }

    return state.enabled;
  }

  /**
   * Render (once) the widget for a container id.
   *
   * Explicit rendering rather than the data attribute scan, because the payment
   * page widget is created long after DOMContentLoaded.
   */
  async function render(containerId) {
    if (!state.enabled) return null;
    if (state.widgets.has(containerId)) return state.widgets.get(containerId);

    const container = document.getElementById(containerId);
    if (!container) return null;

    const ok = await loadScript();
    if (!ok || !window.grecaptcha || !window.grecaptcha.render) return null;

    try {
      const widgetId = window.grecaptcha.render(container, {
        sitekey: state.siteKey,
        theme: 'light',
        size: 'normal',
        callback: () => {
          // Clear any stale "please complete the captcha" state once solved.
          const banner = document.getElementById(`recaptcha-error-${containerId}`);
          if (banner) banner.classList.add('hidden');
        },
        'expired-callback': () => {
          // Tokens expire after ~2 minutes. Surfacing this early beats the user
          // filling the form and being rejected for a token that aged out.
          showInlineError(containerId, 'That captcha expired. Please solve it again.');
        },
        'error-callback': () => {
          showInlineError(containerId, 'The captcha could not be loaded. Please refresh the page.');
        }
      });

      state.widgets.set(containerId, widgetId);
      container.classList.remove('hidden');
      return widgetId;
    } catch (err) {
      // Thrown when the same container is rendered twice, which is harmless.
      log('render failed for', containerId, err && err.message);
      return null;
    }
  }

  function showInlineError(containerId, message) {
    const el = document.getElementById(`recaptcha-error-${containerId}`);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function clearInlineError(containerId) {
    const el = document.getElementById(`recaptcha-error-${containerId}`);
    if (el) el.classList.add('hidden');
  }

  /**
   * Get a token for the named widget.
   *
   * @returns {Promise<string>} the token, DISABLED when no captcha is
   *   configured, or LOAD_FAILED when one is configured but unusable.
   */
  async function token(containerId) {
    if (!state.ready) await init();
    if (!state.enabled) return DISABLED;

    const widgetId = await render(containerId);

    if (widgetId === null || widgetId === undefined) {
      // Configured server-side but no usable widget. Refuse rather than
      // submitting an empty token that the server would (correctly) reject.
      return LOAD_FAILED;
    }

    // v2 checkboxes can sit unsolved; v3 fires on execute. Both are resolved
    // through getResponse so a single call covers either version.
    try {
      const value = window.grecaptcha.getResponse(widgetId);
      if (value) return value;
    } catch (err) {
      /* fall through to execute */
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value || LOAD_FAILED);
      };

      try {
        window.grecaptcha.execute(widgetId, { action: containerId }, done);
      } catch (err) {
        done(null);
      }

      // Google's callback does not fire on network failure, so without this
      // timeout the submit button would spin forever.
      setTimeout(() => done(null), 8000);
    });
  }

  /**
   * Clear the widget so the next attempt gets a fresh token.
   *
   * Required after every submit attempt: Google tokens are single-use, so
   * replaying one produces a confusing "verification failed" on an attempt
   * where the user did nothing wrong.
   */
  function reset(containerId) {
    const widgetId = state.widgets.get(containerId);
    if (widgetId === null || widgetId === undefined) return;
    try {
      if (window.grecaptcha && window.grecaptcha.reset) window.grecaptcha.reset(widgetId);
    } catch (err) {
      /* nothing to reset */
    }
    clearInlineError(containerId);
  }

  window.elsRecaptcha = {
    init,
    render,
    token,
    reset,
    showInlineError,
    clearInlineError,
    isEnabled: () => state.enabled,
    DISABLED,
    LOAD_FAILED
  };
})();

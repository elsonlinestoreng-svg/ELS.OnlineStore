/**
 * reCAPTCHA v3 integration for the storefront.
 *
 * Two design rules drive everything here:
 *
 *  1. The integration is invisible to the developer until keys exist. The site
 *     key is served by the API at GET /api/config/public, so this file contains
 *     no key and no environment-specific URL. Drop the keys into .env and the
 *     captcha starts scoring every submit; leave them out and the app works
 *     exactly as it did.
 *
 *  2. A missing captcha must never silently skip verification. If the API says
 *     the captcha is enabled but the script failed to load (blocked CDN,
 *     network hiccup), token() returns a sentinel that the server rejects, so
 *     the user is told to retry instead of the request being quietly
 *     unprotected.
 *
 * v3 is invisible: there is no widget and no checkbox. execute() mints a
 * fresh, single-use token scored by Google; the server rejects scores below
 * RECAPTCHA_MIN_SCORE. render() is kept as a harmless no-op so existing call
 * sites (ui.js, payment.js) work unchanged.
 *
 * Usage:
 *   const token = await elsRecaptcha.token('recaptcha-login');
 *   if (token === elsRecaptcha.LOAD_FAILED) { ...tell the user to reload... }
 */
(function () {
  'use strict';

  // Thrown-sentinel values. Distinct from '' so callers must handle them.
  const DISABLED = 'els-recaptcha-disabled';
  const LOAD_FAILED = 'els-recaptcha-load-failed';

  const SCRIPT_BASE = 'https://www.google.com/recaptcha/api.js';

  const state = {
    loaded: false,
    loading: null,
    enabled: false,
    siteKey: '',
    ready: false // config has been fetched at least once
  };

  function log(...args) {
    if (window.console && console.warn) console.warn('[recaptcha]', ...args);
  }

  /**
   * v3 action names must match /^[a-zA-Z0-9_]+$/. Callers pass container ids
   * like 'recaptcha-login'; strip the widget prefix and sanitise the rest so
   * 'recaptcha-login' becomes 'login', 'recaptcha-payment' becomes 'payment'.
   */
  function actionName(containerId) {
    const base = String(containerId || 'action').replace(/^recaptcha-/, '');
    const safe = base.replace(/[^a-zA-Z0-9_]/g, '_');
    return safe || 'action';
  }

  /**
   * Inject Google's script once, pinned to the configured site key (v3 loads
   * with ?render=<sitekey>). Resolves false if it cannot be loaded.
   */
  function loadScript() {
    if (state.loaded) return Promise.resolve(true);
    if (state.loading) return state.loading;
    if (!state.siteKey) return Promise.resolve(false);

    state.loading = new Promise((resolve) => {
      const ready = () => {
        state.loaded = true;
        resolve(true);
      };

      // The script may already be on the page (e.g. re-injected by a
      // extension or a previous boot in a SPA-style navigation).
      if (window.grecaptcha && typeof window.grecaptcha.execute === 'function') {
        return ready();
      }

      const existing = document.querySelector(`script[src^="${SCRIPT_BASE}"]`);
      if (existing) {
        existing.addEventListener('load', ready);
        existing.addEventListener('error', () => resolve(false));
        return;
      }

      const script = document.createElement('script');
      script.src = `${SCRIPT_BASE}?render=${encodeURIComponent(state.siteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = ready;
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
   * Kept for API compatibility with the v2 widget version. v3 has no visible
   * widget, so this only verifies the script is reachable and resolves true.
   * The hidden containers in index.html stay hidden.
   */
  async function render(containerId) {
    if (!state.enabled) return null;
    if (!state.ready) await init();
    if (!state.enabled) return null;

    const ok = await loadScript();
    return ok ? true : null;
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
   * Mint a fresh v3 token for the named action.
   *
   * @returns {Promise<string>} the token, DISABLED when no captcha is
   *   configured, or LOAD_FAILED when one is configured but unusable.
   */
  async function token(containerId) {
    if (!state.ready) await init();
    if (!state.enabled) return DISABLED;

    const ok = await loadScript();
    if (!ok || !window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
      // Configured server-side but no usable script. Refuse rather than
      // submitting an empty token that the server would (correctly) reject.
      return LOAD_FAILED;
    }

    const action = actionName(containerId);

    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value || LOAD_FAILED);
      };

      try {
        // grecaptcha.ready defers until the v3 API has finished initialising,
        // which is not guaranteed to have happened at script.onload time.
        window.grecaptcha.ready(() => {
          // v3 execute resolves with the token string; there is no widget id.
          Promise.resolve(window.grecaptcha.execute(state.siteKey, { action }))
            .then((value) => done(value))
            .catch(() => done(null));
        });
      } catch (err) {
        done(null);
      }

      // Google's promise does not reject on every network failure mode, so
      // without this timeout the submit button would spin forever.
      setTimeout(() => done(null), 8000);
    });
  }

  /**
   * Clear any stale error state. v3 tokens are minted fresh on every execute,
   * so there is no widget to reset — this exists so existing call sites that
   * reset after each submit attempt keep working.
   */
  function reset(containerId) {
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

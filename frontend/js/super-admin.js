/**
 * Super admin dashboard controller.
 *
 * Serves seven views off one API: Overview, Activity, Users, Stores, Orders,
 * Payments and Support. Replaces the single-view support inbox that was the
 * only admin screen, which the Phase 3/4 report flagged as the main open item.
 *
 * Conventions followed from the rest of the codebase:
 *  - Plain fetch with an explicit Authorization header, reading the session
 *    from BOTH localStorage and sessionStorage. The older admin-panel.js read
 *    localStorage only, so anyone who did not tick "keep me signed in" was
 *    bounced to the access gate despite holding a valid token.
 *  - Responses are read as text then parsed, so an HTML error body from a
 *    misconfigured proxy surfaces as a readable message instead of a throw.
 *  - Every value interpolated into markup goes through escapeHtml. Activity
 *    descriptions contain customer email addresses and order references, so
 *    this is the XSS boundary, not a formality.
 *
 * Access is decided by the server. The stored role is used only to decide
 * whether to show the gate early; a 403 from the API is the actual control.
 */
(function () {
  'use strict';

  const API_BASE = () => window.API_BASE || 'http://localhost:8001/api';

  // ---------------------------------------------------------------------------
  // Formatting and escaping
  // ---------------------------------------------------------------------------

  const ACTION_STYLES = {
    success: 'bg-emerald-100 text-emerald-700',
    failure: 'bg-rose-100 text-rose-700',
    denied: 'bg-amber-100 text-amber-700'
  };

  const ROLE_STYLES = {
    super_admin: 'bg-violet-100 text-violet-700',
    seller: 'bg-blue-100 text-blue-700',
    buyer: 'bg-slate-100 text-slate-600',
    delivery: 'bg-cyan-100 text-cyan-700',
    user: 'bg-slate-100 text-slate-600'
  };

  const STATUS_STYLES = {
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-rose-100 text-rose-700',
    pending_review: 'bg-amber-100 text-amber-700'
  };

  const PAYMENT_STYLES = {
    paid: 'bg-emerald-100 text-emerald-700',
    success: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    failed: 'bg-rose-100 text-rose-700',
    reversed: 'bg-slate-200 text-slate-600',
    refunded: 'bg-slate-200 text-slate-600'
  };

  const INQUIRY_STATUSES = ['new', 'in_progress', 'resolved', 'spam'];
  const INQUIRY_STATUS_STYLES = {
    new: 'bg-rose-100 text-rose-700',
    in_progress: 'bg-amber-100 text-amber-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    spam: 'bg-slate-200 text-slate-600'
  };
  const EMAIL_STATUS_STYLES = {
    sent: { label: 'Emailed', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    failed: { label: 'Email failed', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
    not_configured: { label: 'Relay down', classes: 'bg-rose-50 text-rose-700 ring-rose-200' }
  };

  /** Single escaping helper for every value written into innerHTML below. */
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(amount, currency) {
    const n = Number(amount) || 0;
    const unit = currency === 'NGN' || currency === 'KES' ? 'N' : '';
    return unit + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function when(value) {
    if (!value) return 'never';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'unknown';
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.round(hours / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString();
  }

  function dateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function badge(text, classes) {
    return `<span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}">${escapeHtml(text)}</span>`;
  }

  function tile(label, value, sub) {
    return `
      <div class="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p>
        <p class="mt-1 text-3xl font-bold text-slate-900">${escapeHtml(value)}</p>
        ${sub ? `<p class="mt-1 text-xs text-slate-500">${escapeHtml(sub)}</p>` : ''}
      </div>`;
  }

  /**
   * Empty states live outside the tbody, below the column headers. Putting the
   * message in a colspan row instead would work, but it still renders the
   * header block with nothing under it, so filtering down to zero results
   * reads as a broken table rather than an empty result set.
   */
  function setEmptyState(id, message, hasRows) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = hasRows ? '' : message;
    el.classList.toggle('hidden', hasRows);
  }

  let toastTimer = null;
  function toast(message, tone) {
    const el = document.getElementById('toast');
    if (!el) return;
    const colours = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      info: 'bg-slate-900'
    };
    el.className = 'fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full px-6 py-3 text-sm font-medium text-white shadow-xl ' + (colours[tone] || colours.info);
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  function getToken() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('els_token')) return localStorage.getItem('els_token');
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('els_token')) return sessionStorage.getItem('els_token');
    return '';
  }

  function getSessionUser() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('els_user'))
        || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('els_user'))
        || '{}';
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  /**
   * @returns {Promise<object>} the parsed body
   * @throws {Error} with .gate set to true when access was refused, so callers
   *   can show the gate instead of a generic failure.
   */
  async function apiRequest(endpoint, options) {
    const opts = options || {};
    const token = getToken();

    if (!token) {
      const err = new Error('You are not signed in.');
      err.gate = true;
      throw err;
    }

    const res = await fetch(`${API_BASE()}${endpoint}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      }
    });

    if (res.status === 401) {
      const err = new Error('Your session has expired. Sign in again to continue.');
      err.gate = true;
      throw err;
    }
    if (res.status === 403) {
      const err = new Error('This account does not have super admin access.');
      err.gate = true;
      throw err;
    }

    // Read as text first: a proxy or the static file server can answer with
    // HTML, and res.json() would throw a SyntaxError that hides the real cause.
    const text = await res.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (e) {
      payload = { message: text.slice(0, 200) };
    }

    if (!res.ok || payload.success === false) {
      const err = new Error(payload.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    return payload;
  }

  // ---------------------------------------------------------------------------
  // View routing
  // ---------------------------------------------------------------------------

  const VIEWS = ['overview', 'activity', 'users', 'stores', 'orders', 'payments', 'inbox'];

  function showView(name) {
    const target = VIEWS.includes(name) ? name : 'overview';

    VIEWS.forEach((v) => {
      const panel = document.querySelector(`[data-view-panel="${v}"]`);
      if (panel) panel.classList.toggle('hidden', v !== target);
    });

    document.querySelectorAll('.nav-tab').forEach((btn) => {
      const active = btn.getAttribute('data-view') === target;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.className = 'nav-tab rounded-full px-4 py-2 text-sm font-semibold transition ' + (active
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100');
    });

    if (location.hash.slice(1) !== target) {
      history.replaceState(null, '', `#${target}`);
    }

    // Load lazily so opening the dashboard does not fire seven queries.
    if (loaders[target]) loaders[target]();
  }

  // ---------------------------------------------------------------------------
  // Action modal (suspend / reinstate / role change / manual verify)
  // ---------------------------------------------------------------------------

  let pendingAction = null;

  function openActionModal(options) {
    const modal = document.getElementById('action-modal');
    if (!modal) return;

    document.getElementById('action-modal-title').textContent = options.title;
    document.getElementById('action-modal-body').textContent = options.body;

    const reasonField = document.getElementById('action-modal-reason');
    const reasonLabel = document.getElementById('action-modal-reason-label');
    reasonField.value = options.reason || '';
    reasonField.placeholder = options.placeholder || 'Recorded in the activity log';

    // Hide the reason input for actions where it would be meaningless.
    if (options.askReason === false) {
      reasonField.classList.add('hidden');
      reasonLabel.classList.add('hidden');
    } else {
      reasonField.classList.remove('hidden');
      reasonLabel.classList.remove('hidden');
    }

    const confirm = document.getElementById('action-modal-confirm');
    confirm.textContent = options.confirmLabel || 'Confirm';
    confirm.className = 'rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ' +
      (options.danger ? 'bg-rose-500 hover:bg-rose-400' : 'bg-slate-900 hover:bg-slate-700');

    // Reassigned rather than added, so repeated opens cannot stack listeners.
    confirm.onclick = async () => {
      confirm.disabled = true;
      confirm.textContent = 'Working...';
      try {
        if (pendingAction) await pendingAction(reasonField.value.trim());
        closeActionModal();
      } catch (err) {
        toast(err.message || 'That action failed', 'error');
        confirm.disabled = false;
        confirm.textContent = options.confirmLabel || 'Confirm';
      }
    };

    pendingAction = options.onConfirm;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => reasonField.focus(), 50);
  }

  function closeActionModal() {
    const modal = document.getElementById('action-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    pendingAction = null;
  }

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------

  async function loadOverview() {
    const data = await apiRequest('/superadmin/overview');
    const o = data.overview;

    document.getElementById('overview-tiles').innerHTML = [
      tile('Total users', o.users.total, `${o.users.new_today} today · ${o.users.new_this_week} this week`),
      tile('Gross revenue', money(o.payments.gross_revenue), `${o.orders.total} orders all time`),
      tile('Platform commission', money(o.payments.platform_commission), 'Earned on paid orders'),
      tile('Products live', o.catalogue.products, `${o.stores.total} stores (${o.stores.pending_review} awaiting review)`)
    ].join('');

    // Security strip. Only shown when there is something to say, so a healthy
    // platform does not train the operator to ignore the warning.
    const banner = document.getElementById('security-banner');
    const failedLogins = o.security.failed_logins_24h;
    const failedCaptchas = o.security.failed_captchas_24h;

    if (failedLogins > 0 || failedCaptchas > 0) {
      const severe = failedLogins >= 20 || failedCaptchas >= 20;
      banner.className = 'mt-6 rounded-3xl p-5 ring-1 ' + (severe
        ? 'bg-rose-50 ring-rose-200'
        : 'bg-amber-50 ring-amber-200');
      banner.innerHTML = `
        <div class="flex items-start gap-3">
          <i data-lucide="shield-alert" class="mt-0.5 h-5 w-5 ${severe ? 'text-rose-600' : 'text-amber-600'}"></i>
          <div>
            <p class="font-semibold ${severe ? 'text-rose-900' : 'text-amber-900'}">
              ${failedLogins} failed sign-in${failedLogins === 1 ? '' : 's'} and ${failedCaptchas} failed captcha${failedCaptchas === 1 ? '' : 's'} in the last 24 hours
            </p>
            <p class="mt-1 text-sm ${severe ? 'text-rose-700' : 'text-amber-700'}">
              Review the activity log filtered to failures before deciding whether this is credential stuffing.
            </p>
            <button type="button" data-goto-view="activity" class="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 ring-1 ring-slate-300 transition hover:bg-slate-50">
              Inspect failures
            </button>
          </div>
        </div>`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    renderRevenueChart(o.revenue_by_day || []);
    renderTopSellers(o.top_sellers || []);
    renderActivityRows(document.getElementById('overview-activity'), o.recent_activity || [], 'list');
  }

  /**
   * Minimal bar chart. Deliberately not a charting library: seven numbers do
   * not justify ~100KB of dependency, and this keeps the dashboard working even
   * when the CDN is blocked.
   */
  function renderRevenueChart(series) {
    const host = document.getElementById('revenue-chart');
    const axis = document.getElementById('revenue-axis');
    if (!host) return;

    if (!series.length) {
      host.innerHTML = '<p class="w-full pb-16 text-center text-sm text-slate-500">No paid sales in the last 7 days.</p>';
      axis.innerHTML = '';
      return;
    }

    const max = Math.max(...series.map((d) => d.revenue), 1);
    // Always render 7 slots so the axis reads as a week even when some days
    // have no sales, instead of silently compressing gaps out of the chart.
    const byDay = {};
    series.forEach((d) => { byDay[d._id] = d; });

    const slots = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      slots.push(byDay[key] || { _id: key, revenue: 0, orders: 0 });
    }

    host.innerHTML = slots.map((d) => {
      const pct = Math.max(2, Math.round((d.revenue / max) * 100));
      return `
        <div class="group relative flex flex-1 flex-col items-center justify-end">
          <div class="w-full rounded-t-xl bg-rose-500 transition hover:bg-rose-400" style="height:${pct}%">
            <span class="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              ${escapeHtml(money(d.revenue))} · ${escapeHtml(d.orders)} order${d.orders === 1 ? '' : 's'}
            </span>
          </div>
        </div>`;
    }).join('');

    axis.innerHTML = `<span>${escapeHtml(slots[0]._id)}</span><span>${escapeHtml(slots[slots.length - 1]._id)}</span>`;
  }

  function renderTopSellers(sellers) {
    const host = document.getElementById('top-sellers');
    if (!host) return;

    if (!sellers.length) {
      host.innerHTML = '<p class="py-6 text-center text-sm text-slate-500">No seller revenue yet.</p>';
      return;
    }

    const max = Math.max(...sellers.map((s) => s.revenue), 1);
    host.innerHTML = sellers.map((s) => `
      <div>
        <div class="flex items-baseline justify-between gap-3">
          <p class="truncate text-sm font-semibold text-slate-900">${escapeHtml(s.name)}</p>
          <p class="shrink-0 text-sm font-semibold text-slate-700">${escapeHtml(money(s.revenue))}</p>
        </div>
        <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-emerald-500" style="width:${Math.max(3, Math.round((s.revenue / max) * 100))}%"></div>
        </div>
        <p class="mt-1 text-xs text-slate-500">${escapeHtml(s.orders)} order${s.orders === 1 ? '' : 's'}${s.email ? ' · ' + escapeHtml(s.email) : ''}</p>
      </div>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Activity
  // ---------------------------------------------------------------------------

  const activityState = { page: 1, limit: 25, q: '', action: '', outcome: '' };

  async function loadActivity() {
    const params = new URLSearchParams({
      page: activityState.page,
      limit: activityState.limit
    });
    if (activityState.q) params.set('q', activityState.q);
    if (activityState.action) params.set('action', activityState.action);
    if (activityState.outcome) params.set('outcome', activityState.outcome);

    const data = await apiRequest(`/superadmin/activity?${params.toString()}`);

    // Populate the category dropdown once, from what the server has actually
    // seen, so it never offers a filter that returns nothing.
    const select = document.getElementById('action-filter');
    if (select && select.options.length <= 1 && data.categories && data.categories.length) {
      data.categories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c._id;
        opt.textContent = `${c._id} (${c.count})`;
        select.appendChild(opt);
      });
      if (activityState.action) select.value = activityState.action;
    }

    renderActivityRows(document.getElementById('activity-rows'), data.events, 'table');
    setEmptyState('activity-empty', 'No activity matches these filters yet.', data.events.length > 0);

    renderPager('activity-pager', data, () => {
      activityState.page = data.page > 1 ? data.page - 1 : 1;
      loadActivity();
    }, () => {
      activityState.page = data.page < data.pages ? data.page + 1 : data.page;
      loadActivity();
    });
  }

  function renderActivityRows(host, events, mode) {
    if (!host) return;

    if (!events.length) {
      host.innerHTML = '';
      return;
    }

    if (mode === 'table') {
      host.innerHTML = events.map((e) => `
        <tr class="hover:bg-slate-50">
          <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title="${escapeHtml(dateTime(e.created_at))}">${escapeHtml(when(e.created_at))}</td>
          <td class="px-4 py-3"><code class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">${escapeHtml(e.action)}</code></td>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-900">${escapeHtml(e.actor_email || 'anonymous')}</p>
            ${e.actor_role ? `<p class="text-xs text-slate-500">${escapeHtml(e.actor_role)}</p>` : ''}
          </td>
          <td class="px-4 py-3 text-slate-700">${escapeHtml(e.description || '—')}</td>
          <td class="px-4 py-3">${badge(e.outcome, ACTION_STYLES[e.outcome] || 'bg-slate-100 text-slate-600')}</td>
          <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(e.ip || '—')}</td>
        </tr>`).join('');
      return;
    }

    // Overview list mode: compact, one line per event.
    host.innerHTML = events.map((e) => `
      <div class="flex items-start gap-3 px-5 py-3">
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          e.outcome === 'success' ? 'bg-emerald-500' : e.outcome === 'denied' ? 'bg-amber-500' : 'bg-rose-500'
        }"></span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-slate-800">${escapeHtml(e.description || e.action)}</p>
          <p class="text-xs text-slate-500">
            <code>${escapeHtml(e.action)}</code> · ${escapeHtml(e.actor_email || 'anonymous')} · ${escapeHtml(when(e.created_at))}
          </p>
        </div>
        ${badge(e.outcome, ACTION_STYLES[e.outcome] || 'bg-slate-100 text-slate-600')}
      </div>`).join('');
  }

  function renderPager(id, data, onPrev, onNext) {
    const host = document.getElementById(id);
    if (!host) return;

    const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
    const to = Math.min(data.page * data.limit, data.total);

    host.innerHTML = `
      <span class="text-slate-500">Showing ${from}–${to} of ${data.total}</span>
      <span class="flex items-center gap-2">
        <button type="button" data-page="prev" ${data.page <= 1 ? 'disabled' : ''}
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <span class="text-slate-500">Page ${data.page} of ${data.pages}</span>
        <button type="button" data-page="next" ${data.page >= data.pages ? 'disabled' : ''}
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </span>`;

    const prev = host.querySelector('[data-page="prev"]');
    const next = host.querySelector('[data-page="next"]');
    if (prev) prev.onclick = onPrev;
    if (next) next.onclick = onNext;
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  const usersState = { page: 1, limit: 25, q: '', role: '', status: '', verified: '' };

  async function loadUsers() {
    const params = new URLSearchParams({ page: usersState.page, limit: usersState.limit });
    if (usersState.q) params.set('q', usersState.q);
    if (usersState.role) params.set('role', usersState.role);
    if (usersState.status) params.set('status', usersState.status);
    if (usersState.verified) params.set('verified', usersState.verified);

    const data = await apiRequest(`/superadmin/users?${params.toString()}`);
    const me = getSessionUser();
    const myId = me && me._id;

    const host = document.getElementById('users-rows');
    if (!host) return;

    if (!data.users.length) {
      host.innerHTML = '';
    } else {
      host.innerHTML = data.users.map((u) => {
        const isSelf = u._id === myId;
        const suspended = u.status === 'suspended';
        return `
          <tr class="hover:bg-slate-50">
            <td class="px-4 py-3">
              <p class="font-semibold text-slate-900">${escapeHtml(u.name)}${isSelf ? ' <span class="text-xs text-slate-400">(you)</span>' : ''}</p>
              <p class="text-xs text-slate-500">${escapeHtml(u.email)}</p>
            </td>
            <td class="px-4 py-3">${badge(u.role, ROLE_STYLES[u.role] || 'bg-slate-100 text-slate-600')}</td>
            <td class="px-4 py-3">${u.is_verified
              ? badge('Verified', 'bg-emerald-100 text-emerald-700')
              : badge('Unverified', 'bg-amber-100 text-amber-700')}</td>
            <td class="px-4 py-3">${badge(u.status, STATUS_STYLES[u.status] || 'bg-slate-100 text-slate-600')}</td>
            <td class="px-4 py-3 text-slate-600">${escapeHtml(u.login_count || 0)}</td>
            <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title="${escapeHtml(u.last_login_ip || '')}">${escapeHtml(when(u.last_login_at))}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                ${isSelf ? '<span class="text-xs text-slate-400">—</span>' : `
                  <select data-role-for="${escapeHtml(u._id)}" class="rounded-xl border border-slate-300 px-2 py-1.5 text-xs focus:border-rose-500 focus:outline-none">
                    ${['buyer', 'seller', 'delivery', 'user', 'super_admin'].map((r) =>
                      `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
                  </select>
                  <button type="button" data-set-role="${escapeHtml(u._id)}" data-name="${escapeHtml(u.email)}"
                    class="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Set</button>
                  ${!u.is_verified ? `
                    <button type="button" data-verify="${escapeHtml(u._id)}" data-name="${escapeHtml(u.email)}"
                      class="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-400">Verify</button>` : ''}
                  <button type="button" data-toggle-suspend="${escapeHtml(u._id)}" data-name="${escapeHtml(u.email)}"
                    data-current="${escapeHtml(u.status)}" data-reason="${escapeHtml(u.suspended_reason || '')}"
                    class="rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition ${suspended ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}">
                    ${suspended ? 'Reinstate' : 'Suspend'}
                  </button>`}
              </div>
            </td>
          </tr>`;
      }).join('');

      bindUserRowEvents();
    }

    setEmptyState('users-empty', 'No users match these filters.', data.users.length > 0);

    renderPager('users-pager', data, () => { usersState.page = data.page > 1 ? data.page - 1 : 1; loadUsers(); },
      () => { usersState.page = data.page < data.pages ? data.page + 1 : data.page; loadUsers(); });
  }

  function bindUserRowEvents() {
    document.querySelectorAll('[data-set-role]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-set-role');
        const name = btn.getAttribute('data-name');
        const select = document.querySelector(`[data-role-for="${id}"]`);
        const nextRole = select ? select.value : '';

        openActionModal({
          title: 'Change role',
          body: `Set ${name} to "${nextRole}". If you are promoting to super admin they will immediately gain full access to every user, order and payment.`,
          confirmLabel: 'Change role',
          danger: nextRole === 'super_admin',
          reason: 'Role change',
          onConfirm: async (reason) => {
            await apiRequest(`/superadmin/users/${id}/role`, {
              method: 'PUT',
              body: JSON.stringify({ role: nextRole, reason })
            });
            toast(`${name} is now ${nextRole}`, 'success');
            await loadUsers();
          }
        });
      };
    });

    document.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-verify');
        const name = btn.getAttribute('data-name');
        openActionModal({
          title: 'Manually verify address',
          body: `Mark ${name} as verified without them receiving a code. Use this only when mail genuinely cannot reach them. This action is recorded in the activity log.`,
          confirmLabel: 'Mark verified',
          placeholder: 'Why verification was done manually',
          onConfirm: async (reason) => {
            await apiRequest(`/superadmin/users/${id}/verify`, {
              method: 'PUT',
              body: JSON.stringify({ reason })
            });
            toast(`${name} marked as verified`, 'success');
            await loadUsers();
          }
        });
      };
    });

    document.querySelectorAll('[data-toggle-suspend]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-toggle-suspend');
        const name = btn.getAttribute('data-name');
        const current = btn.getAttribute('data-current');
        const suspending = current !== 'suspended';

        openActionModal({
          title: suspending ? 'Suspend account' : 'Reinstate account',
          body: suspending
            ? `Suspend ${name}. Every request from their current session will be refused immediately — they are not signed out gracefully, they are locked out.`
            : `Reinstate ${name}. They will be able to sign in again immediately.`,
          confirmLabel: suspending ? 'Suspend' : 'Reinstate',
          danger: suspending,
          askReason: suspending,
          placeholder: suspending ? 'Why this account is being suspended' : '',
          reason: suspending ? '' : 'Reinstated',
          onConfirm: async (reason) => {
            await apiRequest(`/superadmin/users/${id}/status`, {
              method: 'PUT',
              body: JSON.stringify({ status: suspending ? 'suspended' : 'active', reason })
            });
            toast(`${name} ${suspending ? 'suspended' : 'reinstated'}`, 'success');
            await loadUsers();
          }
        });
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Stores
  // ---------------------------------------------------------------------------

  async function loadStores() {
    const status = document.getElementById('stores-status')?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const data = await apiRequest(`/superadmin/stores?${params.toString()}`);
    const host = document.getElementById('stores-list');
    const emptyEl = document.getElementById('stores-empty');
    if (!host) return;

    if (!data.stores.length) {
      host.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = 'No stores match this filter.';
        emptyEl.classList.remove('hidden');
      }
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    host.innerHTML = data.stores.map((s) => {
      const owner = s.owner_id || {};
      return `
        <div class="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate font-bold text-slate-900">${escapeHtml(s.store_name)}</h3>
              <p class="truncate text-xs text-slate-500">/${escapeHtml(s.store_slug || '')}</p>
            </div>
            ${badge(s.status, STATUS_STYLES[s.status] || 'bg-slate-100 text-slate-600')}
          </div>
          <p class="mt-3 text-sm text-slate-600">
            Owner: <span class="font-medium text-slate-900">${escapeHtml(owner.name || 'Unknown')}</span>
            <br><span class="text-xs text-slate-500">${escapeHtml(owner.email || '—')}</span>
          </p>
          ${owner.is_verified === false ? '<p class="mt-2 text-xs font-semibold text-amber-700">Owner has not verified their email.</p>' : ''}
          <div class="mt-4 flex flex-wrap gap-2">
            ${['active', 'suspended', 'pending_review'].filter((st) => st !== s.status).map((st) => `
              <button type="button" data-store-status="${escapeHtml(s._id)}" data-next="${escapeHtml(st)}" data-name="${escapeHtml(s.store_name)}"
                class="rounded-xl px-3 py-1.5 text-xs font-semibold transition ${st === 'active'
                  ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}">
                ${st === 'active' ? 'Approve' : st === 'suspended' ? 'Suspend' : 'Send to review'}
              </button>`).join('')}
          </div>
          <p class="mt-3 text-xs text-slate-400">Created ${escapeHtml(when(s.created_at))}</p>
        </div>`;
    }).join('');

    document.querySelectorAll('[data-store-status]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-store-status');
        const next = btn.getAttribute('data-next');
        const name = btn.getAttribute('data-name');
        try {
          await apiRequest(`/superadmin/stores/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: next })
          });
          toast(`${name} set to ${next.replace('_', ' ')}`, 'success');
          await loadStores();
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  const ordersState = { page: 1, limit: 25, q: '', status: '', payment_status: '' };

  async function loadOrders() {
    const params = new URLSearchParams({ page: ordersState.page, limit: ordersState.limit });
    if (ordersState.q) params.set('q', ordersState.q);
    if (ordersState.status) params.set('status', ordersState.status);
    if (ordersState.payment_status) params.set('payment_status', ordersState.payment_status);

    const data = await apiRequest(`/superadmin/orders?${params.toString()}`);
    const host = document.getElementById('orders-rows');

    if (!host) return;
    host.innerHTML = data.orders.length ? data.orders.map((o) => {
      const buyer = o.buyer_id || {};
      const seller = o.seller_id || {};
      const store = o.store_id || {};
      return `
        <tr class="hover:bg-slate-50">
          <td class="whitespace-nowrap px-4 py-3"><code class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">${escapeHtml(o.order_reference || '—')}</code></td>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-900">${escapeHtml(buyer.name || '—')}</p>
            <p class="text-xs text-slate-500">${escapeHtml(buyer.email || '')}</p>
          </td>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-900">${escapeHtml(seller.name || '—')}</p>
            <p class="text-xs text-slate-500">${escapeHtml(store.store_name || '')}</p>
          </td>
          <td class="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">${escapeHtml(money(o.total))}</td>
          <td class="px-4 py-3">${badge(o.payment_status, PAYMENT_STYLES[o.payment_status] || 'bg-slate-100 text-slate-600')}</td>
          <td class="px-4 py-3">${badge(o.order_status, STATUS_STYLES[o.order_status] || 'bg-slate-100 text-slate-600')}</td>
          <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title="${escapeHtml(dateTime(o.created_at))}">${escapeHtml(when(o.created_at))}</td>
        </tr>`;
    }).join('') : '';

    setEmptyState('orders-empty', 'No orders match these filters.', data.orders.length > 0);

    renderPager('orders-pager', data, () => { ordersState.page = data.page > 1 ? data.page - 1 : 1; loadOrders(); },
      () => { ordersState.page = data.page < data.pages ? data.page + 1 : data.page; loadOrders(); });
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  const paymentsState = { page: 1, limit: 25, q: '', status: '' };

  async function loadPayments() {
    const params = new URLSearchParams({ page: paymentsState.page, limit: paymentsState.limit });
    if (paymentsState.q) params.set('q', paymentsState.q);
    if (paymentsState.status) params.set('status', paymentsState.status);

    const data = await apiRequest(`/superadmin/payments?${params.toString()}`);

    document.getElementById('payments-tiles').innerHTML = [
      tile('Settled volume', money(data.settled_volume), 'Successful transactions only'),
      tile('Platform commission', money(data.settled_commission), 'Across all sellers'),
      tile('Transactions', data.total, 'Matching current filters'),
      tile('Page', `${data.page} of ${data.pages}`, 'Newest first')
    ].join('');

    const host = document.getElementById('payments-rows');
    if (!host) return;

    host.innerHTML = data.transactions.length ? data.transactions.map((t) => {
      const buyer = t.buyer_id || {};
      // One checkout can settle for several sellers, so the stores come from
      // split_details rather than a single store_id the record does not have.
      const names = (t.split_details || [])
        .map((s) => s.store_id && s.store_id.store_name)
        .filter(Boolean);
      const storeLabel = names.length ? [...new Set(names)].join(', ') : 'Platform';
      return `
        <tr class="hover:bg-slate-50">
          <td class="whitespace-nowrap px-4 py-3"><code class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">${escapeHtml(t.parent_transaction_id)}</code></td>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-900">${escapeHtml(buyer.name || '—')}</p>
            <p class="text-xs text-slate-500">${escapeHtml(buyer.email || '')}</p>
          </td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(storeLabel)}</td>
          <td class="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">${escapeHtml(money(t.total_amount, t.currency))}</td>
          <td class="whitespace-nowrap px-4 py-3 text-sm text-emerald-700">${escapeHtml(money(t.platform_commission_total, t.currency))}</td>
          <td class="px-4 py-3 text-xs text-slate-600">${escapeHtml((t.payment_method || '').replace('_', ' '))}</td>
          <td class="px-4 py-3">${badge(t.gateway_status, PAYMENT_STYLES[t.gateway_status] || 'bg-slate-100 text-slate-600')}</td>
          <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title="${escapeHtml(dateTime(t.created_at))}">${escapeHtml(when(t.created_at))}</td>
        </tr>`;
    }).join('') : '';

    setEmptyState('payments-empty', 'No transactions match these filters.', data.transactions.length > 0);

    renderPager('payments-pager', data, () => { paymentsState.page = data.page > 1 ? data.page - 1 : 1; loadPayments(); },
      () => { paymentsState.page = data.page < data.pages ? data.page + 1 : data.page; loadPayments(); });
  }

  // ---------------------------------------------------------------------------
  // Support inbox
  //
  // Behaviour carried over from admin-panel.js, which was already working.
  // ---------------------------------------------------------------------------

  const inboxState = { inquiries: [], selectedId: null, q: '', status: '' };

  async function loadInbox() {
    const [stats, list] = await Promise.all([
      apiRequest('/superadmin/contact-inquiries/stats'),
      apiRequest('/superadmin/contact-inquiries?status=' + encodeURIComponent(inboxState.status) + '&q=' + encodeURIComponent(inboxState.q))
    ]);

    const byStatus = stats.by_status || {};
    const byEmail = stats.by_email_status || {};

    document.getElementById('inbox-summary').innerHTML = [
      tile('Open', (byStatus.new || 0) + (byStatus.in_progress || 0), 'New plus in progress'),
      tile('New', byStatus.new || 0, 'Awaiting a first reply'),
      tile('In progress', byStatus.in_progress || 0, 'Being handled'),
      tile('Resolved', byStatus.resolved || 0, 'Closed out'),
      tile('Never emailed', byEmail.not_configured || 0, 'Arrived while the relay was down')
    ].join('');

    inboxState.inquiries = list.inquiries || [];
    renderInboxList();
  }

  function renderInboxList() {
    const host = document.getElementById('inbox-list');
    const empty = document.getElementById('inbox-empty');
    if (!host) return;

    if (!inboxState.inquiries.length) {
      host.innerHTML = '';
      if (empty) {
        empty.textContent = 'No inquiries match this filter.';
        empty.classList.remove('hidden');
      }
      return;
    }

    if (empty) empty.classList.add('hidden');

    host.innerHTML = inboxState.inquiries.map((i) => {
      const selected = i._id === inboxState.selectedId;
      const mail = EMAIL_STATUS_STYLES[i.email_status];
      return `
        <button type="button" data-inquiry="${escapeHtml(i._id)}"
          class="inbox-row block w-full border-b border-slate-100 p-4 text-left transition ${selected ? 'bg-slate-50' : 'hover:bg-slate-50'}">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate font-semibold text-slate-900">${escapeHtml(i.name)}</p>
            ${badge(i.status, INQUIRY_STATUS_STYLES[i.status] || 'bg-slate-100 text-slate-600')}
          </div>
          <p class="truncate text-xs text-slate-500">${escapeHtml(i.email)}</p>
          <p class="mt-1 truncate text-sm text-slate-700">${escapeHtml(i.subject || '(no subject)')}</p>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-xs text-slate-400">${escapeHtml(when(i.created_at))}</span>
            ${mail ? `<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${escapeHtml(mail.classes)}">${escapeHtml(mail.label)}</span>` : ''}
          </div>
        </button>`;
    }).join('');

    document.querySelectorAll('[data-inquiry]').forEach((row) => {
      row.onclick = () => {
        inboxState.selectedId = row.getAttribute('data-inquiry');
        renderInboxList();
        renderInboxDetail(inboxState.inquiries.find((i) => i._id === inboxState.selectedId));
      };
    });
  }

  function renderInboxDetail(inquiry) {
    const host = document.getElementById('inbox-detail');
    if (!host) return;

    if (!inquiry) {
      host.innerHTML = '<p class="px-6 py-16 text-center text-sm text-slate-500">Select an inquiry to read it.</p>';
      return;
    }

    const mail = EMAIL_STATUS_STYLES[inquiry.email_status];
    const setStatus = (status) => async () => {
      try {
        const data = await apiRequest(`/superadmin/contact-inquiries/${inquiry._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
        });
        // Merge in place so the list and the detail pane cannot disagree.
        const index = inboxState.inquiries.findIndex((i) => i._id === inquiry._id);
        if (index !== -1) inboxState.inquiries[index] = data.inquiry;
        renderInboxList();
        renderInboxDetail(data.inquiry);
        loadInboxSummaryOnly();
        toast('Inquiry updated', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    host.innerHTML = `
      <div class="p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900">${escapeHtml(inquiry.subject || 'No subject')}</h2>
            <p class="mt-1 text-sm text-slate-600">
              ${escapeHtml(inquiry.name)} · <a href="mailto:${escapeHtml(inquiry.email)}" class="text-rose-600 hover:underline">${escapeHtml(inquiry.email)}</a>
            </p>
            <p class="mt-1 text-xs text-slate-500">Reference ${escapeHtml(inquiry.reference_id)} · ${escapeHtml(dateTime(inquiry.created_at))}</p>
          </div>
          <div class="flex flex-col items-end gap-2">
            ${badge(inquiry.status, INQUIRY_STATUS_STYLES[inquiry.status] || 'bg-slate-100 text-slate-600')}
            ${mail ? `<span class="rounded-full px-3 py-1 text-xs font-semibold ring-1 ${escapeHtml(mail.classes)}">${escapeHtml(mail.label)}</span>` : ''}
          </div>
        </div>

        ${inquiry.email_status === 'not_configured' ? `
          <div class="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
            This arrived while no mail relay was configured, so the customer never got a confirmation. Follow up directly.
          </div>` : ''}

        <p class="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">${escapeHtml(inquiry.message)}</p>

        <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Source IP</dt><dd class="mt-0.5 text-slate-800">${escapeHtml(inquiry.ip || '—')}</dd></div>
          <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Linked account</dt><dd class="mt-0.5 break-all text-slate-800">${escapeHtml(inquiry.user_id || 'not signed in')}</dd></div>
        </dl>

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <a href="tel:${escapeHtml((inquiry.phone || '').replace(/[^\d+]/g, ''))}"
            class="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <i data-lucide="phone" class="h-4 w-4"></i> Call
          </a>
          <a href="mailto:${escapeHtml(inquiry.email)}?subject=${encodeURIComponent('Re: ' + (inquiry.subject || 'Your enquiry'))}"
            class="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
            <i data-lucide="mail" class="h-4 w-4"></i> Reply by email
          </a>
          <span class="flex-1"></span>
          ${INQUIRY_STATUSES.filter((s) => s !== inquiry.status).map((s) => `
            <button type="button" data-inquiry-status="${s}"
              class="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Mark ${s.replace('_', ' ')}
            </button>`).join('')}
        </div>
      </div>`;

    host.querySelectorAll('[data-inquiry-status]').forEach((btn) => {
      btn.onclick = setStatus(btn.getAttribute('data-inquiry-status'));
    });

    if (window.lucide) window.lucide.createIcons();
  }

  /** Refresh only the tiles after a status change, avoiding a full reload that
   *  would discard the customer's open detail pane. */
  async function loadInboxSummaryOnly() {
    try {
      const stats = await apiRequest('/superadmin/contact-inquiries/stats');
      const byStatus = stats.by_status || {};
      const byEmail = stats.by_email_status || {};
      document.getElementById('inbox-summary').innerHTML = [
        tile('Open', (byStatus.new || 0) + (byStatus.in_progress || 0), 'New plus in progress'),
        tile('New', byStatus.new || 0, 'Awaiting a first reply'),
        tile('In progress', byStatus.in_progress || 0, 'Being handled'),
        tile('Resolved', byStatus.resolved || 0, 'Closed out'),
        tile('Never emailed', byEmail.not_configured || 0, 'Arrived while the relay was down')
      ].join('');
    } catch (err) {
      /* the pane already told the user; do not overwrite it */
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  const loaders = {
    overview: loadOverview,
    activity: loadActivity,
    users: loadUsers,
    stores: loadStores,
    orders: loadOrders,
    payments: loadPayments,
    inbox: loadInbox
  };

  /** Debounce so typing in a search box does not fire a request per keystroke. */
  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function bindEvents() {
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.onclick = () => showView(btn.getAttribute('data-view'));
    });

    // The overview's "View all" and security-banner buttons.
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-goto-view]');
      if (!trigger) return;
      if (e.target.getAttribute('data-outcome') === undefined && e.target.closest('#security-banner')) {
        activityState.outcome = 'failure';
        const select = document.getElementById('outcome-filter');
        if (select) select.value = 'failure';
      }
      showView(trigger.getAttribute('data-goto-view'));
    });

    const search = debounce(() => { activityState.page = 1; loadActivity(); }, 300);
    document.getElementById('activity-search').oninput = (e) => { activityState.q = e.target.value.trim(); search(); };
    document.getElementById('action-filter').onchange = (e) => { activityState.action = e.target.value; activityState.page = 1; loadActivity(); };
    document.getElementById('outcome-filter').onchange = (e) => { activityState.outcome = e.target.value; activityState.page = 1; loadActivity(); };

    const userSearch = debounce(() => { usersState.page = 1; loadUsers(); }, 300);
    document.getElementById('users-search').oninput = (e) => { usersState.q = e.target.value.trim(); userSearch(); };
    document.getElementById('users-role').onchange = (e) => { usersState.role = e.target.value; usersState.page = 1; loadUsers(); };
    document.getElementById('users-status').onchange = (e) => { usersState.status = e.target.value; usersState.page = 1; loadUsers(); };
    document.getElementById('users-verified').onchange = (e) => { usersState.verified = e.target.value; usersState.page = 1; loadUsers(); };

    document.getElementById('stores-status').onchange = () => loadStores();

    const orderSearch = debounce(() => { ordersState.page = 1; loadOrders(); }, 300);
    document.getElementById('orders-search').oninput = (e) => { ordersState.q = e.target.value.trim(); orderSearch(); };
    document.getElementById('orders-status').onchange = (e) => { ordersState.status = e.target.value; ordersState.page = 1; loadOrders(); };
    document.getElementById('orders-payment').onchange = (e) => { ordersState.payment_status = e.target.value; ordersState.page = 1; loadOrders(); };

    const paymentSearch = debounce(() => { paymentsState.page = 1; loadPayments(); }, 300);
    document.getElementById('payments-search').oninput = (e) => { paymentsState.q = e.target.value.trim(); paymentSearch(); };
    document.getElementById('payments-status').onchange = (e) => { paymentsState.status = e.target.value; paymentsState.page = 1; loadPayments(); };

    const inboxSearch = debounce(() => loadInbox(), 300);
    document.getElementById('inbox-search').oninput = (e) => { inboxState.q = e.target.value.trim(); inboxSearch(); };
    document.getElementById('inbox-status').onchange = (e) => { inboxState.status = e.target.value; loadInbox(); };

    // Escape closes the action dialog, matching the notification dropdown.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = document.getElementById('action-modal');
      if (modal && !modal.classList.contains('hidden')) closeActionModal();
    });

    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function showAccessGate(message) {
    document.getElementById('dashboard-content').classList.add('hidden');
    const gate = document.getElementById('access-gate');
    gate.classList.remove('hidden');
    if (message) document.getElementById('access-gate-message').textContent = message;
  }

  async function init() {
    if (!document.getElementById('view-nav')) return;

    const me = getSessionUser();
    if (me && (me.name || me.email)) {
      const nameEl = document.getElementById('header-name');
      const emailEl = document.getElementById('header-email');
      if (nameEl) nameEl.textContent = me.name || me.email;
      if (emailEl) emailEl.textContent = me.email || '';
      // Shipped hidden so the header never flashed "undefined" before the
      // session was read; reveal it now that there is something to show.
      const identity = document.getElementById('header-identity');
      if (identity) identity.classList.remove('hidden');
    }

    // Early exit for a signed-out visitor. The server still decides; this only
    // avoids a pointless 401 round trip.
    if (!getToken()) {
      showAccessGate('You are not signed in. Sign in with a super admin account to view the dashboard.');
      return;
    }

    try {
      // One call proves access before the UI opens, and doubles as a cheap
      // check that the API and this page are pointed at the same backend.
      await apiRequest('/superadmin/overview');
    } catch (err) {
      if (err.gate) {
        showAccessGate(err.message);
        return;
      }
      showAccessGate('Could not reach the API. Is the backend running? (' + (err.message || 'unknown error') + ')');
      return;
    }

    document.getElementById('access-gate').classList.add('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');

    bindEvents();
    showView(location.hash.slice(1) || 'overview');
  }

  /**
   * Clear the session and return to the storefront's sign-in screen.
   *
   * The dashboard had no way out: the only header link pointed back to the store,
   * and the store's sign-out lives inside the navigation drawer, so a super admin
   * who landed on admin.html directly had no visible way to end the session.
   *
   * Both storages are cleared, matching handleLogout() in ui.js. Leaving
   * sessionStorage populated would keep a valid token on a shared machine even
   * though the visible session appeared to be gone.
   */
  function signOut() {
    try {
      localStorage.removeItem('els_token');
      localStorage.removeItem('els_user');
      sessionStorage.removeItem('els_token');
      sessionStorage.removeItem('els_user');
    } catch (e) {
      /* storage disabled (private mode); the redirect below still ends the visit */
    }

    const gate = document.getElementById('access-gate');
    if (gate) gate.classList.remove('hidden');

    // Back to the storefront, not a bare page reload, so the user lands on the
    // sign-in form rather than on this page's access gate again.
    window.location.href = 'index.html';
  }

  window.superAdmin = {
    refresh() {
      const view = VIEWS.find((v) => {
        const panel = document.querySelector(`[data-view-panel="${v}"]`);
        return panel && !panel.classList.contains('hidden');
      });
      if (view && loaders[view]) {
        loaders[view]().catch((err) => {
          if (!err.gate) toast(err.message, 'error');
        });
      }
    },
    signOut,
    closeActionModal,
    showView
  };

  document.addEventListener('DOMContentLoaded', init);
})();

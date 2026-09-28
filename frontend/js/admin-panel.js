/**
 * Support Inbox
 *
 * Admin-side view over GET /api/admin/contact-inquiries. Every inquiry
 * submitted through the storefront contact form is stored in MongoDB, so this
 * is the authoritative record: it still shows messages whose email delivery
 * failed, which the inbox copy alone would have lost.
 *
 * Access is decided by the server. The stored role is only used to decide
 * whether to render an "access denied" message early; a 403 from the API is
 * what actually gates the data.
 */

const INQUIRY_STATUSES = ['new', 'in_progress', 'resolved', 'spam'];

const INQUIRY_STATUS_STYLES = {
  new: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  spam: 'bg-slate-200 text-slate-600',
};

// Mail outcome is surfaced separately from workflow status: an inquiry can be
// "resolved" while its email never arrived, and staff still need to know that.
const EMAIL_STATUS_STYLES = {
  sent: { label: 'Emailed', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: 'Email failed', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
  not_configured: { label: 'Relay down', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

class SupportInbox {
  constructor() {
    this.filters = { status: '', q: '' };
    this.inquiries = [];
    this.stats = { by_status: {}, by_email_status: {} };
    this.selectedId = null;
    this.searchTimer = null;
    this.statusMessage = '';
    this.statusMessageIsError = false;
  }

  async init() {
    this.cacheElements();
    if (!this.elements.content) return;

    this.bindEvents();
    await Promise.all([this.loadStats(), this.loadInquiries()]);
  }

  cacheElements() {
    const byId = (id) => document.getElementById(id);
    this.elements = {
      content: byId('inbox-content'),
      list: byId('inbox-list'),
      detail: byId('inbox-detail'),
      search: byId('inbox-search'),
      statusFilter: byId('inbox-status'),
      summary: byId('inbox-summary'),
      empty: byId('inbox-empty'),
    };
  }

  bindEvents() {
    const { search, statusFilter } = this.elements;

    if (search) {
      // Debounced so each keystroke does not hit the API.
      search.addEventListener('input', () => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          this.filters.q = search.value.trim();
          this.loadInquiries();
        }, 300);
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.filters.status = statusFilter.value;
        this.loadInquiries();
      });
    }
  }

  /**
   * Reads the session token from whichever store holds it. The storefront
   * supports both "keep me signed in" and per-tab sessions, so a token in
   * sessionStorage must be honoured too.
   */
  getToken() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('els_token')) {
      return localStorage.getItem('els_token');
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('els_token')) {
      return sessionStorage.getItem('els_token');
    }
    return '';
  }

  async apiRequest(endpoint, options = {}) {
    const token = this.getToken();
    if (!token) {
      this.showAccessGate('You are not signed in. Sign in with an admin account to view the support inbox.');
      throw new Error('no-token');
    }

    const base = window.API_BASE || 'http://localhost:8001/api';
    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (res.status === 401) {
      this.showAccessGate('Your session has expired. Sign in again to continue.');
      throw new Error('unauthorized');
    }
    if (res.status === 403) {
      this.showAccessGate('This account does not have admin access.');
      throw new Error('forbidden');
    }

    let payload = {};
    try {
      payload = await res.json();
    } catch (e) {
      payload = {};
    }

    if (!res.ok || payload.success === false) {
      throw new Error(payload.message || `Request failed (${res.status})`);
    }
    return payload;
  }

  async loadStats() {
    try {
      const payload = await this.apiRequest('/admin/contact-inquiries/stats');
      this.stats = {
        by_status: payload.by_status || {},
        by_email_status: payload.by_email_status || {},
      };
    } catch (error) {
      // The list call renders the real error state, so a stats failure is not
      // worth surfacing twice.
      console.warn('Failed to load inquiry stats:', error.message);
    }
  }

  async loadInquiries() {
    const { list, empty } = this.elements;
    if (list) list.innerHTML = this.renderLoadingRows();

    const params = new URLSearchParams();
    if (this.filters.status) params.set('status', this.filters.status);
    if (this.filters.q) params.set('q', this.filters.q);
    const query = params.toString();

    try {
      const payload = await this.apiRequest(`/admin/contact-inquiries${query ? `?${query}` : ''}`);
      this.inquiries = Array.isArray(payload.inquiries) ? payload.inquiries : [];
      this.renderSummary();
      this.renderList();
    } catch (error) {
      if (error.message === 'no-token' || error.message === 'unauthorized' || error.message === 'forbidden') {
        return;
      }
      if (list) {
        list.innerHTML = `<p class="px-4 py-8 text-center text-sm text-rose-600">${this.escapeHtml(error.message)}</p>`;
      }
    } finally {
      if (empty) empty.classList.add('hidden');
    }
  }

  renderSummary() {
    const { summary } = this.elements;
    if (!summary) return;

    const open = (this.stats.by_status.new || 0) + (this.stats.by_status.in_progress || 0);
    const unresolvedMail =
      (this.stats.by_email_status.failed || 0) + (this.stats.by_email_status.not_configured || 0);

    const tiles = [
      { label: 'Open', value: open, tone: open > 0 ? 'text-rose-600' : 'text-slate-900' },
      { label: 'New', value: this.stats.by_status.new || 0, tone: 'text-slate-900' },
      { label: 'In progress', value: this.stats.by_status.in_progress || 0, tone: 'text-slate-900' },
      { label: 'Resolved', value: this.stats.by_status.resolved || 0, tone: 'text-slate-900' },
      { label: 'Never emailed', value: unresolvedMail, tone: unresolvedMail > 0 ? 'text-rose-600' : 'text-slate-900' },
    ];

    summary.innerHTML = tiles
      .map(
        (t) => `
        <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${t.label}</p>
          <p class="mt-1 text-2xl font-bold ${t.tone}">${Number(t.value).toLocaleString()}</p>
        </div>`
      )
      .join('');
  }

  renderList() {
    const { list, empty } = this.elements;
    if (!list) return;

    if (!this.inquiries.length) {
      list.innerHTML = '';
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = this.filters.q || this.filters.status
          ? 'No inquiries match this filter.'
          : 'No inquiries yet. Messages from the contact form will appear here.';
      }
      this.renderDetail(null);
      return;
    }

    if (empty) empty.classList.add('hidden');

    list.innerHTML = this.inquiries
      .map((inq) => {
        const emailBadge = EMAIL_STATUS_STYLES[inq.email_status] || {
          label: inq.email_status || 'unknown',
          classes: 'bg-slate-50 text-slate-600 ring-slate-200',
        };
        const statusClass = INQUIRY_STATUS_STYLES[inq.status] || 'bg-slate-200 text-slate-600';
        const active = inq._id === this.selectedId ? 'bg-rose-50 ring-rose-200' : 'hover:bg-slate-50';

        return `
          <button type="button" data-id="${this.escapeHtml(inq._id)}"
            class="inbox-row w-full border-b border-slate-100 px-4 py-3 text-left ring-1 ring-transparent transition ${active}">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-900">${this.escapeHtml(inq.name)}</p>
                <p class="truncate text-xs text-slate-500">${this.escapeHtml(inq.email)}</p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}">
                ${this.escapeHtml((inq.status || 'new').replace('_', ' '))}
              </span>
            </div>
            <p class="mt-1.5 line-clamp-2 text-xs text-slate-600">${this.escapeHtml(inq.message || '')}</p>
            <div class="mt-2 flex items-center justify-between gap-2">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${emailBadge.classes}">${emailBadge.label}</span>
              <span class="text-[11px] text-slate-400">${this.formatDate(inq.created_at)}</span>
            </div>
          </button>`;
      })
      .join('');

    list.querySelectorAll('.inbox-row').forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedId = row.dataset.id;
        this.statusMessage = '';
        this.statusMessageIsError = false;
        this.renderList();
        this.renderDetail(this.inquiries.find((i) => i._id === this.selectedId) || null);
      });
    });

    // Keep a selection across refreshes so a status change does not blank the
    // reading pane.
    if (this.selectedId && !this.inquiries.some((i) => i._id === this.selectedId)) {
      this.selectedId = null;
    }
    if (!this.selectedId && this.inquiries.length) {
      this.selectedId = this.inquiries[0]._id;
      this.renderList();
    }
    this.renderDetail(this.inquiries.find((i) => i._id === this.selectedId) || null);
  }

  renderDetail(inq) {
    const { detail } = this.elements;
    if (!detail) return;

    if (!inq) {
      detail.innerHTML = '<p class="px-6 py-16 text-center text-sm text-slate-500">Select an inquiry to read it.</p>';
      return;
    }

    const emailBadge = EMAIL_STATUS_STYLES[inq.email_status] || {
      label: inq.email_status || 'unknown',
      classes: 'bg-slate-50 text-slate-600 ring-slate-200',
    };
    const statusClass = INQUIRY_STATUS_STYLES[inq.status] || 'bg-slate-200 text-slate-600';

    detail.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-6">
        <div class="min-w-0">
          <h2 class="text-xl font-bold text-slate-900">${this.escapeHtml(inq.name)}</h2>
          <p class="mt-1 break-all text-sm text-slate-500">${this.escapeHtml(inq.email)}</p>
          <p class="mt-0.5 text-xs text-slate-400">${this.escapeHtml(inq.reference_id || '')}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <span class="rounded-full px-3 py-1 text-xs font-semibold ${statusClass}">
            ${this.escapeHtml((inq.status || 'new').replace('_', ' '))}
          </span>
          <span class="rounded-full px-3 py-1 text-xs font-medium ring-1 ${emailBadge.classes}">${emailBadge.label}</span>
        </div>
      </div>

      <dl class="grid gap-4 border-b border-slate-200 p-6 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</dt>
          <dd class="mt-1 text-sm text-slate-800">${this.escapeHtml(inq.subject || '—')}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</dt>
          <dd class="mt-1 text-sm text-slate-800">${this.formatDate(inq.created_at)}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
          <dd class="mt-1 text-sm text-slate-800">${this.escapeHtml(inq.phone || '—')}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Region</dt>
          <dd class="mt-1 text-sm text-slate-800">${this.escapeHtml(inq.region || 'global')}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Signed in</dt>
          <dd class="mt-1 text-sm text-slate-800">${inq.user_id ? 'Yes, linked to an account' : 'No, guest submission'}</dd>
        </div>
        ${inq.resolved_at ? `
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Resolved</dt>
          <dd class="mt-1 text-sm text-slate-800">${this.formatDate(inq.resolved_at)}</dd>
        </div>` : ''}
      </dl>

      ${inq.email_error ? `
        <div class="mx-6 mt-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
          <p class="font-semibold">This inquiry was not emailed to the support inbox.</p>
          <p class="mt-1 text-xs">Relay said: ${this.escapeHtml(inq.email_error)}</p>
        </div>` : ''}

      <div class="p-6">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</h3>
        <div class="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">${this.escapeHtml(inq.message || '')}</div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <a href="mailto:${this.encodeMailto(inq)}"
            class="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400">
            <i data-lucide="reply" class="h-4 w-4"></i>
            Reply by email
          </a>
          <a href="tel:${this.escapeHtml(String(inq.phone || '').replace(/[^\d+]/g, ''))}"
            class="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <i data-lucide="phone" class="h-4 w-4"></i>
            Call customer
          </a>
        </div>

        <div class="mt-8">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Move to</h3>
          <div class="mt-2 flex flex-wrap gap-2">
            ${INQUIRY_STATUSES.map(
              (s) => `
              <button type="button" data-status="${s}"
                class="rounded-2xl px-4 py-2 text-sm font-semibold transition ${INQUIRY_STATUS_STYLES[s]} ${inq.status === s ? 'ring-2 ring-slate-900' : 'hover:opacity-80'}">
                ${s.replace('_', ' ')}
              </button>`
            ).join('')}
          </div>
          <p id="inbox-status-message" class="mt-2 text-xs text-slate-500"></p>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    detail.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => this.updateStatus(inq, btn.dataset.status));
    });
  }

  async updateStatus(inq, status) {
    this.statusMessage = 'Saving...';
    this.renderStatusMessage();

    try {
      const payload = await this.apiRequest(`/admin/contact-inquiries/${encodeURIComponent(inq._id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      // Update in place so the reading pane reflects the server's response.
      Object.assign(inq, payload.inquiry || { status });
      this.statusMessage = `Marked as ${status.replace('_', ' ')}.`;
      this.statusMessageIsError = false;

      this.renderList();
      // renderList rebuilds the detail pane, so the banner has to be painted
      // again afterwards or the re-render wipes it.
      this.renderStatusMessage();
      this.loadStats();
    } catch (error) {
      this.statusMessage = error.message;
      this.statusMessageIsError = true;
      this.renderStatusMessage();
    }
  }

  /**
   * The confirmation lives outside the rendered markup on purpose: a status
   * change re-renders the detail pane, which would otherwise wipe the message
   * the admin just triggered.
   */
  renderStatusMessage() {
    const el = document.getElementById('inbox-status-message');
    if (!el) return;
    el.textContent = this.statusMessage || '';
    el.className = `mt-2 text-xs ${this.statusMessageIsError ? 'text-rose-600' : 'text-slate-500'}`;
  }

  showAccessGate(message) {
    const { content, list, detail, summary, search, statusFilter } = this.elements;
    [list, detail, summary].forEach((el) => {
      if (el) el.innerHTML = '';
    });
    if (search) search.disabled = true;
    if (statusFilter) statusFilter.disabled = true;

    if (content) {
      content.innerHTML = `
        <div class="rounded-3xl bg-white p-10 text-center ring-1 ring-slate-200">
          <i data-lucide="shield-alert" class="mx-auto h-10 w-10 text-slate-400"></i>
          <h2 class="mt-4 text-xl font-bold text-slate-900">Admin access required</h2>
          <p class="mx-auto mt-2 max-w-md text-sm text-slate-600">${this.escapeHtml(message)}</p>
          <a href="index.html" class="mt-6 inline-block rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Back to the store</a>
        </div>`;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  renderLoadingRows() {
    return Array.from({ length: 4 })
      .map(() => '<div class="border-b border-slate-100 px-4 py-4"><div class="h-3 w-24 animate-pulse rounded bg-slate-200"></div><div class="mt-2 h-3 w-full animate-pulse rounded bg-slate-100"></div></div>')
      .join('');
  }

  encodeMailto(inq) {
    const subject = `Re: ${inq.subject || 'Your support request'} (${inq.reference_id || 'inquiry'})`;
    const body = `\n\n--- Original message ---\nFrom: ${inq.name} <${inq.email}>\n${inq.phone ? `Phone: ${inq.phone}\n` : ''}Region: ${inq.region || 'global'}\n\n${inq.message || ''}`;
    return `${inq.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => map[c]);
  }
}

window.supportInbox = new SupportInbox();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('inbox-content')) {
    window.supportInbox.init();
  }
});

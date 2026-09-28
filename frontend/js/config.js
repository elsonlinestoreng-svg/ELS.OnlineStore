/**
 * API base resolution.
 *
 * Loaded first, before any feature script, so `window.API_BASE` is settled
 * before dataSdk.js and the feature modules read it.
 *
 * In production the API is same-origin (nginx/Caddy terminates /api and proxies
 * it to the Node server), so the default is `location.origin + /api`.
 *
 * That default is wrong for local development, where the static files are
 * served on one port and the API listens on another. Left uncorrected the app
 * POSTs to the static file server, which answers "501 Unsupported method
 * ('POST')" from Python's http.server. So when the page is served from a local
 * dev host on a non-API port, point straight at the API port instead.
 *
 * Override without editing this file by setting window.API_BASE ahead of it,
 * e.g. <script>window.API_BASE = 'https://api.example.com/api';</script>.
 */
(function resolveApiBase() {
  if (window.API_BASE) return;

  const API_PORT = '8001';
  const hostname = location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

  // Already talking to the API port, or opened as a local file: nothing to fix.
  if (!isLocal || location.port === API_PORT || location.protocol === 'file:') {
    window.API_BASE = `${location.origin}/api`;
    return;
  }

  // 0.0.0.0 and friends are not valid hosts to fetch from, so normalise them.
  const target = hostname === '0.0.0.0' ? 'localhost' : hostname;
  window.API_BASE = `http://${target}:${API_PORT}/api`;
})();

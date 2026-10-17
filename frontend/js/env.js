/**
 * Deployment API base.
 *
 * The single place a deployed frontend points at its deployed backend. Loaded
 * before config.js, which honours window.API_BASE when it is already set.
 *
 * - Local development: leave API_BASE_URL empty. config.js points at
 *   http://localhost:8001/api automatically.
 * - Production (Vercel frontend + Render backend): set API_BASE_URL to the
 *   backend's public URL, ending in /api, e.g.
 *   'https://els-online-store.onrender.com/api'
 *
 * Whichever origin is set here must also appear in the backend's CORS_ORIGINS.
 */
(function () {
  var API_BASE_URL = 'https://els-online-store-api.onrender.com/api';
  if (API_BASE_URL) {
    window.API_BASE = API_BASE_URL;
  }
})();

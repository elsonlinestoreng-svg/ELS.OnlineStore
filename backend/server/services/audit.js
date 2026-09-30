const ActivityLog = require('../models/ActivityLog');
const { toObjectId, cleanText } = require('../utils/security');

/**
 * Central activity recorder.
 *
 * Contract: recording an event must NEVER affect the request that triggered
 * it. A failed audit write is logged to stderr and dropped. If this threw, or
 * if the caller had to await it and it rejected, a transient Mongo hiccup
 * would start returning 500s to customers at checkout — the audit trail would
 * be taking the shop down, which is the exact opposite of its purpose.
 *
 * Usage:
 *   const audit = require('../services/audit');
 *   audit.record(req, { action: 'order.paid', description: '...', metadata: {...} });
 *
 * `req.user` is populated by middleware/auth.js when the caller is signed in;
 * when it is absent the event is recorded as anonymous, which is what we want
 * for failed logins and sign-up attempts.
 */

/**
 * Best-effort client IP.
 *
 * `req.ip` is preferred because Express resolves it correctly once
 * `app.set('trust proxy', ...)` is configured from TRUST_PROXY in server.js.
 * The x-forwarded-for fallback covers the case where the app is deployed behind
 * a proxy that the operator has not declared yet.
 */
function clientIp(req) {
  if (!req) return '';
  try {
    if (typeof req.ip === 'string' && req.ip) return req.ip.slice(0, 64);
    const forwarded = req.headers && req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      // Left-most entry is the original client when the proxy appends.
      return forwarded.split(',')[0].trim().slice(0, 64);
    }
  } catch (err) {
    /* fall through */
  }
  return '';
}

function userAgent(req) {
  if (!req || !req.headers) return '';
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 300) : '';
}

/**
 * Record one event.
 *
 * @param {object} req    Express request (may be null for system events)
 * @param {object} event  { action, outcome, entityType, entityId, description, metadata, actor }
 * @returns {Promise<void>} never rejects
 */
async function record(req, event) {
  try {
    if (!event || !event.action) return;

    // Allow an explicit actor override for events emitted before a login
    // (e.g. recording the email that was just used to sign up).
    const actor = event.actor || (req && req.user) || {};
    const actorId = toObjectId(actor.userId || actor._id);

    const doc = {
      actor_id: actorId,
      actor_email: cleanText(actor.email, 254).toLowerCase(),
      actor_role: cleanText(actor.role, 30),
      action: cleanText(event.action, 60),
      outcome: ['success', 'failure', 'denied'].includes(event.outcome) ? event.outcome : 'success',
      entity_type: cleanText(event.entityType, 40),
      entity_id: cleanText(event.entityId, 64),
      description: cleanText(event.description, 300),
      metadata: ActivityLog.sanitizeMetadata(event.metadata),
      ip: cleanText(event.ip, 64) || clientIp(req),
      user_agent: userAgent(req)
    };

    await ActivityLog.create(doc);
  } catch (err) {
    // Swallowed by design. See the contract note at the top of this file.
    console.error('[audit] failed to record event:', err && err.message);
  }
}

/**
 * Record a system event with no HTTP context (scheduled jobs, boot
 * migrations, webhook callbacks with no user).
 */
async function recordSystem(event) {
  return record(null, { ...(event || {}), actor: { email: 'system', role: 'system' } });
}

module.exports = {
  record,
  recordSystem,
  clientIp
};

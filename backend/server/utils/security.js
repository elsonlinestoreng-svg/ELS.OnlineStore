/**
 * Shared security helpers: input escaping, ObjectId validation and
 * ownership comparison utilities used across routes.
 */

const mongoose = require('mongoose');

/**
 * Escape a user-supplied string so it is safe to embed inside a MongoDB
 * $regex. Without this, a search term such as "(a+)+$" is compiled as a
 * regular expression, which allows:
 *   - ReDoS (catastrophic backtracking -> CPU exhaustion / DoS)
 *   - Bypassing intended literal matching
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trim and bound a free-text field, returning '' for non-strings. */
function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, maxLength);
}

/** Return a valid 24-char hex ObjectId string, or null. */
function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

/**
 * Compare two user references safely. Handles the case where a populated
 * document arrives instead of a raw ObjectId (a common source of broken
 * authorisation checks).
 */
function sameUser(a, b) {
  if (!a || !b) return false;
  const idOf = (v) => {
    if (v instanceof mongoose.Types.ObjectId) return v.toString();
    if (v && typeof v === 'object' && v._id) return v._id.toString();
    if (typeof v === 'string') return v;
    return null;
  };
  const left = idOf(a);
  const right = idOf(b);
  return left !== null && right !== null && left === right;
}

/** HTML-escape a value for safe interpolation into an email template. */
function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

module.exports = {
  escapeRegex,
  cleanText,
  toObjectId,
  sameUser,
  escapeHtml,
  isValidEmail,
  EMAIL_RE
};

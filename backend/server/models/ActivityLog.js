const mongoose = require('mongoose');

/**
 * Append-only audit trail.
 *
 * Everything the super admin needs to answer "what happened, who did it, and
 * when" is recorded here: sign-ups, sign-ins, failed sign-ins, verifications,
 * purchases, payments, refunds, store moderation, role changes, suspensions
 * and every super-admin action.
 *
 * Design notes:
 *  - The actor's email and role are DENORMALISED on purpose. If an account is
 *    later deleted or its email changed, the historical entry still shows who
 *    was responsible at the time. A reference that is only a mutable pointer
 *    loses exactly the evidence an audit log exists to preserve.
 *  - There are no update or delete routes for this collection. It is written
 *    by services/audit.js and read by the super admin dashboard.
 *  - `outcome` separates "the action happened" from "the action was refused".
 *    A wall of successful sign-ins hides credential stuffing; the failures are
 *    the interesting rows.
 */
const activityLogSchema = new mongoose.Schema({
  // Who did it. Null for anonymous/system events (failed logins, signup
  // attempts, cron work).
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Snapshot of the actor at the time of the event.
  actor_email: {
    type: String,
    default: '',
    trim: true,
    maxlength: 254
  },
  actor_role: {
    type: String,
    default: '',
    trim: true,
    maxlength: 30
  },

  // Dotted verb_noun key, e.g. "auth.login", "order.paid", "admin.user_suspended".
  // A free string rather than an enum so new call sites cannot be blocked by a
  // forgotten migration, but grouped by prefix in the dashboard.
  action: {
    type: String,
    required: true,
    index: true,
    trim: true,
    maxlength: 60
  },

  outcome: {
    type: String,
    enum: ['success', 'failure', 'denied'],
    default: 'success',
    index: true
  },

  // What the action was about, independent of who did it.
  entity_type: {
    type: String,
    default: '',
    trim: true,
    maxlength: 40,
    index: true
  },
  entity_id: {
    type: String,
    default: '',
    trim: true,
    maxlength: 64
  },

  // Short human-readable summary shown in the activity feed.
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 300
  },

  // Structured extras (amount, currency, reference, role change, reason...).
  // Bounded to a small set of primitives so a caller cannot inject a 16MB blob
  // into the audit collection.
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  ip: {
    type: String,
    default: '',
    trim: true,
    maxlength: 64
  },
  user_agent: {
    type: String,
    default: '',
    trim: true,
    maxlength: 300
  },

  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// The dashboard's default query is "newest first, optionally filtered by
// action prefix and outcome". A compound index keeps that from becoming a
// collection scan as the trail grows.
activityLogSchema.index({ created_at: -1 });
activityLogSchema.index({ action: 1, created_at: -1 });
activityLogSchema.index({ actor_id: 1, created_at: -1 });

/**
 * Bound and sanitise the free-form `metadata` object.
 *
 * Called by services/audit.js rather than trusted from the route, so a route
 * that forwards raw req.body into metadata cannot blow up the write or store
 * unbounded nested structures.
 */
activityLogSchema.statics.sanitizeMetadata = function (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const output = {};
  let count = 0;

  for (const [key, value] of Object.entries(input)) {
    if (count >= 15) break;
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) continue;

    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      output[key] = value.slice(0, 200);
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      output[key] = value;
    } else if (typeof value === 'boolean') {
      output[key] = value;
    }
    // Objects and arrays are dropped on purpose: nested structures are where
    // unbounded growth hides.

    count += 1;
  }

  return output;
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);

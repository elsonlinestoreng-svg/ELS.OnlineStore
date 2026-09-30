/**
 * End-to-end verification for the email-verification gate, the captcha config
 * contract, and the super-admin API boundary.
 *
 * Runs against a real MongoDB and a real server process. Everything it creates
 * is removed in the finally block, so the database is left exactly as found.
 */
const { spawn } = require('child_process');

// Read the URI from the app's own config rather than re-deriving it, so this
// harness can never silently point at a different database than the server.
const MONGO_URI = require('./backend/server/config/env').MONGO_URI;

const BASE = 'http://localhost:8001/api';
const PORT = 8001;

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ' -> ' + detail : ''}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 60s, not 30s: this harness boots against MongoDB Atlas over the public
// internet, and a cold TLS handshake plus the driver's own server-selection
// retry routinely exceeds 30s from a cold start. Timing out early produced a
// "server did not start" failure that had nothing to do with the code.
async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/config/public`);
      if (res.ok) return true;
    } catch (e) { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

(async () => {
  // Kill anything already holding the port so the child can bind.
  try {
    await fetch(BASE.replace('/api', '') + '/api/config/public');
    console.log('A server is already listening on ' + PORT + '. Stop it first.');
    process.exit(1);
  } catch (e) { /* good, port is free */ }

  const server = spawn('node', ['backend/server/server.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // The auth routes share one per-IP budget of 10 per 15 minutes, which is
      // correct for production and far too small for a suite that deliberately
      // makes many sign-in attempts. Widening it here keeps the limiter from
      // deciding the outcome before the behaviour under test is reached.
      AUTH_RATE_LIMIT_MAX: '10000',
      AUTH_RATE_LIMIT_WINDOW_MS: '60000',

      // This suite asserts the BASELINE: no captcha, and the development
      // code fallback. Those two branches are unreachable once real keys are
      // present, so a developer with a working .env would get a red suite that
      // was reporting on their own configuration rather than on the code.
      // Pinned here so the run is identical on every machine. qa_captcha.js
      // covers the keys-present configuration.
      RECAPTCHA_ENABLED: 'false',
      RECAPTCHA_SITE_KEY: '',
      RECAPTCHA_SECRET_KEY: '',
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      FROM_EMAIL: '',
      // The bootstrap must not promote a real account during a test run.
      SUPER_ADMIN_EMAIL: '',
      ADMIN_EMAIL: ''
    }
  });

  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });

  const createdEmails = [];
  // Boot and unauthenticated-failure records carry no actor_email, so they
  // cannot be matched by address. Cleaning by run start time keeps the
  // operator's audit trail free of harness noise across repeated runs.
  const runStartedAt = new Date(Date.now() - 5000);

  try {
    console.log('\n--- boot ---');
    const up = await waitForServer();
    check('server boots and serves /api/config/public', up, serverLog.slice(-400));
    if (!up) throw new Error('server did not start');

    // ---------------------------------------------------------------- config
    console.log('\n--- public config contract ---');
    const cfg = await api('/config/public');
    check('config returns 200', cfg.status === 200, `got ${cfg.status}`);
    const c = cfg.body.config || {};
    check('config.recaptcha_enabled is a boolean', typeof c.recaptcha_enabled === 'boolean', String(c.recaptcha_enabled));
    check('config.recaptcha_site_key is a string', typeof c.recaptcha_site_key === 'string');
    check('config exposes no secret key', !JSON.stringify(cfg.body).match(/RECAPTCHA_SECRET|secret_key/i), 'secret leaked in public config');
    check('config omits smtp password', !JSON.stringify(cfg.body).match(/SMTP_PASS|smtp_pass/i), 'smtp password leaked in public config');
    check('config reports email_verification_required', typeof c.email_verification_required === 'boolean', String(c.email_verification_required));
    check('captcha disabled without keys', c.recaptcha_enabled === false, String(c.recaptcha_enabled));

    // The three SMTP facts must stay distinguishable. The original single
    // 'smtp_configured' flag was true whenever three strings were non-empty,
    // which is exactly the state in which the provider rejects the password —
    // so the storefront promised emails that were never sent.
    check('config reports smtp_configured', typeof c.smtp_configured === 'boolean', String(c.smtp_configured));
    check('config reports smtp_checked', typeof c.smtp_checked === 'boolean', String(c.smtp_checked));
    check('config reports smtp_reachable as bool or null', c.smtp_reachable === null || typeof c.smtp_reachable === 'boolean', String(c.smtp_reachable));
    check('an unchecked relay is null, not false', c.smtp_checked === false ? c.smtp_reachable === null : true, `checked=${c.smtp_checked} reachable=${c.smtp_reachable}`);
    check('smtp_error is an empty string or a known category', ['', 'not_configured', 'auth', 'unreachable'].includes(c.smtp_error), JSON.stringify(c.smtp_error));
    check('a checked-and-ok relay reports no error', c.smtp_reachable === true ? c.smtp_error === '' : true, `${c.smtp_reachable} / ${c.smtp_error}`);
    check('a checked-and-failed relay names a category', c.smtp_checked && c.smtp_reachable === false ? c.smtp_error !== '' : true, `${c.smtp_error}`);
    check('config does not leak the smtp host', !JSON.stringify(cfg.body).match(/SMTP_HOST|smtp_host/i), 'smtp host leaked in public config');
    check('config does not leak a smtp user or from address', !JSON.stringify(cfg.body).match(/SMTP_USER|SMTP_FROM|smtp_user|smtp_from/i), 'smtp identity leaked in public config');

    // ------------------------------------------------- register -> verify -> login
    console.log('\n--- registration, verification, login ---');
    const stamp = Date.now();
    const email = `qa.superadmin.${stamp}@example.test`;
    createdEmails.push(email);
    const password = 'Qa!Passw0rd123';

    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Super Admin', email, password, confirmPassword: password })
    });
    check('register returns 201', reg.status === 201, `got ${reg.status}: ${JSON.stringify(reg.body).slice(0, 160)}`);
    check('register issues no session token', !reg.body.token && !reg.body.data?.token, 'token returned before verification');
    check('register sets requires_verification', reg.body.requires_verification === true, JSON.stringify(reg.body).slice(0, 160));
    check('register reports delivery state', typeof reg.body.email_delivered === 'boolean', String(reg.body.email_delivered));

    const devCode = reg.body.dev_code;
    check('development fallback exposes a code', Boolean(devCode), 'no dev_code in response');

    // Unverified login must be refused.
    const early = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    check('unverified login is refused', early.status === 403, `got ${early.status}`);
    check('unverified login returns no token', !early.body.token, 'token issued to an unverified account');
    check('unverified login echoes the address to verify', early.body.email === email, String(early.body.email));
    // This run has no relay configured, so the block must NOT claim delivery
    // failed — that would send a customer chasing an operator for a problem the
    // operator does not have. The dev_code is the honest signal here.
    check('unverified login does not claim a delivery failure when the relay is merely unset', early.body.email_delivered !== false, String(early.body.email_delivered));

    // Wrong code must be refused.
    const wrong = await api('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code: '000000' })
    });
    check('wrong verification code is refused', wrong.status === 400 || wrong.status === 401, `got ${wrong.status}`);

    // A wrong password against a real, identified account. This is what should
    // be audited as a failure rather than a denial.
    const wrongPassword = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Wrong!Password999' })
    });
    check('wrong password is refused', wrongPassword.status === 401 || wrongPassword.status === 403, `got ${wrongPassword.status}`);

    const verified = await api('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code: devCode })
    });
    check('correct code verifies the account', verified.status === 200, `got ${verified.status}: ${JSON.stringify(verified.body).slice(0, 160)}`);

    const login = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    check('verified login succeeds', login.status === 200, `got ${login.status}: ${JSON.stringify(login.body).slice(0, 160)}`);
    const token = login.body.token || login.body.data?.token;
    check('verified login returns a token', Boolean(token), 'no token in login response');

    // ------------------------------------------- super admin boundary (as buyer)
    console.log('\n--- super admin boundary ---');
    const forbidden = await api('/superadmin/overview', { token });
    check('non-super-admin gets 403 from overview', forbidden.status === 403, `got ${forbidden.status}`);

    // Grant the role directly, the way the SUPER_ADMIN_EMAIL bootstrap does.
    const mongoose = require('./backend/node_modules/mongoose');
    const User = require('./backend/server/models/User');
      const conn = await mongoose.createConnection(MONGO_URI).asPromise();
    const promoted = await conn.collection('users').updateOne(
      { email },
      { $set: { role: 'super_admin', is_verified: true, status: 'active' } }
    );
    check('test account promoted to super_admin', promoted.modifiedCount === 1, JSON.stringify(promoted));

    // Re-login so the new token carries the elevated role.
    const relogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const adminToken = relogin.body.token || relogin.body.data?.token;
    check('re-login after promotion succeeds', relogin.status === 200, `got ${relogin.status}`);
    check('session now carries super_admin role', relogin.body.user?.role === 'super_admin' || relogin.body.data?.user?.role === 'super_admin', JSON.stringify(relogin.body.user || relogin.body.data?.user));

    const endpoints = [
      ['/superadmin/overview', 'GET', null],
      ['/superadmin/activity?limit=5', 'GET', null],
      ['/superadmin/users?limit=5', 'GET', null],
      ['/superadmin/stores', 'GET', null],
      ['/superadmin/orders?limit=5', 'GET', null],
      ['/superadmin/payments?limit=5', 'GET', null],
      ['/superadmin/contact-inquiries', 'GET', null],
      ['/superadmin/contact-inquiries/stats', 'GET', null],
      ['/superadmin/earnings/platform', 'GET', null]
    ];

    for (const [path, method, body] of endpoints) {
      const r = await api(path, { method, token: adminToken, body: body ? JSON.stringify(body) : undefined });
      check(`super admin GET ${path}`, r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`);
    }

    // Overview shape, which the dashboard reads directly.
    const ov = await api('/superadmin/overview', { token: adminToken });
    const o = ov.body.overview || {};
    check('overview.users.total is a number', typeof o.users?.total === 'number', String(o.users?.total));
    check('overview.payments.gross_revenue is a number', typeof o.payments?.gross_revenue === 'number', String(o.payments?.gross_revenue));
    check('overview.revenue_by_day is an array', Array.isArray(o.revenue_by_day), typeof o.revenue_by_day);
    check('overview.top_sellers is an array', Array.isArray(o.top_sellers), typeof o.top_sellers);
    check('overview.security counters present', typeof o.security?.failed_logins_24h === 'number' && typeof o.security?.failed_captchas_24h === 'number', JSON.stringify(o.security));
    check('overview.recent_activity is an array', Array.isArray(o.recent_activity), typeof o.recent_activity);

    const act = await api('/superadmin/activity?limit=5', { token: adminToken });
    check('activity returns events array', Array.isArray(act.body.events), typeof act.body.events);
    check('activity returns pagination fields', typeof act.body.total === 'number' && typeof act.body.pages === 'number', JSON.stringify({ t: act.body.total, p: act.body.pages }));
    check('activity categories present', Array.isArray(act.body.categories), typeof act.body.categories);

    const usr = await api('/superadmin/users?limit=5', { token: adminToken });
    check('users returns users array', Array.isArray(usr.body.users), typeof usr.body.users);
    const first = (usr.body.users || [])[0];
    check('user rows omit the password hash', first && first.password === undefined, 'password field present in response');
    check('user rows include is_verified and status', first && typeof first.is_verified === 'boolean' && typeof first.status === 'string', JSON.stringify({ v: first?.is_verified, s: first?.status }));

    // Logout / suspended-user enforcement.
    // A well-formed id that matches nothing is a 404, not a 500.
    const missing = await api('/superadmin/users/000000000000000000000000/role', { method: 'PUT', token: adminToken, body: JSON.stringify({ role: 'seller' }) });
    check('well-formed but unknown user id returns 404', missing.status === 404, `got ${missing.status}`);

    // A malformed id must be rejected before it reaches the database.
    const badRole = await api('/superadmin/users/not-an-object-id/role', { method: 'PUT', token: adminToken, body: JSON.stringify({ role: 'seller' }) });
    check('malformed user id is rejected with 400', badRole.status === 400, `got ${badRole.status}`);

    // An invalid role must be refused rather than written.
    const badRoleValue = await api(`/superadmin/users/${(usr.body.users || [])[0]?._id || '000000000000000000000000'}/role`, { method: 'PUT', token: adminToken, body: JSON.stringify({ role: 'superuser' }) });
    check('invalid role value is refused', badRoleValue.status === 400 || badRoleValue.status === 404, `got ${badRoleValue.status}`);

    // A super admin must not be able to demote or suspend themselves away.
    const selfDemote = await api(`/superadmin/users/${(login.body.user || {})._id || 'unknown'}/role`, { method: 'PUT', token: adminToken, body: JSON.stringify({ role: 'buyer' }) });
    check('self-demotion is blocked', selfDemote.status >= 400, `got ${selfDemote.status}`);

    // Transactions must be readable, and must not leak a populated path that
    // the schema never had.
    const pays = await api('/superadmin/payments?limit=5', { token: adminToken });
    check('payments endpoint returns 200', pays.status === 200, `got ${pays.status}`);
    const tx = (pays.body.transactions || [])[0];
    check('transaction rows expose split_details, not a phantom store_id', tx === undefined || (tx.split_details !== undefined && tx.store_id === undefined), JSON.stringify(Object.keys(tx || {})));

    // ------------------------------------------- suspension, captcha disabled
    // Lives here rather than in qa_captcha.js because with the captcha forced
    // on, a login is refused at the captcha gate before the suspension check
    // is ever reached, so the assertion could not distinguish the two.
    console.log('\n--- suspension ---');
    const target = `qa.suspend.${Date.now()}@example.test`;
    createdEmails.push(target);
    const targetPassword = 'Qa!Suspend123';
    const reg2 = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Suspend', email: target, password: targetPassword, confirmPassword: targetPassword })
    });
    await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: target, code: reg2.body.dev_code }) });
    const tLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: target, password: targetPassword }) });
    check('target user can sign in before suspension', tLogin.status === 200, `got ${tLogin.status}`);

    const tUser = tLogin.body.user || (tLogin.body.data && tLogin.body.data.user);
    const suspend = await api(`/superadmin/users/${tUser._id}/status`, {
      method: 'PUT', token: adminToken, body: JSON.stringify({ status: 'suspended', reason: 'qa harness' })
    });
    check('super admin can suspend a user', suspend.status === 200, `got ${suspend.status}: ${JSON.stringify(suspend.body).slice(0, 140)}`);

    const tToken = tLogin.body.token || (tLogin.body.data && tLogin.body.data.token);
    const tAfter = await api('/auth/profile', { token: tToken });
    check('suspended user loses access with the session they already held', tAfter.status === 401 || tAfter.status === 403, `got ${tAfter.status}`);

    const tRelogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: target, password: targetPassword }) });
    check('suspended user cannot sign in again', tRelogin.status === 401 || tRelogin.status === 403, `got ${tRelogin.status}`);
    check('suspension response does not leak a token', !tRelogin.body.token, 'token returned to a suspended user');

    const reinstate = await api(`/superadmin/users/${tUser._id}/status`, {
      method: 'PUT', token: adminToken, body: JSON.stringify({ status: 'active', reason: 'qa harness reinstate' })
    });
    check('super admin can reinstate a user', reinstate.status === 200, `got ${reinstate.status}`);
    check('reinstate response reports the user as active', (reinstate.body.user || {}).status === 'active', JSON.stringify(reinstate.body).slice(0, 140));

    // This harness deliberately makes many sign-in attempts from one IP, so the
    // auth rate limiter is widened above for the run. A 429 would therefore
    // mean the override failed, not that the account is suspended.
    const tAgain = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: target, password: targetPassword }) });
    check('reinstated user can sign in again', tAgain.status === 200, `got ${tAgain.status}: ${JSON.stringify(tAgain.body).slice(0, 120)}`);

    // Legacy /api/admin alias must still resolve.
    const alias = await api('/admin/overview', { token: adminToken });
    check('/api/admin alias still works', alias.status === 200, `got ${alias.status}`);

    // Audit trail should have recorded this session.
    const auditEvents = await api('/superadmin/activity?limit=50', { token: adminToken });
    const actions = (auditEvents.body.events || []).map((e) => e.action);
    check('auth.register was audited', actions.includes('auth.register'), actions.slice(0, 8).join(', '));
    check('auth.verify_email was audited', actions.includes('auth.verify_email'), actions.slice(0, 8).join(', '));
    check('sign-in attempts are audited', actions.includes('auth.login'), 'no auth.login event recorded');

    // The outcome vocabulary is meaningful, so assert the distinction rather
    // than just the presence of a login event:
    //   denied  -> we identified the account and refused on policy (unverified)
    //   failure -> we could not identify them (wrong password)
    const events = auditEvents.body.events || [];
    const denied = events.find((e) => e.action === 'auth.login' && e.outcome === 'denied');
    check('unverified sign-in is audited as denied, not failure', Boolean(denied), JSON.stringify(events.map((e) => `${e.action}:${e.outcome}`)));

    const failure = events.find((e) => e.action === 'auth.login' && e.outcome === 'failure');
    check('wrong-password sign-in is audited as a failure', Boolean(failure), JSON.stringify(events.map((e) => `${e.action}:${e.outcome}`)));

    await conn.close();
  } catch (err) {
    failed += 1;
    failures.push('harness error: ' + err.message);
    console.log('\n  HARNESS ERROR: ' + err.stack);
    if (serverLog) console.log('\n--- server log tail ---\n' + serverLog.slice(-1500));
  } finally {
    // ------------------------------------------------------------------ cleanup
    console.log('\n--- cleanup ---');
    try {
      const mongoose = require('./backend/node_modules/mongoose');
    const conn = await mongoose.createConnection(MONGO_URI).asPromise();
      const users = await conn.collection('users').deleteMany({ email: { $in: createdEmails } });
      console.log(`  removed ${users.deletedCount} test user(s)`);
      const logs = await conn.collection('activitylogs').deleteMany({ actor_email: { $in: createdEmails } });
      console.log(`  removed ${logs.deletedCount} test activity record(s)`);
      const boot = await conn.collection('activitylogs').deleteMany({ created_at: { $gte: runStartedAt }, action: 'system.boot' });
      console.log(`  removed ${boot.deletedCount} boot record(s)`);
      const residual = await conn.collection('activitylogs').countDocuments({ actor_email: /@example\.test$/ });
      console.log(`  residual test-attributed records: ${residual}`);
      await conn.close();
    } catch (e) {
      console.log('  cleanup failed: ' + e.message);
    }

    server.kill('SIGTERM');
    await sleep(600);
    if (!server.killed) server.kill('SIGKILL');

    console.log(`\n================ ${passed} passed, ${failed} failed ================`);
    if (failures.length) {
      console.log('Failed checks:');
      failures.forEach((f) => console.log('  - ' + f));
    }
    process.exit(failed ? 1 : 0);
  }
})();

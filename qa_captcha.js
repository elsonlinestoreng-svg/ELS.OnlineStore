/**
 * Verifies the two enforcement paths that the main suite cannot reach with an
 * unconfigured environment:
 *
 *  1. With reCAPTCHA switched on, register / login / checkout must REFUSE a
 *     request that carries no token. The main suite runs with no keys, so it
 *     only ever proves the "disabled" branch.
 *  2. Suspending a user must invalidate the session they are already holding,
 *     not just block their next login.
 *
 * The server is started with captcha forced on and deliberately fake keys, so
 * Google's verifier is never actually trusted: the assertions here are about
 * the local gate refusing a missing token, which happens before any network
 * call to Google.
 */
const { spawn } = require('child_process');
const MONGO_URI = require('./backend/server/config/env').MONGO_URI;

const BASE = 'http://localhost:8001/api';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; failures.push(label); console.log(`  FAIL  ${label}${detail ? ' -> ' + detail : ''}`); }
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

// See qa_e2e.js: booting against Atlas over the public internet regularly takes
// longer than 30s from cold, and an early timeout fails for reasons unrelated
// to the code under test.
async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(`${BASE}/config/public`)).ok) return true; } catch (e) { /* wait */ }
    await sleep(400);
  }
  return false;
}

(async () => {
  try {
    await fetch(BASE + '/config/public');
    console.log('A server is already listening on 8001. Stop it first.');
    process.exit(1);
  } catch (e) { /* port free */ }

  // Force the captcha on with a secret that is NOT Google's published
  // always-pass test key. That distinction matters: with
  // 6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe, Google returns success:true for
  // literally any token, so an invalid-token test passes for the wrong reason.
  // With a real-shaped but unregistered secret, every outcome is a rejection —
  // invalid-input-secret, a network error, or a timeout — so the assertions
  // below are stable whether or not Google is reachable.
  const server = spawn('node', ['backend/server/server.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      RECAPTCHA_ENABLED: 'true',
      RECAPTCHA_SITE_KEY: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      RECAPTCHA_SECRET_KEY: 'this-is-not-a-registered-secret-key-000000',
      // Same reason as qa_e2e.js: the suite exceeds the shared per-IP auth
      // budget on purpose, so widen it rather than let it mask the behaviour
      // under test.
      AUTH_RATE_LIMIT_MAX: '10000',
      AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      MONGO_URI,
      // Pinned for the same reason as in qa_e2e.js: the suite must not depend
      // on the operator's real credentials. Mail is irrelevant to the captcha
      // assertions, and leaving real SMTP in place would make the run depend on
      // a third party being reachable.
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      FROM_EMAIL: '',
      SUPER_ADMIN_EMAIL: '',
      ADMIN_EMAIL: ''
    }
  });

  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });

  const createdEmails = [];
  // Captcha rejections are audited before authentication, so their records
  // carry no actor_email and cannot be matched by address. Remembering when the
  // run began is the only way to clean them up, otherwise each run leaves
  // behind orphaned "captcha failed" noise in the operator's audit trail.
  const runStartedAt = new Date(Date.now() - 5000);

  try {
    console.log('\n--- boot with captcha forced on ---');
    const up = await waitForServer();
    check('server boots with RECAPTCHA_ENABLED=true and keys', up, serverLog.slice(-500));
    if (!up) throw new Error('server did not start');

    const cfg = await api('/config/public');
    check('public config advertises the captcha as enabled', cfg.body.config?.recaptcha_enabled === true, String(cfg.body.config?.recaptcha_enabled));
    check('public config publishes the site key', typeof cfg.body.config?.recaptcha_site_key === 'string' && cfg.body.config.recaptcha_site_key.length > 0);
    check('public config still hides the secret key', !JSON.stringify(cfg.body).match(/not-a-registered-secret/));

    const stamp = Date.now();
    const email = `qa.captcha.${stamp}@example.test`;
    createdEmails.push(email);
    const password = 'Qa!Passw0rd123';

    console.log('\n--- captcha gate on register ---');
    const noToken = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Captcha', email, password, confirmPassword: password })
    });
    check('register without a captcha token is refused', noToken.status === 403 || noToken.status === 400, `got ${noToken.status}`);
    check('refusal names the captcha', /captcha/i.test(noToken.body.message || ''), JSON.stringify(noToken.body).slice(0, 160));

    const junkToken = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Captcha', email, password, confirmPassword: password, recaptcha_token: 'not-a-real-token' })
    });
    check('register with an invalid captcha token is refused', junkToken.status === 403 || junkToken.status === 400, `got ${junkToken.status}`);

    // Deterministic, network-free rejection: an oversized token is rejected by
    // the service before Google is ever contacted.
    const hugeToken = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Captcha', email, password, confirmPassword: password, recaptcha_token: 'x'.repeat(5000) })
    });
    check('register with an oversized captcha token is refused', hugeToken.status === 403 || hugeToken.status === 400, `got ${hugeToken.status}`);

    // The account must not exist at all: a refused registration must not leave
    // a half-created user behind.
    const mongoose = require('./backend/node_modules/mongoose');
    const conn = await mongoose.createConnection(MONGO_URI).asPromise();
    const ghost = await conn.collection('users').countDocuments({ email });
    check('refused registrations created no user', ghost === 0, `${ghost} user row(s) exist`);

    console.log('\n--- captcha gate on login ---');
    const loginNoToken = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    check('login without a captcha token is refused', loginNoToken.status === 403 || loginNoToken.status === 400, `got ${loginNoToken.status}`);

    console.log('\n--- captcha gate on checkout ---');
    const checkoutNoToken = await api('/checkout', {
      method: 'POST',
      token: 'not.a.valid.token',
      body: JSON.stringify({ payment_method: 'card' })
    });
    // Auth runs first, so an invalid token must fail on identity, not captcha.
    check('checkout with an invalid session is refused', checkoutNoToken.status === 401 || checkoutNoToken.status === 403, `got ${checkoutNoToken.status}`);

    console.log('\n--- suspension lockout ---');
    // Create and verify a real account directly, so the captcha gate does not
    // stand in the way of testing suspension.
    const bcrypt = require('./backend/node_modules/bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    // Clear any residue from an earlier failed run of this harness.
    await conn.collection('users').deleteMany({ email });
    const ins = await conn.collection('users').insertOne({
      name: 'QA Suspend Target',
      email,
      password: hash,
      role: 'buyer',
      is_verified: true,
      status: 'active',
      provider: 'email',
      created_at: new Date(),
      updated_at: new Date()
    });
    check('test user inserted', Boolean(ins.insertedId));

    const good = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, recaptcha_token: 'x' }) });
    check('login is captcha-gated even with a real account', good.status === 403 || good.status === 400, `got ${good.status}`);

    // Mint a session directly so we hold a valid token, then suspend the user.
    const jwt = require('./backend/node_modules/jsonwebtoken');
    const env = require('./backend/server/config/env');
    const sessionToken = jwt.sign({ userId: ins.insertedId.toString() }, env.JWT_SECRET, { expiresIn: '1h' });

    const before = await api('/superadmin/overview', { token: sessionToken });
    check('unelevated session cannot reach super admin', before.status === 403, `got ${before.status}`);

    const me = await api('/auth/profile', { token: sessionToken });
    check('valid session works before suspension', me.status === 200, `got ${me.status}`);

    await conn.collection('users').updateOne({ _id: ins.insertedId }, { $set: { status: 'suspended' } });

    const after = await api('/auth/profile', { token: sessionToken });
    check('suspension invalidates the existing session immediately', after.status === 401 || after.status === 403, `got ${after.status}`);

    // A fresh sign-in cannot be asserted here: with the captcha forced on, the
    // login is refused at the captcha gate before the suspension check runs, so
    // any rejection we could observe here would prove nothing about suspension.
    // That case is covered in qa_e2e.js, which runs with the captcha disabled.

    await conn.close();
  } catch (err) {
    failed += 1;
    failures.push('harness error: ' + err.message);
    console.log('\n  HARNESS ERROR: ' + err.stack);
    console.log('\n--- server log tail ---\n' + serverLog.slice(-1200));
  } finally {
    console.log('\n--- cleanup ---');
    try {
      const mongoose = require('./backend/node_modules/mongoose');
      const conn = await mongoose.createConnection(MONGO_URI).asPromise();
      const u = await conn.collection('users').deleteMany({ email: { $in: createdEmails } });
      console.log(`  removed ${u.deletedCount} test user(s)`);
      const a = await conn.collection('activitylogs').deleteMany({ actor_email: { $in: createdEmails } });
      console.log(`  removed ${a.deletedCount} attributed activity record(s)`);
      const anon = await conn.collection('activitylogs').deleteMany({
        created_at: { $gte: runStartedAt },
        action: /\.captcha_failed$/
      });
      console.log(`  removed ${anon.deletedCount} unattributed captcha-failure record(s)`);
      const boot = await conn.collection('activitylogs').deleteMany({
        created_at: { $gte: runStartedAt },
        action: 'system.boot'
      });
      console.log(`  removed ${boot.deletedCount} boot record(s)`);
      await conn.close();
    } catch (e) { console.log('  cleanup failed: ' + e.message); }

    server.kill('SIGTERM');
    await sleep(600);
    if (!server.killed) server.kill('SIGKILL');

    console.log(`\n================ ${passed} passed, ${failed} failed ================`);
    if (failures.length) { console.log('Failed checks:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(failed ? 1 : 0);
  }
})();

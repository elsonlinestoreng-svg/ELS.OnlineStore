/**
 * Verifies the behaviour that the original production bug hid behind.
 *
 * The defect: config/env.js decided email "was configured" from three non-empty
 * strings. A deployment whose SMTP password had been revoked, mistyped or never
 * activated passed every startup check and reported verification as working,
 * while every verification email bounced. New accounts were created unverified
 * and could never sign in, so the shop was open and unsellable at once — and
 * nothing on any dashboard said so.
 *
 * The two existing suites cannot reach this state, because both deliberately
 * leave SMTP unset:
 *   - qa_e2e.js    asserts the unconfigured branch (dev_code fallback)
 *   - qa_captcha.js blanks SMTP because the captcha is what it is testing
 * Unconfigured is a different failure from configured-and-rejected, and the
 * storefront now has to tell them apart for the customer.
 *
 * Rather than depend on a real provider, this suite stands up a throwaway SMTP
 * server on loopback that greets, advertises AUTH, and then rejects
 * authentication exactly as a real relay does. That makes the 535 path
 * deterministic and offline: the same rejection every run, with no credentials,
 * no third party, and no rate limits. It is the state the production server is
 * in right now, reproduced on purpose.
 */
const { spawn } = require('child_process');
const net = require('net');
const MONGO_URI = require('./backend/server/config/env').MONGO_URI;

const BASE = 'http://localhost:8001/api';
const FAKE_SMTP_PORT = 2525;

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined && detail !== '' ? ' -> ' + detail : ''}`); }
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

/**
 * A minimal SMTP responder that accepts the connection and then refuses the
 * credentials, the way a live relay does.
 *
 * Written by hand rather than pulled from a package on purpose: the test needs
 * one specific failure, and an SMTP library would be a large dependency whose
 * own behaviour could change underneath the assertion.
 */
function startRejectingSmtpServer(port) {
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});

    let inAuth = false;
    socket.write('220 qa.local ESMTP ready\r\n');

    socket.on('data', (chunk) => {
      const lines = chunk.toString().split('\r\n').filter(Boolean);
      for (const line of lines) {
        const upper = line.toUpperCase();

        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          // Offer both mechanisms so the client can pick either; every one of
          // them is rejected below, which is the point of the stub.
          socket.write('250-qa.local\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 10485760\r\n');
        } else if (upper.startsWith('AUTH')) {
          inAuth = true;
          // "AUTH PLAIN <base64>" arrives complete in one line, and "AUTH LOGIN"
          // is followed by a challenge exchange. Handle both: reject inline
          // immediately, otherwise continue the handshake and reject at the
          // password step.
          if (/\s\S+/.test(line.slice(4))) {
            inAuth = false;
            socket.write('535 5.7.8 Authentication failed: invalid credentials\r\n');
          } else {
            socket.write('334 VXNlcm5hbWU6\r\n');
          }
        } else if (inAuth) {
          // First continuation is the base64 username, the second the password.
          if (socket._qaSawUser) {
            socket._qaSawUser = false;
            inAuth = false;
            socket.write('535 5.7.8 Authentication failed: invalid credentials\r\n');
          } else {
            socket._qaSawUser = true;
            socket.write('334 UGFzc3dvcmQ6\r\n');
          }
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else if (upper.startsWith('RSET') || upper.startsWith('NOOP')) {
          socket.write('250 2.0.0 OK\r\n');
        } else {
          socket.write('250 2.0.0 OK\r\n');
        }
      }
    });

    socket.on('close', () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(`${BASE}/config/public`)).ok) return true; } catch (e) { /* wait */ }
    await sleep(400);
  }
  return false;
}

(async () => {
  let smtpServer = null;
  let appServer = null;
  const createdEmails = [];
  const runStartedAt = new Date(Date.now() - 5000);

  try {
    // Claim the port ourselves, so the test cannot pass by talking to whatever
    // else happens to be listening.
    smtpServer = await startRejectingSmtpServer(FAKE_SMTP_PORT);

    try {
      await fetch(BASE + '/config/public');
      console.log('A server is already listening on 8001. Stop it first.');
      process.exit(1);
    } catch (e) { /* port free */ }

    console.log('\n--- boot with a relay that rejects the credentials ---');
    appServer = spawn('node', ['backend/server/server.js'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Every one of these is non-empty. That is the whole point: this is the
        // exact shape of configuration that used to read as "email is working"
        // while nothing was being delivered.
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(FAKE_SMTP_PORT),
        SMTP_SECURE: 'false',
        SMTP_USER: 'qa.sender@qa.local',
        SMTP_PASS: 'xkeysib-a-revoked-key',
        FROM_EMAIL: 'qa.sender@qa.local',
        RECAPTCHA_ENABLED: 'false',
        RECAPTCHA_SITE_KEY: '',
        RECAPTCHA_SECRET_KEY: '',
        AUTH_RATE_LIMIT_MAX: '10000',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
        MONGO_URI,
        // This account is the operator's, not a test fixture, so the bootstrap
        // must not run here.
        SUPER_ADMIN_EMAIL: '',
        ADMIN_EMAIL: ''
      }
    });

    let serverLog = '';
    appServer.stdout.on('data', (d) => { serverLog += d; });
    appServer.stderr.on('data', (d) => { serverLog += d; });

    const up = await waitForServer();
    check('server starts even though the relay rejects auth', up, serverLog.slice(-500));
    if (!up) throw new Error('server did not start');

    // The operator has to be able to tell, from the log alone, that the shop
    // cannot send mail. A bare "535 Authentication failed" is not actionable.
    check('startup log names the relay as unreachable', /SMTP relay: UNREACHABLE/i.test(serverLog), 'no UNREACHABLE line');
    check('startup log explains the credential mistake', /rejected the credentials/i.test(serverLog), 'no hint about SMTP_PASS');

    console.log('\n--- the public config tells the three states apart ---');
    const cfg = await api('/config/public');
    const c = cfg.body.config || {};
    check('config reports smtp_configured', c.smtp_configured === true, String(c.smtp_configured));
    check('config reports the relay was actually checked', c.smtp_checked === true, String(c.smtp_checked));
    check('config reports the relay is not reachable', c.smtp_reachable === false, String(c.smtp_reachable));
    // The specific regression: configured-but-broken used to look identical to
    // working, and every "email is configured" signal in the UI trusted it.
    check('config does NOT claim a working relay', c.smtp_reachable !== true, 'reported reachable');
    check('config categorises the failure as auth', c.smtp_error === 'auth', String(c.smtp_error));
    check('config does not leak the relay password', !JSON.stringify(cfg.body).match(/xkeysib-a-revoked-key/), 'smtp password leaked');
    check('config does not leak the relay host', !JSON.stringify(cfg.body).match(/SMTP_HOST|smtp_host/i), 'smtp host leaked');
    check('config does not leak the sender identity', !JSON.stringify(cfg.body).match(/SMTP_USER|SMTP_FROM|smtp_user|smtp_from/i), 'smtp identity leaked');

    console.log('\n--- registration reports the real delivery state ---');
    const stamp = Date.now();
    const email = `qa.smtp.${stamp}@example.test`;
    createdEmails.push(email);
    const password = 'Qa!Passw0rd123';

    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'QA Relay', email, password, confirmPassword: password })
    });
    check('registration still succeeds (a broken relay must not lose the account)', reg.status === 201, `got ${reg.status}`);
    check('registration reports that mail was NOT delivered', reg.body.email_delivered === false, String(reg.body.email_delivered));
    // Without this, the customer is told to check an inbox that will stay empty
    // and has no way to learn the real reason.
    check('registration withholds the dev code when a relay is configured', !reg.body.dev_code, `dev_code=${reg.body.dev_code}`);
    check('registration still demands verification', reg.body.requires_verification === true, String(reg.body.requires_verification));
    check('registration issues no session token', !reg.body.token, 'token issued to an unverified account');

    console.log('\n--- an unverified sign-in does not promise mail that cannot be sent ---');
    const early = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    check('unverified sign-in is refused', early.status === 403, `got ${early.status}`);
    check('unverified sign-in names the address to verify', early.body.email === email, String(early.body.email));
    // The heart of the original report: a correct password on an unverified
    // account must not dead-end into "check your email" when email is broken.
    check('unverified sign-in reports that no mail was sent', early.body.email_delivered === false, String(early.body.email_delivered));
    check('unverified sign-in issues no token', !early.body.token, 'token issued to an unverified account');

    console.log('\n--- the shop refuses to open for business on a broken relay ---');
    // Development stays non-fatal so the flow remains testable via the printed
    // code. Production must not: every account would be stranded unverified.
    check('development boot is non-fatal despite a rejected relay', up, 'server refused to start in development');
    const isProd = String(process.env.NODE_ENV).toLowerCase() === 'production';
    check('this run is a development boot (the fatal path is opt-in on NODE_ENV)', !isProd, `NODE_ENV=${process.env.NODE_ENV}`);

    console.log('\n--- resend is truthful and does not leak who has an account ---');
    const resend = await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
    check('resend answers the same way for a known address', resend.status === 200, `got ${resend.status}`);
    check('resend reports that nothing was delivered', resend.body.email_delivered === false, String(resend.body.email_delivered));

    const unknown = await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: `qa.nobody.${stamp}@example.test` }) });
    check('resend answer is identical for an unknown address', JSON.stringify(unknown.body) === JSON.stringify(resend.body), 'responses differ and reveal account existence');

    console.log('\n--- cleanup ---');
    // Each step opens its own short-lived connection. A single connection held
    // across all of these is what let an Atlas server-monitor timeout abort
    // cleanup halfway, leaving the suite's own rows behind in a real database.
    const mongoose = require('./backend/node_modules/mongoose');
    const withCollection = async (name, fn) => {
      const conn = await mongoose.createConnection(MONGO_URI).asPromise();
      try { return await fn(conn.collection(name)); }
      finally { await conn.close().catch(() => {}); }
    };

    try {
      const u = await withCollection('users', (c) => c.deleteMany({ email: { $in: createdEmails } }));
      console.log(`  removed ${u.deletedCount} test user(s)`);
    } catch (e) { console.log('  user cleanup failed: ' + e.message); }

    try {
      const a = await withCollection('activitylogs', (c) => c.deleteMany({ actor_email: { $in: createdEmails } }));
      console.log(`  removed ${a.deletedCount} attributed activity record(s)`);
    } catch (e) { console.log('  activity cleanup failed: ' + e.message); }

    try {
      const b = await withCollection('activitylogs', (c) => c.deleteMany({ created_at: { $gte: runStartedAt }, action: 'system.boot' }));
      console.log(`  removed ${b.deletedCount} boot record(s)`);
    } catch (e) { console.log('  boot cleanup failed: ' + e.message); }

    try {
      const residual = await withCollection('users', (c) => c.countDocuments({ email: /@example\.test$/ }));
      check('no test rows left behind', residual === 0, `${residual} row(s) remain`);
    } catch (e) { console.log('  residue check failed: ' + e.message); }
  } catch (err) {
    failed += 1;
    failures.push('harness error: ' + err.message);
    console.log('\n  HARNESS ERROR: ' + err.stack);
  } finally {
    if (appServer) {
      appServer.kill('SIGTERM');
      await sleep(600);
      if (!appServer.killed) appServer.kill('SIGKILL');
    }
    if (smtpServer) {
      smtpServer.close();
    }

    console.log(`\n================ ${passed} passed, ${failed} failed ================`);
    if (failures.length) { console.log('Failed checks:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(failed ? 1 : 0);
  }
})();

/**
 * Frontend DOM checks with no browser required.
 *
 * Scope: the header and navigation shell. These are the controls that decide
 * whether a signed-in customer can get anywhere or leave, so a silent failure
 * there is worse than a cosmetic one — and both bugs fixed in this pass (a
 * drawer toggled twice by two handlers, and a sign-out button with no reachable
 * placement) were invisible to every endpoint-level suite, because they exist
 * entirely in the DOM.
 *
 * jsdom, not a real browser: it parses the shipped index.html, so this asserts
 * against the actual file rather than a copy that can drift. It cannot verify
 * pixels or real reCAPTCHA widget behaviour; those stay browser-only.
 *
 * Run:  npm install && node qa_ui.js
 * jsdom is a devDependency of the root package.json, used only here.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'frontend', 'index.html');

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ' -> ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

/**
 * Load index.html into a DOM with the feature scripts executed but no network.
 *
 * Every <script src> is read from disk and run in order, so load order between
 * ui.js, profile.js and the rest is exercised exactly as a browser would. The
 * CDN bundles (Tailwind, Lucide, Paystack, jsQR) are replaced with no-op stubs
 * because a test must not depend on a third party being online — and because
 * Lucide rewrites <i data-lucide> into <svg>, which would otherwise change the
 * very markup under test.
 */
function buildDom(html) {
  // 'dangerously' is required, not careless: it is what compiles the inline
  // onclick attributes the app actually ships, and handleLogout is only
  // reachable through one. External <script src> tags are NOT fetched — jsdom
  // loads no subresources unless a resource loader is configured — so the CDN
  // bundles and the local js/*.js files below stay offline, and every local
  // script is evaluated by hand in document order instead.
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:8081/index.html',
    pretendToBeVisual: true
  });
  const { window } = dom;

  window.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, config: { recaptcha_enabled: false, recaptcha_site_key: '', email_verification_required: false, smtp_configured: false }, products: [] }),
    json: async () => ({ success: true, config: { recaptcha_enabled: false, recaptcha_site_key: '', email_verification_required: false, smtp_configured: false }, products: [] })
  });

  // Minimal stand-ins. Each is a named no-op so a missing method shows up as a
  // failed assertion rather than a thrown TypeError that aborts the run.
  window.lucide = { createIcons: () => {} };
  window.PaystackPop = {};
  window.jsQR = () => null;
  window.QRCode = function () {};
  window.alert = () => {};
  window.scrollTo = () => {};
  window.console.warn = () => {};

  // Evaluate the app's own scripts in the order index.html declares them, so
  // load-order dependencies between modules are exercised as shipped.
  // One eval for the whole bundle, not one per file. A browser compiles all
  // classic scripts into a single shared global scope, so a top-level
  // `let allProducts` in products.js is visible to ui.js. Evaluating file by
  // file gives each its own scope and manufactures ReferenceErrors that never
  // happen in a browser.
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  const bundle = scripts
    .map((src) => `\n/* ==== ${src} ==== */\n` + fs.readFileSync(path.join(ROOT, 'frontend', src), 'utf8'))
    .join('\n');

  try {
    window.eval(bundle);
  } catch (err) {
    console.log(`  (bundle threw during load: ${err.message})`);
  }

  // Fire DOMContentLoaded the way a browser would once parsing finished: the
  // drawer listeners are registered there, so without this the toggle button
  // would have no handler and every drawer assertion would be vacuous.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  return dom;
}

/** Silent variant of check(), for build-time bookkeeping inside buildDom. */
function check2(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? ' -> ' + detail : ''}`);
  }
}

(async () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  // ------------------------------------------------------------- markup shape
  section('markup: header controls exist');
  {
    const dom = buildDom(html);
    const { document } = dom.window;

    check('hamburger button exists', Boolean(document.getElementById('sidebar-toggle')), 'no #sidebar-toggle');
    check('navigation drawer exists', Boolean(document.getElementById('sidebar')), 'no #sidebar');
    check('drawer backdrop exists', Boolean(document.getElementById('sidebar-overlay')), 'no #sidebar-overlay');

    const signout = document.getElementById('header-signout');
    check('header sign-out button exists', Boolean(signout), 'no #header-signout');
    check('header sign-out calls handleLogout', /handleLogout\s*\(/.test(signout ? signout.getAttribute('onclick') || '' : ''), 'header sign-out is not wired');
    check('header admin link exists', Boolean(document.getElementById('header-admin-link')), 'no #header-admin-link');

    // The bug: an inline onclick on the toggle PLUS a delegated listener fired
    // toggleSidebar twice per click, so the drawer opened and shut in one tick.
    const toggle = document.getElementById('sidebar-toggle');
    const inline = toggle ? (toggle.getAttribute('onclick') || '') : '';
    check('hamburger has no inline onclick (it would double-toggle)', !/toggleSidebar/.test(inline), `onclick="${inline}"`);

    dom.window.close();
  }

  // ------------------------------------------------------------ drawer toggles
  section('behaviour: the drawer actually opens and closes');
  {
    const dom = buildDom(html);
    const { window } = dom;
    const { document } = window;

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');

    check('drawer starts closed', !sidebar.classList.contains('open'), 'drawer was open on load');

    toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('one click opens the drawer', sidebar.classList.contains('open'), 'drawer did not open');
    check('backdrop opens with it', overlay.classList.contains('open'), 'backdrop did not open');
    check('aria-expanded reports open', toggle.getAttribute('aria-expanded') === 'true', toggle.getAttribute('aria-expanded'));

    toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('second click closes it again', !sidebar.classList.contains('open'), 'drawer did not close');
    check('aria-expanded reports closed', toggle.getAttribute('aria-expanded') === 'false', toggle.getAttribute('aria-expanded'));

    // Navigating must close the drawer too.
    toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    window.goTo('shop');
    check('navigating closes the drawer', !sidebar.classList.contains('open'), 'drawer stayed open after goTo');
    check('aria-expanded follows navigation', toggle.getAttribute('aria-expanded') === 'false', toggle.getAttribute('aria-expanded'));

    window.close();
  }

  // ------------------------------------------------------- header chrome state
  section('behaviour: sign-out and admin link follow the session');
  {
    const dom = buildDom(html);
    const { window } = dom;
    const { document } = window;

    const signout = document.getElementById('header-signout');
    const adminLink = document.getElementById('header-admin-link');

    check('sign-out is hidden when signed out', signout.classList.contains('hidden'), 'visible with no session');
    check('admin link is hidden when signed out', adminLink.classList.contains('hidden'), 'visible with no session');

    // A signed-in buyer: sign-out appears, the dashboard does not.
    window.localStorage.setItem('els_token', 'qa.token');
    window.localStorage.setItem('els_user', JSON.stringify({ name: 'Buyer', email: 'buyer@test', role: 'buyer' }));
    window.currentUser = { name: 'Buyer', email: 'buyer@test', role: 'buyer' };
    window.updateHeaderChrome();

    check('sign-out appears once signed in', !signout.classList.contains('hidden'), 'still hidden with a session');
    check('sign-out is laid out again', signout.classList.contains('flex'), 'hidden removed without restoring flex');
    check('admin link stays hidden for a buyer', adminLink.classList.contains('hidden'), 'buyer can see the dashboard link');

    // A super admin sees both.
    window.localStorage.setItem('els_user', JSON.stringify({ name: 'Root', email: 'root@test', role: 'super_admin' }));
    window.currentUser = { name: 'Root', email: 'root@test', role: 'super_admin' };
    window.updateHeaderChrome();

    check('admin link appears for a super admin', !adminLink.classList.contains('hidden'), 'hidden for super_admin');

    // Signing out must clear both stores and hide the controls again.
    window.handleLogout();
    check('logout clears localStorage token', !window.localStorage.getItem('els_token'), 'token survived logout');
    check('logout clears sessionStorage token', !window.sessionStorage.getItem('els_token'), 'session token survived logout');
    check('logout hides the sign-out button', signout.classList.contains('hidden'), 'still visible after logout');
    check('logout hides the admin link', adminLink.classList.contains('hidden'), 'still visible after logout');
    check('logout closes the drawer', !document.getElementById('sidebar').classList.contains('open'), 'drawer left open');

    window.close();
  }

  // ------------------------------------------------- drawer sign-out + escaping
  section("behaviour: the drawer's own sign-out button and escaping");
  {
    const dom = buildDom(html);
    const { window } = dom;
    const { document } = window;

    window.localStorage.setItem('els_token', 'qa.token');
    window.localStorage.setItem('els_user', JSON.stringify({ name: 'Buyer', email: 'b@test', role: 'buyer' }));
    window.currentUser = { name: 'Buyer', email: 'b@test', role: 'buyer' };

    // The drawer carries its own sign-out, so it must exist and be wired.
    const drawerButton = [...document.querySelectorAll('#sidebar button')]
      .find((b) => /handleLogout/.test(b.getAttribute('onclick') || ''));
    check('drawer contains a sign-out button', Boolean(drawerButton), 'no sign-out inside #sidebar');
    check('drawer sign-out is visible in its markup', drawerButton && !drawerButton.classList.contains('hidden'), 'drawer sign-out is hidden');

    // User-controlled text must not be injected as markup by the header badge.
    // persistAuthSession is used rather than assigning window.currentUser: a
    // top-level `let` in a classic script is a script-scoped binding that is
    // NOT mirrored onto window, so only the app's own writer updates both.
    window.persistAuthSession({ name: '<img src=x onerror=alert(1)>', email: 'x@test', role: 'buyer' }, 'qa.token', true);
    window.updateHeaderAvatar();
    const headerName = document.getElementById('header-user-name');
    check('header name is set as text, not markup', headerName && headerName.querySelector('img') === null, 'markup was parsed into the header');
    check('header name matches the raw string', headerName && headerName.textContent === '<img src=x onerror=alert(1)>', headerName && headerName.textContent);

    window.close();
  }

  // ------------------------------------------------------- verification notices
  section('behaviour: verification modal distinguishes an unconfigured relay from a rejected send');
  {
    const dom = buildDom(html);
    const { window } = dom;
    const { document } = window;

    const devNotice = document.getElementById('verify-email-dev-notice');
    const failedNotice = document.getElementById('verify-email-failed-notice');
    check('dev notice exists', Boolean(devNotice), 'no #verify-email-dev-notice');
    check('delivery-failure notice exists', Boolean(failedNotice), 'no #verify-email-failed-notice');

    // Unconfigured relay: the development code is shown, no failure banner.
    window.openVerifyEmailModal('a@test', '123456');
    check('dev notice shows the fallback code', !devNotice.classList.contains('hidden'), 'dev notice hidden');
    check('dev notice displays the code', document.getElementById('verify-email-dev-code').textContent === '123456', 'code not rendered');
    check('failure notice stays hidden with a dev code', failedNotice.classList.contains('hidden'), 'failure notice shown unnecessarily');

    // Configured but rejected: no code, and the customer is told.
    window.openVerifyEmailModal('a@test', undefined, { delivered: false });
    check('dev notice hidden when mail was rejected', devNotice.classList.contains('hidden'), 'dev notice shown with a rejected send');
    check('failure notice shown when mail was rejected', !failedNotice.classList.contains('hidden'), 'customer not told the send failed');

    // Healthy delivery: neither banner.
    window.openVerifyEmailModal('a@test');
    check('no banners on a normal send', devNotice.classList.contains('hidden') && failedNotice.classList.contains('hidden'), 'a banner leaked into the happy path');

    window.close();
  }

  console.log(`\n================ ${passed} passed, ${failed} failed ================`);
  if (failures.length) {
    console.log('Failed checks:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed ? 1 : 0);
})();

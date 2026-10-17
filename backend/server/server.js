require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const authMiddleware = require('./middleware/auth');
const { toObjectId, isValidEmail, cleanText } = require('./utils/security');
const { sendPasswordResetEmail } = require('./utils/mailer');

const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const checkoutRoutes = require('./routes/checkout');
const authRoutes = require('./routes/auth');
const earningsRoutes = require('./routes/earnings');
const paymentRoutes = require('./routes/payment');
const deliveryRoutes = require('./routes/deliveryPartners');
const contactRoutes = require('./routes/contact');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const logisticsRoutes = require('./routes/logistics');
const reviewRoutes = require('./routes/reviews');
const superAdminRoutes = require('./routes/superAdmin');
const configRoutes = require('./routes/config');
const connectDB = require('./config/db');
const User = require('./models/User');
const audit = require('./services/audit');
const { reportSmtpStatus } = require('./utils/mail-verify');
const { start: startReconciliationCron } = require('./services/reconciliation');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

// Rate limiting keys off the real client IP. 'trust proxy' is only safe when
// the app genuinely sits behind exactly one reverse proxy; trusting X-Forwarded-For
// blindly would let any client spoof its address and bypass every limit below.
// TRUST_PROXY is parsed in config/env.js so a numeric hop count works too.
if (env.TRUST_PROXY) {
  app.set('trust proxy', env.TRUST_PROXY);
}

// Auth endpoints share one budget per IP. That is deliberate — splitting the
// budget per route would let an attacker multiply their attempts by cycling
// endpoints — but it has a cost worth naming: the limit is keyed on IP, so
// everyone behind a single carrier-grade NAT or office gateway draws from the
// same 10 attempts. On a busy deployment that locks out legitimate customers
// who never did anything wrong.
//
// The default stays strict. The override exists so an operator who has actually
// hit that failure can widen it knowingly, and so the end-to-end suites can
// exercise the auth flows without the limiter deciding the outcome first.
const AUTH_RATE_LIMIT_MAX = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '', 10);
const AUTH_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '', 10);

const authLimiter = rateLimit({
  windowMs: Number.isFinite(AUTH_RATE_LIMIT_WINDOW_MS) && AUTH_RATE_LIMIT_WINDOW_MS > 0
    ? AUTH_RATE_LIMIT_WINDOW_MS
    : 15 * 60 * 1000,
  max: Number.isFinite(AUTH_RATE_LIMIT_MAX) && AUTH_RATE_LIMIT_MAX > 0
    ? AUTH_RATE_LIMIT_MAX
    : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Slow down.' }
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many uploads. Try again later.' }
});

// CORS: an explicit allowlist. The previous `origin: true` reflected ANY
// origin while allowing credentials, which lets any site on the internet make
// authenticated requests to this API.
const corsOptions = {
  origin(origin, callback) {
    // Same-origin / non-browser callers (curl, mobile app, server-side) send
    // no Origin header.
    if (!origin) return callback(null, true);
    if (env.CORS_ORIGINS.length === 0) {
      return callback(null, env.isProd ? false : true);
    }
    const normalized = origin.replace(/\/+$/, '');
    callback(null, env.CORS_ORIGINS.includes(normalized));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600
};

// CORS must run BEFORE the rate limiters: a 429 generated without
// Access-Control-Allow-Origin surfaces in the browser as an opaque CORS
// failure, hiding the real "Too many attempts" message from the user.
app.use(cors(corsOptions));

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-email', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);
app.use('/api/auth/send-reset', authLimiter);
app.use('/api/auth/reset-complete', authLimiter);
app.use('/api/contact', authLimiter);
app.use('/api/checkout', authLimiter);
app.use('/api/', generalLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (env.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // The stored filename is generated, never derived from user input, so a
    // crafted name cannot traverse directories or smuggle a second extension.
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.png';
    const name = crypto.randomBytes(16).toString('hex') + safeExt;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, GIF, WebP and AVIF images are allowed'));
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Unsupported file extension'));
    }
    cb(null, true);
  }
});

// Requires authentication. This endpoint was previously fully public, which
// let anyone fill the disk and host arbitrary content on your origin.
app.post('/upload', uploadLimiter, authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url });
});

app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '1d',
  // Never let a browser interpret an uploaded file as active content.
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', superAdminRoutes);
app.use('/api/superadmin', superAdminRoutes);

// Liveness/readiness probe. Used by Render's health check and any uptime
// monitor. Intentionally unauthenticated and cheap: it reports process uptime
// and the live Mongo connection state, never any secret.
app.get('/api/health', (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.round(process.uptime()),
    db: dbState,
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Legacy password-reset endpoints
//
// These previously wrote OTP codes and reset tokens to a plaintext JSON file
// inside the server directory, used Math.random() for secrets, leaked the
// reset token in the response body, and had no rate limiting.
// They now delegate to the hardened logic in routes/auth.js and only operate
// on a short-lived, rate-limited in-memory store.
// ---------------------------------------------------------------------------

const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const resets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of resets.entries()) {
    if (now > value.expires) resets.delete(key);
  }
}, 10 * 60 * 1000).unref();

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset attempts. Try again later.' }
});

app.post('/send-reset', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Identical response whether or not the account exists, so this cannot be
    // used to enumerate registered addresses.
    const respond = () => res.json({ ok: true, message: 'If an account exists, a reset link has been sent' });

    if (!user) return respond();

    const token = crypto.randomBytes(32).toString('hex');
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    resets.set(token, {
      email: normalizedEmail,
      userId: user._id.toString(),
      expires: Date.now() + RESET_TTL_MS,
      otp,
      attempts: 0
    });

    // The reset URL is built from the trusted APP_ORIGIN, never from a
    // client-supplied base. A client-controlled base lets an attacker mint a
    // genuine-looking reset link pointing at a domain they control.
    const resetUrl = `${env.APP_ORIGIN}/#reset=${token}`;

    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      const delivery = await sendPasswordResetEmail({ to: user.email, resetUrl, code: otp });
      if (!delivery.delivered) {
        console.error('send-reset delivery failed:', delivery.reason);
      }
    } else {
      console.warn('SMTP not configured; password reset email not dispatched');
    }

    return respond();
  } catch (err) {
    console.error('send-reset error:', err && err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/verify-otp', resetLimiter, (req, res) => {
  const { token, otp } = req.body || {};
  if (!token || !otp) return res.status(400).json({ error: 'Missing token or otp' });

  const info = resets.get(String(token));
  if (!info) return res.status(404).json({ error: 'Token not found' });
  if (Date.now() > info.expires) {
    resets.delete(String(token));
    return res.status(410).json({ error: 'Token expired' });
  }

  if (info.attempts >= MAX_OTP_ATTEMPTS) {
    resets.delete(String(token));
    return res.status(429).json({ error: 'Too many incorrect codes' });
  }

  const provided = Buffer.from(String(otp));
  const expected = Buffer.from(String(info.otp));
  const matches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!matches) {
    info.attempts += 1;
    return res.status(401).json({ error: 'Invalid OTP' });
  }

  // Single use: burn the token the moment the code is accepted, otherwise the
  // same valid OTP can be replayed until it expires.
  resets.delete(String(token));

  return res.json({ ok: true, email: info.email });
});

app.get('/validate-reset', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const info = resets.get(String(token));
  if (!info) return res.status(404).json({ error: 'Token not found' });
  if (Date.now() > info.expires) {
    resets.delete(String(token));
    return res.status(410).json({ error: 'Token expired' });
  }

  return res.json({ ok: true, email: info.email });
});

app.get('/health', (req, res) => res.json({
  ok: true,
  service: 'els-online-store',
  timestamp: new Date().toISOString()
}));

app.get('/', (req, res) => res.send('ELS upload server is running'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Generic error handler: log the detail server-side, never leak internals
// (stack traces, Mongo internals) to the client in production.
app.use((err, req, res, next) => {
  const message = (err && err.message) || 'Internal server error';
  // Expected client errors (bad upload, bad ObjectId, rate limit) are not
  // server faults, so do not log them as "Unhandled error".
  const isClientError = err instanceof multer.MulterError
    || err.status === 400 || err.status === 413
    || /image|extension|allowed|Invalid|not found|ObjectId/i.test(message);

  if (isClientError) {
    console.warn('Rejected request:', message);
  } else {
    console.error('Unhandled error:', message);
  }

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large' });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: 'Upload failed' });
  }
  if (err && /image|extension|allowed/i.test(message)) {
    return res.status(400).json({ success: false, message });
  }

  res.status(err.status || 500).json({
    success: false,
    message: env.isProd ? 'Internal server error' : message
  });
});

/**
 * Idempotent data migrations, run on every boot.
 *
 * Each one is written so that running it twice is a no-op. They exist because
 * two schema changes cannot be expressed as a code-only rollout:
 *
 *  1. role "admin" -> "super_admin". The old role is gone from the enum, so
 *     leaving rows behind would make them un-settable and strand the platform
 *     with no one able to reach the dashboard.
 *
 *  2. is_verified backfill. The field defaults to false, which would lock out
 *     every account that already exists. Existing users are grandfathered in:
 *     they already proved they could receive mail at least once, and silently
 *     locking out a live customer base to satisfy a new rule is not an
 *     acceptable migration. Only NEW registrations must verify from now on.
 */
async function runMigrations() {
  // 1. Retire the old admin role.
  const promotedRoles = await User.updateMany(
    { role: 'admin' },
    { $set: { role: 'super_admin' } }
  );
  if (promotedRoles.modifiedCount > 0) {
    console.log(`[migration] Promoted ${promotedRoles.modifiedCount} account(s) from "admin" to "super_admin".`);
  }

  // 2. Grandfather existing accounts as verified and active.
  const backfilled = await User.updateMany(
    { is_verified: { $exists: false } },
    { $set: { is_verified: true } }
  );
  if (backfilled.modifiedCount > 0) {
    console.log(`[migration] Marked ${backfilled.modifiedCount} existing account(s) as verified.`);
  }

  const statusBackfill = await User.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active' } }
  );
  if (statusBackfill.modifiedCount > 0) {
    console.log(`[migration] Set ${statusBackfill.modifiedCount} account(s) to active.`);
  }

  // 3. Super admin bootstrap. Runs on every boot so the role can always be
  //    recovered by setting the env var, without touching the database by hand.
  //
  //    is_verified is forced on as well: an account promoted to super_admin that
  //    still had to pass the verification gate could not sign in, so setting this
  //    variable would have produced a super admin who can never reach the
  //    dashboard they were just granted.
  if (env.SUPER_ADMIN_EMAIL) {
    const bootstrap = await User.findOneAndUpdate(
      { email: env.SUPER_ADMIN_EMAIL },
      { $set: { role: 'super_admin', status: 'active', is_verified: true } },
      { returnDocument: 'after' }
    );

    if (bootstrap) {
      console.log(`[bootstrap] Super admin ready: ${bootstrap.email}`);
    } else {
      console.warn(
        `[bootstrap] SUPER_ADMIN_EMAIL (${env.SUPER_ADMIN_EMAIL}) does not match any account. ` +
          'Register with that address first, then restart to grant super admin. ' +
          'To create it directly instead, run: npm run make-admin -- ' + env.SUPER_ADMIN_EMAIL
      );
    }
  } else {
    console.warn(
      '[WARN] SUPER_ADMIN_EMAIL is not set. If no account has the "super_admin" role, ' +
        'nobody will be able to open the dashboard.'
    );
  }
}

/**
 * Prove the mail relay is usable, and refuse to open the shop if it is not.
 *
 * config/env.js only checks that the credentials are non-empty. A revoked or
 * mistyped password passes that check, so the server would report email
 * verification as "required" and boot happily — and then strand every new
 * account unverified, with no way to sign in. This runs after the migrations
 * and before listen(), and is fatal in production only.
 */
async function verifyMailOnBoot() {
  try {
    await reportSmtpStatus({ strict: true });
  } catch (err) {
    console.error(err && err.message);
    process.exit(1);
  }
}

const port = env.PORT;

connectDB()
  .then(async () => {
    await runMigrations();

    // Before listen(), so an unreachable relay never produces a server that
    // looks healthy and accepts registrations it cannot activate.
    await verifyMailOnBoot();

    audit.recordSystem({
      action: 'system.boot',
      description: `Server started on port ${port}`,
      metadata: { port, recaptcha: env.RECAPTCHA_ENABLED, email_verification: env.EMAIL_VERIFICATION_REQUIRED }
    });

    app.listen(port, () => {
      console.log(`ELS server running on http://localhost:${port}`);
      console.log(`[config] reCAPTCHA: ${env.RECAPTCHA_ENABLED ? 'ENABLED' : 'disabled (no keys configured)'}`);
      console.log(`[config] Email verification: ${env.EMAIL_VERIFICATION_REQUIRED ? 'required' : 'optional'}`);
      startReconciliationCron();
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err && err.message);
    // Fail closed. Previously the server started anyway on a broken database,
    // leaving every authenticated route exposed but silently non-functional.
    process.exit(1);
  });

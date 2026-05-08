const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const name = Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url });
});

// Password reset email endpoint
// Expects JSON: { email: string, resetBase: string, siteName?: string }
app.post('/send-reset', async (req, res) => {
  const { email, resetBase, siteName } = req.body || {};
  if (!email || !resetBase) return res.status(400).json({ error: 'Missing email or resetBase' });

  // Read SMTP config from env
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.FROM_EMAIL || (smtpUser || ('no-reply@' + (req.hostname || 'localhost')));

  if (!smtpHost || !smtpUser || !smtpPass) {
    return res.status(501).json({ error: 'SMTP not configured on server' });
  }

  try {
    // generate token and persist server-side
    const token = (Math.random().toString(36).slice(2) + Date.now().toString(36));
    const expires = Date.now() + (60 * 60 * 1000); // 1 hour
    // generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const resetsFile = path.join(__dirname, 'resets.json');
    let resets = {};
    try { if (fs.existsSync(resetsFile)) resets = JSON.parse(fs.readFileSync(resetsFile, 'utf8') || '{}'); } catch(e){ resets = {}; }
    resets[token] = { email: email, expires, otp };
    try { fs.writeFileSync(resetsFile, JSON.stringify(resets, null, 2)); } catch(e){ /* ignore */ }

    const resetUrl = resetBase.replace(/\/#.*$/, '') + '#reset=' + token;

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: { user: smtpUser, pass: smtpPass }
    });

    const htmlBody = `<p>Hello,</p><p>Your one-time code to change your password is <strong>${otp}</strong>.</p><p>Or click the link below to continue: <a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`;

    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: `${siteName || 'Site'} password reset`,
      html: htmlBody
    });

    return res.json({ ok: true, info, token });
  } catch (err) {
    console.error('send-reset error', err);
    return res.status(500).json({ error: 'Failed to send email', detail: String(err) });
  }
});

// Verify OTP for a given token
app.post('/verify-otp', (req, res) => {
  const { token, otp } = req.body || {};
  if (!token || !otp) return res.status(400).json({ error: 'Missing token or otp' });
  const resetsFile = path.join(__dirname, 'resets.json');
  let resets = {};
  try { if (fs.existsSync(resetsFile)) resets = JSON.parse(fs.readFileSync(resetsFile, 'utf8') || '{}'); } catch(e){ resets = {}; }
  const info = resets[token];
  if (!info) return res.status(404).json({ error: 'Token not found' });
  if (Date.now() > info.expires) return res.status(410).json({ error: 'Token expired' });
  if (!info.otp) return res.status(400).json({ error: 'OTP not set for this token' });
  if (String(info.otp) !== String(otp)) return res.status(401).json({ error: 'Invalid OTP' });
  return res.json({ ok: true, email: info.email });
});

// Validate reset token
app.get('/validate-reset', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const resetsFile = path.join(__dirname, 'resets.json');
  let resets = {};
  try { if (fs.existsSync(resetsFile)) resets = JSON.parse(fs.readFileSync(resetsFile, 'utf8') || '{}'); } catch(e){ resets = {}; }
  const info = resets[token];
  if (!info) return res.status(404).json({ error: 'Token not found' });
  if (Date.now() > info.expires) return res.status(410).json({ error: 'Token expired' });
  return res.json({ ok: true, email: info.email });
});

app.get('/', (req, res) => res.send('ELS upload server is running'));

const port = process.env.PORT || 8001;
app.listen(port, () => console.log(`Upload server listening on http://localhost:${port}`));

// ----- Simple user store and auth endpoints (file-based, demo only) -----
const USERS_FILE = path.join(__dirname, 'users.json');
const bcrypt = require('bcryptjs');

function loadUsers() {
  try { if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '[]'); } catch(e) {}
  return [];
}
function saveUsers(users) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch(e) { console.error('saveUsers error', e); }
}

app.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing name, email or password' });
  const users = loadUsers();
  if (users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase())) return res.status(409).json({ error: 'User exists' });
  const hash = bcrypt.hashSync(password, 10);
  const id = 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  const user = { id, name, email, passwordHash: hash, created_at: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  const users = loadUsers();
  const u = users.find(x => String(x.email).toLowerCase() === String(email).toLowerCase());
  if (!u) return res.status(404).json({ error: 'User not found' });
  const ok = bcrypt.compareSync(password, u.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email } });
});

// complete reset: accepts { token, newPassword }
app.post('/reset-complete', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'Missing token or newPassword' });
  const resetsFile = path.join(__dirname, 'resets.json');
  let resets = {};
  try { if (fs.existsSync(resetsFile)) resets = JSON.parse(fs.readFileSync(resetsFile, 'utf8') || '{}'); } catch(e){ resets = {}; }
  const info = resets[token];
  if (!info) return res.status(404).json({ error: 'Token not found' });
  if (Date.now() > info.expires) return res.status(410).json({ error: 'Token expired' });
  const email = info.email;
  const users = loadUsers();
  const uidx = users.findIndex(x => String(x.email).toLowerCase() === String(email).toLowerCase());
  if (uidx === -1) return res.status(404).json({ error: 'User not found' });
  users[uidx].passwordHash = bcrypt.hashSync(newPassword, 10);
  saveUsers(users);
  // remove token
  delete resets[token];
  try { fs.writeFileSync(resetsFile, JSON.stringify(resets, null, 2)); } catch(e){}
  return res.json({ ok: true });
});

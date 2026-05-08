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
// Expects JSON: { email: string, resetUrl: string, siteName?: string }
app.post('/send-reset', async (req, res) => {
  const { email, resetUrl, siteName } = req.body || {};
  if (!email || !resetUrl) return res.status(400).json({ error: 'Missing email or resetUrl' });

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
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: { user: smtpUser, pass: smtpPass }
    });

    const htmlBody = `<p>Hello,</p><p>Click the link below to reset your password for ${siteName || 'the site'}:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`;

    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: `${siteName || 'Site'} password reset`,
      html: htmlBody
    });

    return res.json({ ok: true, info });
  } catch (err) {
    console.error('send-reset error', err);
    return res.status(500).json({ error: 'Failed to send email', detail: String(err) });
  }
});

app.get('/', (req, res) => res.send('ELS upload server is running'));

const port = process.env.PORT || 8001;
app.listen(port, () => console.log(`Upload server listening on http://localhost:${port}`));

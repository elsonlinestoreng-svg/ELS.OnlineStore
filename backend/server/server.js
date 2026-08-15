require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const checkoutRoutes = require('./routes/checkout');
const authRoutes = require('./routes/auth');
const earningsRoutes = require('./routes/earnings');
const paymentRoutes = require('./routes/payment');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const logisticsRoutes = require('./routes/logistics');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const connectDB = require('./config/db');
const User = require('./models/User');
const { start: startReconciliationCron } = require('./services/reconciliation');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, message: 'Too many requests. Slow down.' }
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);
app.use('/api/', generalLimiter);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

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

app.get('/', (req, res) => res.send('ELS upload server is running'));

const port = process.env.PORT || 8001;

connectDB().then(async () => {
  // Backfill users created before the role field existed
  await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });

  // Optional: promote a user to admin at boot via ADMIN_EMAIL
  if (process.env.ADMIN_EMAIL) {
    const admin = await User.findOneAndUpdate(
      { email: process.env.ADMIN_EMAIL.toLowerCase() },
      { $set: { role: 'admin' } },
      { new: true }
    );
    if (admin) console.log('👑 Admin ready: ' + admin.email);
  }

  app.listen(port, () => {
  console.log(`ELS server running on http://localhost:${port}`);
  startReconciliationCron();
});
});

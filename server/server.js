require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');

const connectDB = require('./config/db');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

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

connectDB().then(() => {
  app.listen(port, () => console.log(`Upload server listening on http://localhost:${port}`));
});

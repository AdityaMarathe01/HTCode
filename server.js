require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const cors = require('cors');
const morgan = require('morgan');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    severity TEXT,
    latitude REAL,
    longitude REAL,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    user_agent TEXT,
    verified INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  )`);
});

const app = express();
app.use(helmet());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down.'
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve admin page at /admin (so users can visit /admin without .html)
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads allowed'));
    cb(null, true);
  }
});

function sanitizeInput(s) {
  if (!s) return '';
  return validator.escape(String(s)).trim();
}

// Ensure admin exists using env vars ADMIN_USER and ADMIN_PASS
async function ensureAdmin() {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'ChangeThisPassword!';
  db.get('SELECT * FROM admin WHERE username = ?', [user], (err, row) => {
    if (err) return console.error(err);
    if (!row) {
      const hash = bcrypt.hashSync(pass, 10);
      db.run('INSERT INTO admin (username, password_hash) VALUES (?, ?)', [user, hash], (e) => {
        if (e) console.error('Failed to insert admin', e);
        else console.log('Admin user created (from env).');
      });
    }
  });
}
ensureAdmin();

// Create report
app.post('/api/report', upload.single('image'), async (req, res) => {
  try {
    // Honeypot to block bots
    if (req.body.website) return res.status(400).json({ error: 'Bot detected' });

    const name = sanitizeInput(req.body.name);
    const phone = sanitizeInput(req.body.phone);
    const severity = sanitizeInput(req.body.severity);
    const lat = parseFloat(req.body.latitude);
    const lon = parseFloat(req.body.longitude);

    if (!req.file) return res.status(400).json({ error: 'Image required' });
    if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'Geo coordinates required' });
    if (!['low', 'moderate', 'high'].includes(severity)) return res.status(400).json({ error: 'Invalid severity' });

    // Process image: re-encode, strip metadata, max width 1600
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
    const outPath = path.join(UPLOAD_DIR, filename);
    // Note: do NOT call withMetadata() to ensure EXIF is removed
    await sharp(req.file.buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 })
      .toFile(outPath);

    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get('User-Agent') || '';

    const stmt = db.prepare('INSERT INTO reports (name, phone, severity, latitude, longitude, image_path, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(name, phone, severity, lat, lon, `/uploads/${filename}`, ip, ua, function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, id: this.lastID });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login
app.post('/api/admin/login', express.json(), (req, res) => {
  const username = sanitizeInput(req.body.username);
  const password = req.body.password || '';
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  db.get('SELECT * FROM admin WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: row.id, username: row.username }, process.env.JWT_SECRET || 'replace_this_secret', { expiresIn: '12h' });
    res.json({ token });
  });
});

function authMiddleware(req, res, next) {
  const auth = req.get('Authorization') || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET || 'replace_this_secret');
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Admin: list reports
app.get('/api/admin/reports', authMiddleware, (req, res) => {
  db.all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ reports: rows });
  });
});

// Admin: mark verified
app.post('/api/admin/verify/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.run('UPDATE reports SET verified = 1 WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// Admin: delete
app.delete('/api/admin/report/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.get('SELECT image_path FROM reports WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(__dirname, row.image_path);
    db.run('DELETE FROM reports WHERE id = ?', [id], (e) => {
      if (e) return res.status(500).json({ error: 'DB error' });
      fs.unlink(filePath, () => {});
      res.json({ success: true });
    });
  });
});

// Generic error handler - return JSON for Multer and other errors
app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  if (err && err.name === 'MulterError') {
    // Multer errors (file too large, etc.)
    return res.status(400).json({ error: err.message || 'File upload error' });
  }
  if (err && err.message && err.message.includes('Only image uploads allowed')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Server error' });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, () => console.log(`Udaan server running on port ${PORT}`));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another process is listening on this port.`);
    console.error('To free the port:');
    console.error('  - On Windows: run `netstat -aon | findstr :3000` to find the PID, then `taskkill /PID <pid> /F`');
    console.error('  - Or set a different PORT env var before starting the server.');
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

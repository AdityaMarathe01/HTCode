
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

// Simple in-memory cache for geocoding results to avoid repeated API calls
const geocodeCache = new Map(); // key -> { address, ts }
const GEOCODE_TTL_MS = 1000 * 60 * 60; // 1 hour
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
// Use Helmet with an explicit Content Security Policy that allows the CDN
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.opencagedata.com', 'https://cdn.jsdelivr.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      // allow font files from Google
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
      // specifically allow style elements from Google Fonts
      styleSrcElem: ["'self'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net']
    }
  }
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('combined'));


app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Rate limiter, but skip static assets
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // more generous for dev
  message: 'Too many requests, please slow down.'
});
app.use((req, res, next) => {
  if (req.path.startsWith('/js/') || req.path.startsWith('/css/') || req.path.startsWith('/uploads/') || req.path.startsWith('/images/') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
    return next();
  }
  return limiter(req, res, next);
});

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

// Ensure admin exists and password always matches .env on startup
async function ensureAdmin() {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'ChangeThisPassword!';
  db.get('SELECT * FROM admin WHERE username = ?', [user], (err, row) => {
    if (err) return console.error(err);
    const hash = bcrypt.hashSync(pass, 10);
    if (!row) {
      db.run('INSERT INTO admin (username, password_hash) VALUES (?, ?)', [user, hash], (e) => {
        if (e) console.error('Failed to insert admin', e);
        else console.log('Admin user created (from env).');
      });
    } else {
      db.run('UPDATE admin SET password_hash = ? WHERE username = ?', [hash, user], (e) => {
        if (e) console.error('Failed to update admin password', e);
        else console.log('Admin password updated from env.');
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

    // Accept multiple images: uploaded file and/or captured (base64 in req.body.captured_image)
    let imagePaths = [];
    if (req.file) {
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
      const outPath = path.join(UPLOAD_DIR, filename);
      await sharp(req.file.buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 })
        .toFile(outPath);
      imagePaths.push(`/uploads/${filename}`);
    }
    if (req.body.captured_image) {
      // Data URL or base64 string
      let base64 = req.body.captured_image;
      if (base64.startsWith('data:image')) base64 = base64.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-captured.jpg`;
      const outPath = path.join(UPLOAD_DIR, filename);
      await sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 })
        .toFile(outPath);
      imagePaths.push(`/uploads/${filename}`);
    }
    if (!imagePaths.length) return res.status(400).json({ error: 'Image required' });
    if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'Geo coordinates required' });
    if (!['low', 'moderate', 'high'].includes(severity)) return res.status(400).json({ error: 'Invalid severity' });

    const ip = req.ip || req.connection.remoteAddress;
    const ua = req.get('User-Agent') || '';

    const stmt = db.prepare('INSERT INTO reports (name, phone, severity, latitude, longitude, image_path, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(name, phone, severity, lat, lon, imagePaths.join(','), ip, ua, function (err) {
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

// Admin: list reports (enhanced with server-side reverse geocoding)
app.get('/api/admin/reports', authMiddleware, (req, res) => {
  db.all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 1000', [], async (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    try {
      const key = process.env.OPENCAGE_API_KEY || '25edd74c56a44b3a86acc5aa03c2d8b7';
      const enhanced = await Promise.all(rows.map(async (r) => {
        r.address = null;
        const lat = parseFloat(r.latitude);
        const lon = parseFloat(r.longitude);
        if (!isFinite(lat) || !isFinite(lon)) return r;
        const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        const cached = geocodeCache.get(cacheKey);
        if (cached && (Date.now() - cached.ts) < GEOCODE_TTL_MS) {
          r.address = cached.address;
          return r;
        }
        try {
          const q = encodeURIComponent(`${lat},${lon}`);
          const url = `https://api.opencagedata.com/geocode/v1/json?q=${q}&key=${key}&no_annotations=1&limit=1`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error('OpenCage error');
          const data = await resp.json();
          if (data && data.results && data.results.length) {
            const comp = data.results[0].components || {};
            const formatted = data.results[0].formatted || '';
            const district = comp.district || comp.county || comp.city_district || '';
            const state = comp.state || comp.region || '';
            const city = comp.city || comp.town || comp.village || '';
            let addr = '';
            if (district && state) addr = `${district}, ${state}`;
            else if (state && city) addr = `${city}, ${state}`;
            else if (state) addr = state;
            else if (city) addr = city;
            else addr = formatted || '';
            if (!addr) addr = null;
            r.address = addr;
            geocodeCache.set(cacheKey, { address: addr, ts: Date.now() });
          }
        } catch (e) {
          r.address = null;
        }
        return r;
      }));
      res.json({ reports: enhanced });
    } catch (e) {
      res.json({ reports: rows });
    }
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

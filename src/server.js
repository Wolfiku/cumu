require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const { initDB, getConfig } = require('./db');
const authRoutes  = require('./routes/auth');
const apiRoutes   = require('./routes/api');
const adminRoutes = require('./routes/admin');
const streamRoutes = require('./routes/stream');
const userRoutes  = require('./routes/user');

const app = express();

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Init DB
initDB();

const config = getConfig();
const PORT = process.env.PORT || config.port || 3000;
const HOST = process.env.HOST || config.host || '0.0.0.0';

// Allowed origins: browser localhost dev + Capacitor mobile app origins
const ALLOWED_ORIGINS = [
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',   // iOS Capacitor
  'https://localhost',       // Android Capacitor (androidScheme: https)
];

// Core middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // also allow any origin the admin explicitly whitelisted via env
    const extra = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : [];
    if (extra.includes(origin)) return callback(null, true);
    return callback(null, true); // open for self-hosted use — tighten if needed
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '../data') }),
  secret: process.env.SESSION_SECRET || config.sessionSecret || 'cumu-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'none', // required for cross-origin cookie (Capacitor app)
  }
}));

// ── Setup guard ──────────────────────────────────────────────────────────────────────────────
const ALWAYS_ALLOWED = ['/css/', '/js/', '/fonts/', '/favicon'];
const SETUP_ALLOWED  = ['/auth/setup', '/auth/login', '/auth/logout', '/auth/me', '/user/'];

function isSetupDone() {
  const cfg = getConfig();
  return cfg.setupDone === true || cfg.setupDone === 'true';
}

app.use((req, res, next) => {
  if (ALWAYS_ALLOWED.some(p => req.path.startsWith(p))) return next();
  if (SETUP_ALLOWED.some(p => req.path.startsWith(p)))  return next();

  if (isSetupDone()) return next();

  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/stream')) {
    return res.status(503).json({ error: 'Setup not complete. Open the app in your browser.' });
  }

  return res.sendFile(path.join(__dirname, '../public/setup.html'));
});
// ─────────────────────────────────────────────────────────────────────────────────

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API / feature routes
app.use('/auth',   authRoutes);
app.use('/api',    apiRoutes);
app.use('/admin',  adminRoutes);
app.use('/stream', streamRoutes);
app.use('/user',   userRoutes);

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[cumu] Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!isSetupDone()) {
    console.log('[cumu] First run — open the URL above to complete setup.');
  }
});

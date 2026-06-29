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

const app = express();

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Init DB
initDB();

const config = getConfig();
const PORT = process.env.PORT || config.port || 3000;
const HOST = process.env.HOST || config.host || '0.0.0.0';

// Core middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '../data') }),
  secret: process.env.SESSION_SECRET || config.sessionSecret || 'cumu-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Setup guard ──────────────────────────────────────────────────────────────
// Static assets (css/js/fonts) must load even before setup is complete
const ALWAYS_ALLOWED = ['/css/', '/js/', '/fonts/', '/favicon'];
// API + auth routes that are needed during setup itself
const SETUP_ALLOWED  = ['/auth/setup', '/auth/login', '/auth/logout', '/auth/me'];

function isSetupDone() {
  // Re-read from DB every time so we catch the moment setup completes
  const cfg = getConfig();
  return cfg.setupDone === true || cfg.setupDone === 'true';
}

app.use((req, res, next) => {
  // Always allow static assets so the setup page can load its CSS/JS
  if (ALWAYS_ALLOWED.some(p => req.path.startsWith(p))) return next();
  // Always allow auth endpoints
  if (SETUP_ALLOWED.some(p => req.path.startsWith(p)))  return next();

  if (isSetupDone()) return next();

  // Setup not done yet
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/stream')) {
    return res.status(503).json({ error: 'Setup not complete. Open the app in your browser.' });
  }

  // All other requests → serve setup page
  return res.sendFile(path.join(__dirname, '../public/setup.html'));
});
// ─────────────────────────────────────────────────────────────────────────────

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API / feature routes
app.use('/auth',   authRoutes);
app.use('/api',    apiRoutes);
app.use('/admin',  adminRoutes);
app.use('/stream', streamRoutes);

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

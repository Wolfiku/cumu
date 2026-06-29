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
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
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

// Middleware
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

// ── Setup guard BEFORE static files ─────────────────────────────────────────
// Paths that are always allowed even without setup
const SETUP_WHITELIST = ['/auth/', '/api/setup', '/setup', '/css/', '/js/'];

app.use((req, res, next) => {
  const cfg = getConfig();
  if (cfg.setupDone) return next();                        // setup done → pass through
  const allowed = SETUP_WHITELIST.some(p => req.path.startsWith(p));
  if (allowed) return next();                              // whitelisted asset/route → pass
  // Everything else → show setup page
  if (req.path === '/' || !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, '../public/setup.html'));
  }
  return res.status(503).json({ error: 'setup not complete' });
});
// ────────────────────────────────────────────────────────────────────────────

// Static files (after guard)
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use('/stream', streamRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, HOST, () => {
  const cfg = getConfig();
  console.log(`[cumu] Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!cfg.setupDone) {
    console.log('[cumu] First run detected — open the URL above to complete setup.');
  }
});

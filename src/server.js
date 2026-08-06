require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const helmet   = require('helmet');
const morgan   = require('morgan');
const cors     = require('cors');

const { initDB, getConfig } = require('./db');
const { createWsServer }    = require('./websocket');

const authRoutes  = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const apiRoutes   = require('./routes/api');
const adminRoutes = require('./routes/admin');
const streamRoutes = require('./routes/stream');
const userRoutes  = require('./routes/user');
const syncRoutes  = require('./routes/sync');

const app = express();

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

initDB();

const config = getConfig();
const PORT = process.env.PORT || config.port || 3000;
const HOST = process.env.HOST || config.host || '0.0.0.0';

// ── Security & Logging ────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Session (for web client legacy auth) ──────────────────────────────────────

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '../data') }),
  secret: process.env.SESSION_SECRET || config.sessionSecret || 'cumu-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.SESSION_SECURE === 'true',
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

// ── Setup Guard ───────────────────────────────────────────────────────────────

const ALWAYS_ALLOWED = ['/css/', '/js/', '/fonts/', '/favicon'];
const SETUP_ALLOWED  = ['/auth/setup', '/auth/login', '/auth/logout', '/auth/me', '/user/', '/oauth/token', '/oauth/authorize'];

function isSetupDone() {
  const cfg = getConfig();
  return cfg.setupDone === true || cfg.setupDone === 'true';
}

app.use((req, res, next) => {
  if (ALWAYS_ALLOWED.some(p => req.path.startsWith(p))) return next();
  if (SETUP_ALLOWED.some(p => req.path.startsWith(p)))  return next();
  if (isSetupDone()) return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/stream') || req.path.startsWith('/sync')) {
    return res.status(503).json({ error: 'Setup not complete.' });
  }
  return res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// ── Static Assets ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/auth',   authRoutes);
app.use('/oauth',  oauthRoutes);
app.use('/api',    apiRoutes);
app.use('/api/sync', syncRoutes);
app.use('/admin',  adminRoutes);
app.use('/stream', streamRoutes);
app.use('/user',   userRoutes);

// ── SPA Fallback ──────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── HTTP + WebSocket Server ───────────────────────────────────────────────────

const server = http.createServer(app);
createWsServer(server);

server.listen(PORT, HOST, () => {
  console.log(`[cumu] Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`[cumu] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  if (!isSetupDone()) {
    console.log('[cumu] First run — open the URL above to complete setup.');
  }
});

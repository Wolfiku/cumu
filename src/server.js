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

const { initDB, getDB, getConfig, setConfig } = require('./db');
const { createWsServer }    = require('./websocket');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const authRoutes  = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const apiRoutes   = require('./routes/api');
const adminRoutes = require('./routes/admin');
const streamRoutes = require('./routes/stream');
const userRoutes  = require('./routes/user');
const syncRoutes  = require('./routes/sync');
const podcastRoutes = require('./routes/podcasts');

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

const ALWAYS_ALLOWED = ['/css/', '/js/', '/fonts/', '/favicon', '/health'];
const SETUP_ALLOWED  = ['/auth/setup', '/auth/login', '/auth/logout', '/auth/me', '/user/', '/oauth/token', '/oauth/authorize'];

function isSetupDone() {
  const cfg = getConfig();
  return cfg.setupDone === true || cfg.setupDone === 'true';
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

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
app.use('/api/podcasts', podcastRoutes);
app.use('/admin',  adminRoutes);
app.use('/stream', streamRoutes);
app.use('/user',   userRoutes);

// ── SPA Fallback ──────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

async function checkAutoSetup() {
  const autoSetup = process.env.AUTO_SETUP;
  const cfg = getConfig();
  if (autoSetup === 'true' && !isSetupDone()) {
    const db = getDB();
    const existingUser = db.prepare('SELECT count(*) as count FROM users').get();
    if (!existingUser || existingUser.count === 0) {
      const adminUser = process.env.ADMIN_USER || 'admin';
      const adminPass = process.env.ADMIN_PASS || 'admin';
      const hash = await bcrypt.hash(adminPass, 12);
      const id = uuidv4();
      db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(id, adminUser, hash, 'admin');
      setConfig('setupDone', 'true');
      console.log(`[cumu] Explicit AUTO_SETUP complete: Created default admin user '${adminUser}'.`);
    } else {
      setConfig('setupDone', 'true');
    }
  }
}

function startBackgroundScanner() {
  const musicPath = process.env.MUSIC_PATH || getConfig().musicPath || path.join(process.cwd(), 'music');
  if (!fs.existsSync(musicPath)) {
    try { fs.mkdirSync(musicPath, { recursive: true }); } catch {}
  }
  
  adminRoutes.runLibraryScan().then(res => {
    if (res.added > 0) {
      console.log(`[cumu] Startup scan complete: ${res.added} new track(s) indexed.`);
    }
  }).catch(err => {
    console.error('[cumu] Initial library scan error:', err.message);
  });

  setInterval(() => {
    adminRoutes.runLibraryScan().catch(() => {});
  }, 30000);
}

// ── HTTP + WebSocket Server ───────────────────────────────────────────────────

const server = http.createServer(app);
createWsServer(server);

server.listen(PORT, HOST, async () => {
  await checkAutoSetup();
  startBackgroundScanner();
  console.log(`[cumu] Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`[cumu] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  if (!isSetupDone()) {
    console.log('[cumu] First run — open the URL above to complete setup.');
  }
});

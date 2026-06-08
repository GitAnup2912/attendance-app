const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(compression());

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Anup2912@atten.wliwwci.mongodb.net/attendance-app?retryWrites=true&w=majority';
const DATA_KEY = 'main';
const BACKUP_FILE = path.join(__dirname, 'attendance_data.json');

let db = null;
let dataCache = null;
const activeSessions = new Map(); // userId -> lastHeartbeat timestamp

// Default data structure
function defaultData() {
  return { users: [], shifts: [], attendance: [], requests: [], siAssignments: [], monthlyGrids: {}, quotas: [], _lastSaved: 0 };
}

// Load/save JSON file fallback
function loadFileBackup() {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const raw = fs.readFileSync(BACKUP_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read backup file:', e.message);
  }
  return null;
}

function saveFileBackup(data) {
  try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data), 'utf8');
    return true;
  } catch (e) {
    console.warn('Could not write backup file:', e.message);
    return false;
  }
}

// Connect to MongoDB and populate dataCache before accepting requests
async function connectDB() {
  // Try file backup first (fastest)
  const fileData = loadFileBackup();
  if (fileData) {
    dataCache = fileData;
    console.log('Data loaded from backup file');
  }

  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB, database:', db.databaseName);

    try {
      const doc = await db.collection('appdata').findOne({ _id: DATA_KEY });
      if (doc) {
        delete doc._id;
        const def = defaultData();
        for (const key of Object.keys(def)) {
          if (!doc[key]) doc[key] = def[key];
        }
        dataCache = doc;
        console.log('Data loaded from MongoDB');
      }
      if (!dataCache) {
        dataCache = defaultData();
        console.log('No existing data, starting fresh');
      }
      // Verify MongoDB persistence: do a test write
      try {
        await db.collection('appdata').updateOne(
          { _id: '_ping' },
          { $set: { ping: Date.now() } },
          { upsert: true }
        );
        console.log('MongoDB write test OK');
      } catch (e) {
        console.warn('MongoDB write test FAILED:', e.message);
      }
    } catch (e) {
      console.warn('Could not load data from MongoDB:', e.message);
      if (!dataCache) dataCache = defaultData();
    }
  } catch (e) {
    console.warn('MongoDB connection failed:', e.message);
    if (!dataCache) dataCache = defaultData();
  }
  // Always ensure admin password is 000000 regardless of data source
  if (dataCache && dataCache.users) {
    const admin = dataCache.users.find(u => u.id === 1);
    if (admin) admin.password = '000000';
  }
}

async function saveData(data) {
  // Always write to file backup first
  saveFileBackup(data);

  if (!db) return false;
  try {
    await db.collection('appdata').replaceOne(
      { _id: DATA_KEY },
      { _id: DATA_KEY, ...data },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('MongoDB save error:', e.message);
    try {
      const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
      await client.connect();
      db = client.db();
      await db.collection('appdata').replaceOne(
        { _id: DATA_KEY },
        { _id: DATA_KEY, ...data },
        { upsert: true }
      );
      console.log('Data saved to MongoDB after reconnection');
      return true;
    } catch (e2) {
      console.error('MongoDB reconnect+save failed:', e2.message);
      return false;
    }
  }
}

// Wait for MongoDB connection, then start server
async function start() {
  await connectDB();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
start();

// Serve static files
app.use(express.static(__dirname, {
  setHeaders(res, p) {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// GET /api/data with optional pagination
app.get('/api/data', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (!dataCache) return res.json(defaultData());
  // Always ensure admin password is 000000
  if (dataCache.users) {
    const admin = dataCache.users.find(u => u.id === 1);
    if (admin) admin.password = '000000';
  }

  const { limit, offset } = req.query;
  const l = parseInt(limit, 10);
  const o = parseInt(offset, 10);
  const isNum = !isNaN(l) && !isNaN(o);

  if (isNum) {
    // paginate arrays only; keep other objects whole
    const paginated = { ...dataCache };
    if (Array.isArray(paginated.attendance)) {
      paginated.attendance = paginated.attendance.slice(o, o + l);
    }
    if (Array.isArray(paginated.requests)) {
      paginated.requests = paginated.requests.slice(o, o + l);
    }
    // optionally paginate users/shifts if needed
    res.json(paginated);
  } else {
    // return full data (but warn large)
    res.json(dataCache);
  }
});

// GET /api/debug — check MongoDB connection
app.get('/api/debug', (req, res) => {
  res.json({
    dbConnected: db !== null,
    dataCacheKeys: dataCache ? Object.keys(dataCache).filter(k => k !== 'users') : null,
    userCount: dataCache?.users?.length || 0,
    shiftCount: dataCache?.shifts?.length || 0,
    mongoUriMasked: (process.env.MONGO_URI || '(using default)').replace(/\/\/[^:]+:[^@]+@/, '//USER:PASS@'),
  });
});

// POST /api/data
app.post('/api/data', async (req, res) => {
  try {
    const { users, shifts, attendance, requests, siAssignments, monthlyGrids, quotas, _lastSaved } = req.body;
    const newData = {
      users: users || [],
      shifts: shifts || [],
      attendance: attendance || [],
      requests: requests || [],
      siAssignments: siAssignments || [],
      monthlyGrids: monthlyGrids || {},
      quotas: quotas || [],
      _lastSaved: _lastSaved || 0,
    };
    dataCache = newData;
    // Always ensure admin password is 000000
    if (dataCache.users) {
      const admin = dataCache.users.find(u => u.id === 1);
      if (admin) admin.password = '000000';
    }
    const saved = await saveData(dataCache);
    res.json({ ok: true, persisted: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Session management: prevent same user login on multiple terminals ──
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!dataCache || !dataCache.users) return res.json({ ok: false, message: 'Server not ready' });
  if (!username || !password) return res.json({ ok: false, message: 'Username and password required' });
  // Admin password override
  const user = dataCache.users.find(u =>
    u.role !== '__deleted__' && u.username === username && u.password === password
  );
  if (!user) return res.json({ ok: false, message: 'Invalid credentials' });

  // Check if user already has an active session (heartbeat within last 90s)
  const last = activeSessions.get(user.id);
  const now = Date.now();
  if (last && (now - last) < 90000) {
    return res.json({ ok: false, message: 'This user is already logged in on another device. Logout from there first.', alreadyLoggedIn: true });
  }
  activeSessions.set(user.id, now);
  res.json({ ok: true, userId: user.id, userName: user.name, userRole: user.role });
});

app.post('/api/logout', (req, res) => {
  const { userId } = req.body;
  if (userId) activeSessions.delete(userId);
  res.json({ ok: true });
});

app.post('/api/heartbeat', (req, res) => {
  const { userId } = req.body;
  if (userId) activeSessions.set(userId, Date.now());
  res.json({ ok: true });
});

// Cleanup stale sessions every 60 seconds
setInterval(() => {
  const cutoff = Date.now() - 120000; // 2 min stale threshold
  for (const [uid, ts] of activeSessions) {
    if (ts < cutoff) activeSessions.delete(uid);
  }
}, 60000);

// Serve HTML — always prevent caching so other PCs get latest version
app.get('/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(__dirname + '/attendance--app 2 .html');
});


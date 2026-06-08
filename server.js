require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'my_local_secret_123';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// ─── MongoDB (serverless-safe: cached promise across warm starts) ───
let mongoPromise;
function connectDB() {
  if (!mongoPromise) {
    mongoPromise = mongoose.connect(MONGODB_URI).then(() => {
      console.log('MongoDB connected');
    }).catch(err => {
      console.error('MongoDB connection error:', err);
      mongoPromise = null; // retry next time
    });
  }
  return mongoPromise;
}

const AppData = require('./models/AppData');

// ─── Session tracking (in-memory, unreliable on serverless) ───
const activeSessions = new Map();

// ─── Auth Middleware ───
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid Token' });
  }
};

// ─── Seed Admin ───
async function seedAdmin() {
  const record = await AppData.findOne({ type: 'users' });
  const users = record?.data || [];
  const exists = users.find(u => u.username === 'admin');
  if (!exists) {
    const hashed = await bcrypt.hash('admin123', 10);
    users.push({
      id: '1', name: 'System Admin', username: 'admin', password: hashed,
      role: 'admin', area: 'Office', assignedShift: 'G', category: 'Admin', mustChangePw: false
    });
    await AppData.updateOne({ type: 'users' }, { $set: { data: users } }, { upsert: true });
    console.log('✅ Admin created: admin / admin123');
  }
}

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({ mongoState: mongoose.connection.readyState, ok: mongoose.connection.readyState === 1 });
});

// ─── Wait for MongoDB before handling data routes ───
app.use(['/api/login', '/api/data'], async (req, res, next) => {
  try {
    await connectDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, message: 'Database not connected' });
    }
    next();
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Database connection failed' });
  }
});

// ─── AUTH ROUTES ───
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const record = await AppData.findOne({ type: 'users' });
    const users = record?.data || [];

    const user = users.find(u =>
      u.username === username &&
      (!role || u.role.toLowerCase() === role.toLowerCase())
    );
    if (!user) return res.json({ ok: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ ok: false, message: 'Invalid credentials' });

    // Session tracking skipped on Vercel (serverless — in-memory state is unreliable)
    if (!process.env.VERCEL) {
      if (activeSessions.has(user.id)) {
        return res.json({ ok: false, alreadyLoggedIn: true, message: 'Already logged in on another terminal' });
      }
      activeSessions.set(user.id, Date.now());
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);

    res.json({
      ok: true, token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role,
              area: user.area, assignedShift: user.assignedShift, category: user.category }
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Server error', error: e.message });
  }
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

// ─── DATA SYNC ───
app.get('/api/data', authenticate, async (req, res) => {
  try {
    const records = await AppData.find({});
    const result = {};
    for (const r of records) result[r.type] = r.data;
    res.json({ users: [], shifts: [], attendance: [], requests: [], monthlyGrids: {}, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/data', authenticate, async (req, res) => {
  try {
    const body = req.body;
    const types = ['shifts', 'attendance', 'requests', 'monthlyGrids'];

    // Handle users separately — protect bcrypt password hashes
    if (body.users !== undefined) {
      const existing = await AppData.findOne({ type: 'users' });
      const existingData = existing?.data || [];
      // Build lookup by id AND by username (covers edge cases where ids differ)
      const existingById = {};
      const existingByUser = {};
      for (const u of existingData) {
        if (u.id) existingById[u.id] = u;
        if (u.username) existingByUser[u.username] = u;
      }
      for (const u of body.users) {
        const matched = existingById[u.id] || existingByUser[u.username];
        if (u.password && !u.password.startsWith('$2') && matched && matched.password && matched.password.startsWith('$2')) {
          u.password = matched.password;
        }
        // Final safety net: hash any plaintext that slipped through
        if (u.password && !u.password.startsWith('$2')) {
          u.password = await bcrypt.hash(u.password, 10);
        }
      }
      await AppData.updateOne({ type: 'users' }, { $set: { data: body.users } }, { upsert: true });
    }

    for (const type of types) {
      if (body[type] !== undefined) {
        await AppData.updateOne(
          { type },
          { $set: { data: body[type] } },
          { upsert: true }
        );
      }
    }
    res.json({ persisted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Seed on startup (runs once when module loads) ───
connectDB().then(() => seedAdmin()).catch(console.error);

// ─── START (only when not on Vercel) ───
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

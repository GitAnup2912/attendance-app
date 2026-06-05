const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Anup2912@atten.wliwwci.mongodb.net/attendance-app?retryWrites=true&w=majority';
const DATA_KEY = 'main';
const BACKUP_FILE = path.join(__dirname, 'attendance_data.json');

let db = null;
let dataCache = null;

// Default data structure
function defaultData() {
  return { users: [], shifts: [], attendance: [], requests: [], siAssignments: [], monthlyGrids: {}, quotas: [] };
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
    console.log('Connected to MongoDB');

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

// GET /api/data
app.get('/api/data', (req, res) => {
  if (!dataCache) return res.json(defaultData());
  // Always ensure admin password is 000000
  if (dataCache.users) {
    const admin = dataCache.users.find(u => u.id === 1);
    if (admin) admin.password = '000000';
  }
  res.json(dataCache);
});

// POST /api/data
app.post('/api/data', async (req, res) => {
  try {
    const { users, shifts, attendance, requests, siAssignments, monthlyGrids, quotas } = req.body;
    const newData = {
      users: users || [],
      shifts: shifts || [],
      attendance: attendance || [],
      requests: requests || [],
      siAssignments: siAssignments || [],
      monthlyGrids: monthlyGrids || {},
      quotas: quotas || [],
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

// Serve HTML — always prevent caching so other PCs get latest version
app.get('/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(__dirname + '/attendance--app 2 .html');
});


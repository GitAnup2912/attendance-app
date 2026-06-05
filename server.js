const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Anup2912@atten.wliwwci.mongodb.net/attendance-app?retryWrites=true&w=majority';
const DATA_KEY = 'main';

let db = null;
let dataCache = null;

// Default data structure
function defaultData() {
  return { users: [], shifts: [], attendance: [], requests: [], siAssignments: [], monthlyGrids: {}, quotas: [] };
}

// Connect to MongoDB and populate dataCache before accepting requests
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');

    // Load data after connection
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
      } else {
        dataCache = defaultData();
        console.log('No existing data, starting fresh');
      }
    } catch (e) {
      console.warn('Could not load data:', e.message);
      dataCache = defaultData();
    }
  } catch (e) {
    console.warn('MongoDB connection failed, running with empty data:', e.message);
    dataCache = defaultData();
  }
}

async function saveData(data) {
  if (!db) return;
  try {
    await db.collection('appdata').replaceOne(
      { _id: DATA_KEY },
      { _id: DATA_KEY, ...data },
      { upsert: true }
    );
  } catch (e) {
    console.error('MongoDB save error:', e.message);
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
    await saveData(newData);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve HTML
app.get('/*', (req, res) => {
  res.sendFile(__dirname + '/attendance--app 2 .html');
});


const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Anup2912@atten.wliwwci.mongodb.net/attendance-app?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

// Schema — single document stores the entire app state
const appDataSchema = new mongoose.Schema({}, { strict: false, collection: 'appdata' });
const AppData = mongoose.model('AppData', appDataSchema);

const DATA_KEY = 'main';

// Default data structure
function defaultData() {
  return {
    users: [],
    shifts: [],
    attendance: [],
    requests: [],
    siAssignments: [],
    monthlyGrids: {},
    quotas: [],
  };
}

// Load data from MongoDB
async function loadData() {
  try {
    const doc = await mongoose.connection.collection('appdata').findOne({ _id: DATA_KEY });
    if (doc) {
      delete doc._id;
      // Ensure all fields exist
      const def = defaultData();
      for (const key of Object.keys(def)) {
        if (!doc[key]) doc[key] = def[key];
      }
      return doc;
    }
  } catch (e) {
    console.warn('Could not load from MongoDB, starting fresh:', e.message);
  }
  return defaultData();
}

// Save data to MongoDB
async function saveData(data) {
  try {
    await mongoose.connection.collection('appdata').replaceOne(
      { _id: DATA_KEY },
      { _id: DATA_KEY, ...data },
      { upsert: true }
    );
  } catch (e) {
    console.error('MongoDB save error:', e.message);
  }
}

let dataCache = null;

// Initialize cache on startup
(async () => {
  dataCache = await loadData();
  console.log('Data loaded from MongoDB');
})();

// Serve static files
app.use(express.static(__dirname, {
  setHeaders(res, p) {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// GET /api/data — returns full app data
app.get('/api/data', (req, res) => {
  if (!dataCache) return res.status(503).json({ error: 'Still loading' });
  res.json(dataCache);
});

// POST /api/data — saves full app data
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

// Serve the HTML for any other route
app.get('/*', (req, res) => {
  res.sendFile(__dirname + '/attendance--app 2 .html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

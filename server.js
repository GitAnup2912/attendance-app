const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Anup2912@cluster0.k1eyfco.mongodb.net/?appName=Cluster0';
const DB_NAME = 'attendance_app';
const COLLECTION = 'data';

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB Atlas');
}

// Serve the attendance app
app.use(express.static(__dirname));

// GET /api/data — returns the full app data
app.get('/api/data', async (req, res) => {
  try {
    const data = await db.collection(COLLECTION).findOne({ _id: 'main' });
    if (!data) {
      return res.json({ users: [], shifts: [], attendance: [], requests: [], siAssignments: [] });
    }
    const { _id, ...rest } = data;
    res.json(rest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data — saves the full app data (replaces everything)
app.post('/api/data', async (req, res) => {
  try {
    const { users, shifts, attendance, requests, siAssignments } = req.body;
    await db.collection(COLLECTION).updateOne(
      { _id: 'main' },
      { $set: { users: users || [], shifts: shifts || [], attendance: attendance || [], requests: requests || [], siAssignments: siAssignments || [] } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the HTML for any other route (must come AFTER API routes)
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'attendance_app.html'));
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('MongoDB connection failed:', err);
  process.exit(1);
});

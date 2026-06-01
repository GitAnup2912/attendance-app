const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = path.join(__dirname, 'attendance_data.json');

// Load persisted data on startup
let dataCache = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    dataCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log('Loaded saved data from disk');
  } catch (e) {
    console.warn('Could not read data file, starting fresh');
  }
}
// Ensure all fields exist
if (!dataCache.users) dataCache.users = [];
if (!dataCache.shifts) dataCache.shifts = [];
if (!dataCache.attendance) dataCache.attendance = [];
if (!dataCache.requests) dataCache.requests = [];
if (!dataCache.siAssignments) dataCache.siAssignments = [];
if (!dataCache.monthlyGrids) dataCache.monthlyGrids = {};
if (!dataCache.quotas) dataCache.quotas = [];

// Save data to disk
function saveData(data) {
  dataCache = data;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Serve the attendance app (no cache so HTML/JS updates are picked up)
app.use(express.static(__dirname, {
  setHeaders(res, p) {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// GET /api/data — returns the full app data
app.get('/api/data', (req, res) => {
  res.json(dataCache);
});

// POST /api/data — saves the full app data (replaces everything)
app.post('/api/data', (req, res) => {
  try {
    const { users, shifts, attendance, requests, siAssignments, monthlyGrids, quotas } = req.body;
    saveData({
      users: users || [],
      shifts: shifts || [],
      attendance: attendance || [],
      requests: requests || [],
      siAssignments: siAssignments || [],
      monthlyGrids: monthlyGrids || {},
      quotas: quotas || [],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the HTML for any other route
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'attendance--app 2 .html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Data stored in ${DATA_FILE}`);
});

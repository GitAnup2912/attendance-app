const mongoose = require('mongoose');
const RequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  type: String,
  reason: String,
  aiStatus: { type: String, default: 'pending' },
  dsmStatus: { type: String, default: 'pending' },
  smStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  remarks: { type: String },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Request', RequestSchema);

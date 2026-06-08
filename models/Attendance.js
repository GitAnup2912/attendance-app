const mongoose = require('mongoose');
const AttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  status: { type: String, required: true }, // Present, Absent, Leave, C-off
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Attendance', AttendanceSchema);

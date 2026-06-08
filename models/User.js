const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  area: String,
  assignedShift: String,
  category: String,
  siId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  aiId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mustChangePw: { type: Boolean, default: false }
});
module.exports = mongoose.model('User', UserSchema);

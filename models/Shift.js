const mongoose = require('mongoose');
const ShiftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  code: { type: String, required: true } // G, A, B, C, O, L
});
module.exports = mongoose.model('Shift', ShiftSchema);
      
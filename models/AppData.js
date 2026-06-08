const mongoose = require('mongoose');
const AppDataSchema = new mongoose.Schema({
  type: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed }
});
module.exports = mongoose.model('AppData', AppDataSchema);

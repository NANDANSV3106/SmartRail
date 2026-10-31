const mongoose = require('mongoose');

// Trains collection — only what you asked for, plus an optional route
// note so staff can tell trains apart in the dashboard:
//   trainNumber: "12639"  (unique)
//   trainName:   "Brindavan SF Express"
// Incidents store trainNumber (and a copy of trainName at creation), so
// renaming a train here does not rewrite old incident history.
const trainSchema = new mongoose.Schema({
  trainNumber: { type: String, required: true, unique: true, trim: true },
  trainName: { type: String, required: true, trim: true },
  fromStation: { type: String, default: '', trim: true },
  toStation: { type: String, default: '', trim: true },
}, { timestamps: true, collection: 'trains' });

module.exports = mongoose.model('Train', trainSchema);

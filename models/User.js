const mongoose = require('mongoose');

// Users collection — matches the screenshots in MongoDB Compass:
//   username: "Mysuru Station Master"
//   user_id:  "TGSMYS"            <- this is the login id (not an email)
//   password: bcrypt hash         <- stored hashed, never plain text
//   department: "StationMaster" | "TrafficInspector" | "RailwayAdmin"
//   station: "Mysuru" | "Mandya" | "Bengaluru" | "" (DOM, division-wide)
//
// Designation is the scope used by the server (same 3 as before):
//   StationMaster    -> SS  (one station only)
//   TrafficInspector -> TI  (one section, read-only supervisory)
//   RailwayAdmin     -> DOM (whole division, creates accounts, deletes)
// `designation` is stored explicitly so the scope never has to be guessed
// from the department string at request time.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  user_id: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  department: {
    type: String,
    enum: ['StationMaster', 'TrafficInspector', 'RailwayAdmin'],
    default: 'StationMaster',
  },
  station: { type: String, default: '', trim: true },
  designation: { type: String, enum: ['SS', 'TI', 'DOM'], default: 'SS' },
  stationId: { type: String, default: null },
  sectionId: { type: String, default: null },
  divisionId: { type: String, default: 'division-1' },
  name: { type: String, default: null },
  email: { type: String, default: null },
  passwordHash: { type: String, default: null },
  role: { type: String, default: null },
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.model('User', userSchema);

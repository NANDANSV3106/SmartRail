const mongoose = require('mongoose');

// Incidents collection — matches the screenshots:
//   trainNumber: "12639"
//   nearestStation: "Mandya" / "Mysuru"
//   status: "New" | "Acknowledged" | "Assessed" | "Resolved"
//   reportedAt, assessedAt, assessedBy (User ObjectId),
//   resolvedAt, resolvedBy (User ObjectId),
//   assessmentDetails: Object with 5 fields:
//     obstacleType, casualtyCount, severity, forestDeptNotified, policeNotified
//
// Plus the hardware fields the node actually reports (distance, GPS,
// SMS flag, maps link), so an incident created by the board and an
// incident assessed by staff are the same document, not two systems.
const incidentSchema = new mongoose.Schema({
  trainNumber: { type: String, default: null, trim: true },
  trainName: { type: String, default: null, trim: true },
  nearestStation: { type: String, default: 'Unknown', trim: true },
  station: { type: String, default: null, trim: true },
  stationId: { type: String, default: null },
  sectionId: { type: String, default: 'section-1' },
  divisionId: { type: String, default: 'division-1' },
  distanceCm: { type: Number, default: null },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  mapsUrl: { type: String, default: null },
  status: {
    type: String,
    enum: ['New', 'Acknowledged', 'Assessed', 'Resolved'],
    default: 'New',
  },
  smsSent: { type: Boolean, default: false },
  smsSentAt: { type: Date, default: null },
  detectionCount: { type: Number, default: 1 },
  firstDetectedAt: { type: Date, default: Date.now },
  lastDetectedAt: { type: Date, default: Date.now },
  reportedAt: { type: Date, default: Date.now },
  obstacleType: {
    type: String,
    enum: ['Unknown', 'Human', 'Animal', 'Vehicle', 'Boulder', 'Other'],
    default: 'Unknown',
  },
  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assessedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acknowledgedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  assessmentDetails: {
    obstacleType: { type: String, default: 'Unknown' },
    casualtyCount: { type: Number, default: 0 },
    severity: { type: String, enum: ['None', 'Minor', 'Major', 'Fatal'], default: 'None' },
    forestDeptNotified: { type: Boolean, default: false },
    policeNotified: { type: Boolean, default: false },
  },
  // ML camera classification (live_detection.py, 2026-10-31): the raw
  // class the model predicted + its confidence. This is the machine's
  // detection, kept separate from obstacleType above — that one stays
  // the SS's confirmed assessment.
  mlClass: { type: String, default: null, trim: true },
  mlConfidence: { type: Number, default: null },
  trackCleared: { type: Boolean, default: false },
  clearedBy: { type: String, default: null },
  clearedAt: { type: Date, default: null },
  history: { type: [{
    action: String, by: String, designation: String,
    at: { type: Date, default: Date.now }, detail: String,
  }], default: [] },
  source: { type: String, enum: ['serial', 'http', 'manual', 'ml'], default: 'serial' },
  deviceId: { type: String, default: 'track-node-1' },
}, { timestamps: true, collection: 'incidents' });

module.exports = mongoose.model('Incident', incidentSchema);

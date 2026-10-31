const mongoose = require('mongoose');

// Health alerts collection — hardware status, one live record per node.
// A new alert row is NOT created on every sensor reading: the record for
// a station is updated in place, and a separate row is only added when
// the node goes offline or a component (sensor / GPS / GSM / buzzer)
// changes state. That keeps this collection readable in Compass.
const healthAlertSchema = new mongoose.Schema({
  station: { type: String, default: 'Unknown', trim: true },
  nearestStation: { type: String, default: null, trim: true },
  stationId: { type: String, default: null },
  sectionId: { type: String, default: 'section-1' },
  deviceId: { type: String, default: 'track-node-1' },
  // online | offline | warning (online but a component is not OK)
  status: { type: String, enum: ['online', 'offline', 'warning'], default: 'offline' },
  deviceOnline: { type: Boolean, default: false },
  sensorOk: { type: Boolean, default: null },
  gpsOk: { type: Boolean, default: null },
  gsmOk: { type: Boolean, default: null },
  buzzerOk: { type: Boolean, default: null },
  buzzerOn: { type: Boolean, default: false },
  lastDistanceCm: { type: Number, default: null },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  lastSeenAt: { type: Date, default: null },
  message: { type: String, default: '' },
  note: { type: String, default: '' },
}, { timestamps: true, collection: 'health_alerts' });

module.exports = mongoose.model('HealthAlert', healthAlertSchema);

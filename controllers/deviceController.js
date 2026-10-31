const deviceState = require('../services/deviceState');
const incidentService = require('../services/incidentService');
const { parseMl } = require('../services/ml');
const store = require('../services/store');
const perms = require('../services/permissions');

let serial = null;
function setSerial(s) { serial = s; }

async function status(req, res) {
  const nodes = perms.filterNodes(req.user, deviceState.getAllNodes());
  const alerts = perms.filterHealthAlerts(req.user, await store.listHealthAlerts(50));
  res.json({ device: nodes[0] || null, nodes, alerts, scope: perms.scopeOf(req.user), usingMongo: store.isMongo() });
}
function stationFromBody(req) {
  return (req.body && (req.body.station || req.body.nearestStation || req.body.stationId))
    || req.user.station || req.user.stationId || 'Mysuru';
}
function buzzer(req, res) {
  const on = req.body && req.body.on === true;
  const station = stationFromBody(req);
  if (!perms.canControlDevice(req.user, station)) return res.status(403).json({ error: 'TI view is read-only, and SS can only control their own station' });
  if (process.env.SIMULATE_DEVICE === 'true') { deviceState.markBuzzer(on, true, station); return res.json({ ok: true, buzzerOn: on, simulated: true }); }
  if (serial && serial.isConnected()) { serial.sendCommand(on ? 'BUZZER:ON' : 'BUZZER:OFF'); deviceState.markBuzzer(on, true, station); return res.json({ ok: true, buzzerOn: on, sent: true }); }
  if (deviceState.getStatus(station).deviceOnline) {
    deviceState.queueCommand(station, on ? 'BUZZER:ON' : 'BUZZER:OFF'); deviceState.markBuzzer(on, true, station);
    return res.json({ ok: true, buzzerOn: on, queued: true, note: 'Queued — the Wi-Fi node picks it up on its next poll (within a few seconds)' });
  }
  return res.status(503).json({ error: 'Device offline — plug the Arduino/ESP32 in via USB and set SERIAL_PORT, connect it over Wi-Fi, or enable SIMULATE_DEVICE for a demo' });
}
function ping(req, res) {
  const station = stationFromBody(req);
  if (!perms.canControlDevice(req.user, station)) return res.status(403).json({ error: 'TI view is read-only, and SS can only ping their own station' });
  if (process.env.SIMULATE_DEVICE === 'true') { deviceState.markPong(station); return res.json({ ok: true, pong: true, simulated: true }); }
  if (serial && serial.isConnected()) { serial.sendCommand('PING'); return res.json({ ok: true, sent: true, note: 'Watch the dashboard health panel for the PONG reply (it polls every 3 s)' }); }
  if (deviceState.getStatus(station).deviceOnline) { deviceState.queueCommand(station, 'PING'); return res.json({ ok: true, queued: true, note: 'Queued — the Wi-Fi node picks it up on its next poll' }); }
  return res.status(503).json({ error: 'Device offline — cannot ping' });
}
function commands(req, res) {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) return res.status(500).json({ error: 'Server misconfigured: DEVICE_API_KEY is not set' });
  if (req.headers['x-device-key'] !== expected) return res.status(401).json({ error: 'Invalid device key' });
  const station = req.query.stationId || req.query.station || 'Mysuru';
  res.json({ commands: deviceState.takeCommands(station) });
}

// Wi-Fi / GSM / ML HTTP ingest. Device-key auth, NOT staff login.
// Body: distanceCm, latitude, longitude, station / nearestStation,
// stationId, sectionId, trainNumber, smsSent.
// ML (2026-10-31): the body may ALSO carry mlClass + mlConfidence from
// live_detection.py (e.g. mlClass: "Human on track", mlConfidence: 0.87).
// An ML obstacle class creates an incident even with no distanceCm —
// the camera and the ultrasonic sensor are independent detectors.
// "Clear track" / "UNKNOWN" from ML never create an incident.
// The station NAME is what SS scope uses — send "Mysuru", "Mandya" or
// "Bengaluru", not a generic station-1, so the right Station Master
// sees the incident.
async function ingest(req, res) {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) return res.status(500).json({ error: 'Server misconfigured: DEVICE_API_KEY is not set' });
  const body = req.body || {};
  // Key may arrive as the x-device-key header (laptop bridge / Wi-Fi
  // nodes) OR as body.deviceKey — the A7670 GSM module's HTTP AT
  // commands cannot reliably set custom headers, so the standalone
  // battery node sends the key inside the JSON body instead.
  if (req.headers['x-device-key'] !== expected && body.deviceKey !== expected) return res.status(401).json({ error: 'Invalid device key' });
  const distanceCm = body.distanceCm ?? body.distance;
  const latitude = body.latitude ?? body.lat ?? null;
  const longitude = body.longitude ?? body.lng ?? null;
  const ml = parseMl(body.mlClass ?? body.mlPrediction ?? body.prediction, body.mlConfidence ?? body.confidence);
  // Bridge posts from live_detection.py (2026-10-31): a pure
  // sensorObstacle / trackClear post carries neither distance nor ML.
  if (body.trackClear === true) {
    const station0 = body.nearestStation || body.station || 'Mysuru';
    deviceState.markClear(station0, body.sectionId || 'section-1');
    console.log('[ingest] %s trackClear (bridge)', station0);
    return res.json({ ok: true, obstacle: false, trackClear: true });
  }
  const sensorFlag = body.sensorObstacle === true;
  if (typeof distanceCm !== 'number' && !ml && !sensorFlag) return res.status(400).json({ error: 'distanceCm (number) is required, unless mlClass or sensorObstacle is sent' });
  const station = body.nearestStation || body.station
    || (body.stationId && !String(body.stationId).startsWith('station-') ? body.stationId : 'Mysuru');
  const stationId = body.stationId || null;
  const sectionId = body.sectionId || 'section-1';
  const divisionId = body.divisionId || 'division-1';
  const trainNumber = body.trainNumber ? String(body.trainNumber).trim() : null;
  let trainName = null;
  if (trainNumber) { const t = await store.getTrainByNumber(trainNumber); if (t) trainName = t.trainName; }
  console.log('[ingest] %s distance=%s cm gps=%s,%s train=%s sms=%s ml=%s', station, distanceCm ?? '-', latitude, longitude, trainNumber || '-', !!body.smsSent,
    ml ? `${ml.mlClass} @ ${ml.mlConfidence ?? '-'}` : '-');
  if (typeof distanceCm === 'number') deviceState.updateReading(distanceCm, station, sectionId);
  if (latitude != null && longitude != null) deviceState.updateGps(latitude, longitude, station, sectionId);
  else deviceState.markGpsWaiting(station, sectionId);
  const sensorObstacle = sensorFlag || (typeof distanceCm === 'number' && distanceCm > 0 && distanceCm < 10);
  const mlObstacle = !!(ml && ml.isObstacle);
  const isObstacle = sensorObstacle || mlObstacle;
  const node = deviceState.getStatus(station);
  await store.upsertHealthAlert({
    station, stationId, sectionId, deviceId: 'track-node-1',
    status: node.deviceOnline ? 'online' : 'offline', deviceOnline: node.deviceOnline,
    sensorOk: typeof distanceCm === 'number' ? distanceCm > 0 : true, gpsOk: latitude != null, gsmOk: node.gsmOk ?? null,
    buzzerOk: node.buzzerOk ?? null, lastDistanceCm: typeof distanceCm === 'number' ? distanceCm : node.lastDistanceCm ?? null, latitude, longitude,
    lastSeenAt: new Date(), message: isObstacle ? (mlObstacle && !sensorObstacle ? `ML detected: ${ml.mlClass}` : 'Obstacle detected') : 'Track clear',
  });
  if (isObstacle) {
    deviceState.markObstacle(station, sectionId);
    const { incident, merged } = await incidentService.handleObstacle({
      distanceCm: typeof distanceCm === 'number' ? distanceCm : null, latitude, longitude, smsSent: !!body.smsSent,
      source: mlObstacle && !sensorObstacle ? 'ml' : 'http',
      stationId, sectionId, divisionId, nearestStation: station, trainNumber, trainName,
      mlClass: ml ? ml.mlClass : null, mlConfidence: ml ? ml.mlConfidence : null,
    });
    if (body.smsSent) deviceState.markSmsSent(station, sectionId);
    return res.json({ ok: true, obstacle: true, incidentId: incident.id, merged, mlClass: ml ? ml.mlClass : null });
  }
  deviceState.markClear(station, sectionId);
  return res.json({ ok: true, obstacle: false, mlClass: ml ? ml.mlClass : null });
}
module.exports = { setSerial, status, buzzer, ping, ingest, commands };

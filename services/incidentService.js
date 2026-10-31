const store = require('./store');
const deviceState = require('./deviceState');

let lastCountedAt = 0;

async function handleObstacle({ distanceCm, latitude, longitude, smsSent, source, stationId, sectionId, divisionId, nearestStation, trainNumber, trainName, mlClass, mlConfidence }) {
  const windowMs = Number(process.env.INCIDENT_MERGE_WINDOW_MS || 300000);
  const station = nearestStation || stationId || 'Mysuru';
  const existing = await store.findMergeableIncident(latitude ?? null, longitude ?? null, windowMs, station);
  if (existing) {
    const now = Date.now();
    const patch = { lastDetectedAt: new Date(), distanceCm: typeof distanceCm === 'number' ? distanceCm : existing.distanceCm };
    if (latitude != null) { patch.latitude = latitude; patch.longitude = longitude; patch.mapsUrl = store.mapsUrlFor(latitude, longitude); }
    if (smsSent && !existing.smsSent) { patch.smsSent = true; patch.smsSentAt = new Date(); }
    if (trainNumber && !existing.trainNumber) { patch.trainNumber = trainNumber; if (trainName) patch.trainName = trainName; }
    if (mlClass) { patch.mlClass = mlClass; patch.mlConfidence = mlConfidence ?? null; }
    if (now - lastCountedAt >= 10000) { patch.detectionCount = (existing.detectionCount || 1) + 1; lastCountedAt = now; }
    return { incident: await store.updateIncident(existing.id, patch), merged: true };
  }
  lastCountedAt = Date.now();
  const incident = await store.createIncident({
    distanceCm, latitude, longitude, smsSent, source, stationId, sectionId, divisionId,
    nearestStation: station, trainNumber, trainName, mlClass, mlConfidence,
  });
  return { incident, merged: false };
}

async function markSmsSentForLatestOpen(station) {
  const targetStation = station || 'Mysuru';
  const open = (await store.listIncidents('New')).filter((i) => String(i.nearestStation).trim().toLowerCase() === String(targetStation).trim().toLowerCase());
  const target = open[0] || (await store.listIncidents('Acknowledged')).filter((i) => String(i.nearestStation).trim().toLowerCase() === String(targetStation).trim().toLowerCase())[0];
  if (target && !target.smsSent) await store.updateIncident(target.id, { smsSent: true, smsSentAt: new Date() });
  deviceState.markSmsSent(targetStation);
}
function auditEntry(user, action, detail) {
  const designation = user.designation || (user.department === 'RailwayAdmin' ? 'DOM' : user.department === 'TrafficInspector' ? 'TI' : 'SS');
  return { action, by: user.username || user.name || user.user_id, designation, at: new Date(), detail: detail || '' };
}
module.exports = { handleObstacle, markSmsSentForLatestOpen, auditEntry };

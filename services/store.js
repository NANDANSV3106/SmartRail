/**
 * Storage layer: MongoDB via Mongoose when connected, otherwise in-memory.
 * Collections (exactly the four you asked for):
 *   users, incidents, health_alerts, trains
 * Database name in .env.example: smart-train-db (as in your screenshots).
 * In-memory mode is a demo fallback only — data is lost on restart.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');

let useMongo = false;
const mem = { users: [], incidents: [], healthAlerts: [], trains: [] };
function id() { return crypto.randomUUID(); }
const normStation = (s) => String(s || '').trim();

function normUser(u) {
  if (!u) return null;
  const o = u.toObject ? u.toObject() : { ...u };
  const designation = o.designation
    || (o.department === 'RailwayAdmin' ? 'DOM' : o.department === 'TrafficInspector' ? 'TI' : 'SS');
  return {
    id: String(o._id || o.id),
    username: o.username || o.name || null,
    name: o.username || o.name || null,
    user_id: o.user_id || null,
    email: o.email || null,
    department: o.department || (designation === 'DOM' ? 'RailwayAdmin' : designation === 'TI' ? 'TrafficInspector' : 'StationMaster'),
    station: normStation(o.station) || null,
    designation, stationId: o.stationId || null, sectionId: o.sectionId || null,
    divisionId: o.divisionId || 'division-1',
    role: o.role || null,
    password: o.password || o.passwordHash || null, // hash only; publicUser strips it
    createdAt: o.createdAt,
  };
}
function publicUser(u) { const n = normUser(u); if (n) { delete n.password; } return n; }

function normIncident(i) {
  if (!i) return null;
  const o = i.toObject ? i.toObject() : { ...i };
  const details = o.assessmentDetails || {};
  return {
    id: String(o._id || o.id),
    trainNumber: o.trainNumber || null, trainName: o.trainName || null,
    nearestStation: o.nearestStation || o.station || 'Unknown',
    station: o.station || o.nearestStation || null,
    stationId: o.stationId || null, sectionId: o.sectionId || 'section-1', divisionId: o.divisionId || 'division-1',
    distanceCm: o.distanceCm ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    mapsUrl: o.mapsUrl || null, status: o.status || 'New',
    smsSent: !!o.smsSent, smsSentAt: o.smsSentAt || null, detectionCount: o.detectionCount || 1,
    firstDetectedAt: o.firstDetectedAt, lastDetectedAt: o.lastDetectedAt, reportedAt: o.reportedAt || o.firstDetectedAt,
    obstacleType: o.obstacleType || details.obstacleType || 'Unknown',
    assessedBy: o.assessedBy ? String(o.assessedBy) : null, assessedAt: o.assessedAt || null,
    acknowledgedBy: o.acknowledgedBy ? String(o.acknowledgedBy) : null, acknowledgedAt: o.acknowledgedAt || null,
    resolvedBy: o.resolvedBy ? String(o.resolvedBy) : null, resolvedAt: o.resolvedAt || null,
    assessmentDetails: {
      obstacleType: details.obstacleType || o.obstacleType || 'Unknown',
      casualtyCount: details.casualtyCount || 0, severity: details.severity || 'None',
      forestDeptNotified: !!details.forestDeptNotified, policeNotified: !!details.policeNotified,
    },
    trackCleared: !!o.trackCleared, clearedBy: o.clearedBy || null, clearedAt: o.clearedAt || null,
    mlClass: o.mlClass || null, mlConfidence: o.mlConfidence ?? null,
    history: o.history || [], source: o.source || 'serial', deviceId: o.deviceId || 'track-node-1',
    createdAt: o.createdAt, updatedAt: o.updatedAt,
  };
}
function normTrain(t) {
  if (!t) return null;
  const o = t.toObject ? t.toObject() : { ...t };
  return { id: String(o._id || o.id), trainNumber: o.trainNumber, trainName: o.trainName, fromStation: o.fromStation || '', toStation: o.toStation || '', createdAt: o.createdAt };
}
function normAlert(a) {
  if (!a) return null;
  const o = a.toObject ? a.toObject() : { ...a };
  return {
    id: String(o._id || o.id), station: o.station || o.nearestStation || 'Unknown',
    nearestStation: o.nearestStation || o.station || null, stationId: o.stationId || null,
    sectionId: o.sectionId || 'section-1', deviceId: o.deviceId || 'track-node-1',
    status: o.status || 'offline', deviceOnline: !!o.deviceOnline,
    sensorOk: o.sensorOk ?? null, gpsOk: o.gpsOk ?? null, gsmOk: o.gsmOk ?? null,
    buzzerOk: o.buzzerOk ?? null, buzzerOn: !!o.buzzerOn,
    lastDistanceCm: o.lastDistanceCm ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    lastSeenAt: o.lastSeenAt || null, message: o.message || o.note || '', createdAt: o.createdAt, updatedAt: o.updatedAt,
  };
}

async function connectDB(uri) {
  if (!uri) { console.warn('[db] No MONGO_URI set — using in-memory storage (data lost on restart).'); return false; }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    useMongo = true; console.log('[db] Connected to MongoDB'); return true;
  } catch (err) {
    console.warn('[db] MongoDB unavailable (%s) — using in-memory storage (data lost on restart).', err.message); return false;
  }
}
function isMongo() { return useMongo; }
function mapsUrlFor(lat, lng) { return (lat != null && lng != null) ? `https://maps.google.com/?q=${lat},${lng}` : null; }

// ---- Users ----
async function findUserByUserId(userId) {
  if (useMongo) return normUser(await require('../models/User').findOne({ user_id: String(userId).trim() }));
  return normUser(mem.users.find((u) => u.user_id === String(userId).trim())) || null;
}
async function findUserByEmail(email) {
  if (useMongo) return normUser(await require('../models/User').findOne({ email: String(email).toLowerCase() }));
  return normUser(mem.users.find((u) => u.email === String(email).toLowerCase())) || null;
}
async function findUserById(uid) {
  if (!uid) return null;
  if (useMongo) {
    try { return normUser(await require('../models/User').findById(uid)); } catch { return null; }
  }
  return normUser(mem.users.find((u) => u.id === String(uid))) || null;
}
async function createUser(input) {
  const designation = input.designation
    || (input.department === 'RailwayAdmin' ? 'DOM' : input.department === 'TrafficInspector' ? 'TI' : 'SS');
  const department = input.department
    || (designation === 'DOM' ? 'RailwayAdmin' : designation === 'TI' ? 'TrafficInspector' : 'StationMaster');
  const doc = {
    username: input.username || input.name, user_id: String(input.user_id).trim(),
    password: input.password || input.passwordHash,
    department, station: normStation(input.station), designation,
    stationId: input.stationId || null, sectionId: input.sectionId || null,
    divisionId: input.divisionId || 'division-1',
    name: input.username || input.name || null, email: input.email ? String(input.email).toLowerCase() : null,
    role: input.role || null,
  };
  if (useMongo) return publicUser(await require('../models/User').create(doc));
  const u = { id: id(), ...doc, createdAt: new Date() }; mem.users.push(u); return publicUser(u);
}
async function listUsers() {
  if (useMongo) return (await require('../models/User').find().sort({ createdAt: 1 })).map(publicUser);
  return mem.users.map(publicUser);
}
async function countUsers() {
  if (useMongo) return require('../models/User').countDocuments();
  return mem.users.length;
}

// ---- Incidents ----
async function createIncident(data) {
  const nearest = normStation(data.nearestStation || data.station) || (data.stationId && !String(data.stationId).startsWith('station-') ? data.stationId : 'Unknown');
  const base = {
    trainNumber: data.trainNumber || null, trainName: data.trainName || null,
    nearestStation: nearest, station: nearest,
    stationId: data.stationId || null, sectionId: data.sectionId || 'section-1', divisionId: data.divisionId || 'division-1',
    distanceCm: data.distanceCm ?? null, latitude: data.latitude ?? null, longitude: data.longitude ?? null,
    mapsUrl: mapsUrlFor(data.latitude, data.longitude), status: 'New', smsSent: !!data.smsSent,
    smsSentAt: data.smsSent ? new Date() : null, detectionCount: 1,
    firstDetectedAt: new Date(), lastDetectedAt: new Date(), reportedAt: new Date(),
    obstacleType: 'Unknown', assessedBy: null, assessedAt: null, acknowledgedBy: null, acknowledgedAt: null,
    resolvedBy: null, resolvedAt: null,
    assessmentDetails: { obstacleType: 'Unknown', casualtyCount: 0, severity: 'None', forestDeptNotified: false, policeNotified: false },
    trackCleared: false, clearedBy: null, clearedAt: null, history: [],
    mlClass: data.mlClass || null, mlConfidence: data.mlConfidence ?? null,
    source: data.source || 'serial', deviceId: data.deviceId || 'track-node-1',
  };
  if (useMongo) return normIncident(await require('../models/Incident').create(base));
  const rec = { id: id(), ...base, createdAt: new Date(), updatedAt: new Date() }; mem.incidents.push(rec); return normIncident(rec);
}
async function listIncidents(status) {
  let rows;
  const normStatus = (s) => s ? String(s).toLowerCase() : null;
  if (useMongo) {
    const q = status ? { status: new RegExp(`^${status}$`, 'i') } : {};
    rows = await require('../models/Incident').find(q).sort({ lastDetectedAt: -1 });
  } else {
    rows = mem.incidents.filter((i) => !status || normStatus(i.status) === normStatus(status))
      .sort((a, b) => new Date(b.lastDetectedAt) - new Date(a.lastDetectedAt));
  }
  return rows.map(normIncident);
}
async function getIncident(incidentId) {
  if (useMongo) { try { return normIncident(await require('../models/Incident').findById(incidentId)); } catch { return null; } }
  return normIncident(mem.incidents.find((i) => i.id === incidentId)) || null;
}
async function updateIncident(incidentId, patch) {
  if (useMongo) return normIncident(await require('../models/Incident').findByIdAndUpdate(incidentId, patch, { new: true }));
  const rec = mem.incidents.find((i) => i.id === incidentId); if (!rec) return null;
  Object.assign(rec, patch, { updatedAt: new Date() }); return normIncident(rec);
}
async function deleteIncident(incidentId) {
  if (useMongo) { const r = await require('../models/Incident').findByIdAndDelete(incidentId); return !!r; }
  const i = mem.incidents.findIndex((x) => x.id === incidentId); if (i < 0) return false; mem.incidents.splice(i, 1); return true;
}
async function findMergeableIncident(latitude, longitude, windowMs, station) {
  const since = new Date(Date.now() - windowMs);
  const target = normStation(station).toLowerCase();
  const candidates = (await listIncidents()).filter((i) => i.status !== 'Resolved'
    && normStation(i.nearestStation).toLowerCase() === target && new Date(i.lastDetectedAt) >= since);
  return candidates.find((i) => {
    if (i.latitude == null || latitude == null) return true;
    return Math.abs(i.latitude - latitude) < 0.001 && Math.abs(i.longitude - longitude) < 0.001;
  }) || null;
}

// ---- Trains ----
async function listTrains() {
  if (useMongo) return (await require('../models/Train').find().sort({ trainNumber: 1 })).map(normTrain);
  return [...mem.trains].sort((a, b) => String(a.trainNumber).localeCompare(String(b.trainNumber))).map(normTrain);
}
async function getTrainByNumber(trainNumber) {
  if (useMongo) return normTrain(await require('../models/Train').findOne({ trainNumber: String(trainNumber).trim() }));
  return normTrain(mem.trains.find((t) => t.trainNumber === String(trainNumber).trim())) || null;
}
async function createTrain({ trainNumber, trainName, fromStation, toStation }) {
  const doc = { trainNumber: String(trainNumber).trim(), trainName: String(trainName).trim(), fromStation: fromStation || '', toStation: toStation || '' };
  if (useMongo) return normTrain(await require('../models/Train').create(doc));
  const t = { id: id(), ...doc, createdAt: new Date() }; mem.trains.push(t); return normTrain(t);
}
async function updateTrain(trainId, patch) {
  if (useMongo) return normTrain(await require('../models/Train').findByIdAndUpdate(trainId, patch, { new: true }));
  const t = mem.trains.find((x) => x.id === trainId); if (!t) return null; Object.assign(t, patch); return normTrain(t);
}
async function deleteTrain(trainId) {
  if (useMongo) { const r = await require('../models/Train').findByIdAndDelete(trainId); return !!r; }
  const i = mem.trains.findIndex((x) => x.id === trainId); if (i < 0) return false; mem.trains.splice(i, 1); return true;
}
async function countTrains() {
  if (useMongo) return require('../models/Train').countDocuments();
  return mem.trains.length;
}

// ---- Health alerts ----
async function upsertHealthAlert(entry) {
  const key = normStation(entry.station || entry.nearestStation);
  const doc = { ...entry, station: key, nearestStation: key, updatedAt: new Date() };
  if (useMongo) {
    const Model = require('../models/HealthAlert');
    const saved = await Model.findOneAndUpdate({ station: key }, doc, { new: true, upsert: true, setDefaultsOnInsert: true });
    return normAlert(saved);
  }
  const ex = mem.healthAlerts.find((a) => normStation(a.station) === key);
  if (ex) { Object.assign(ex, doc); return normAlert(ex); }
  const a = { id: id(), ...doc, createdAt: new Date() }; mem.healthAlerts.push(a); return normAlert(a);
}
async function recordHealthLog(entry) { return upsertHealthAlert(entry); }
async function listHealthLogs(limit = 50) { return listHealthAlerts(limit); }
async function listHealthAlerts(limit = 50) {
  if (useMongo) return (await require('../models/HealthAlert').find().sort({ updatedAt: -1 }).limit(limit)).map(normAlert);
  return mem.healthAlerts.slice(0, limit).map(normAlert);
}

module.exports = {
  connectDB, isMongo, mapsUrlFor,
  findUserByEmail, findUserByUserId, findUserById, createUser, listUsers, countUsers,
  createIncident, listIncidents, getIncident, updateIncident, deleteIncident, findMergeableIncident,
  listTrains, getTrainByNumber, createTrain, updateTrain, deleteTrain, countTrains,
  upsertHealthAlert, recordHealthLog, listHealthLogs, listHealthAlerts,
};

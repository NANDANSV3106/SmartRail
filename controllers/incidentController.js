const store = require('../services/store');
const perms = require('../services/permissions');
const { auditEntry } = require('../services/incidentService');

const OBSTACLE_TYPES = ['Human', 'Animal', 'Vehicle', 'Boulder', 'Other', 'Unknown'];
const SEVERITIES = ['None', 'Minor', 'Major', 'Fatal'];
const STATUSES = ['New', 'Acknowledged', 'Assessed', 'Resolved'];

function assessmentDetailsFrom(body, existing, obstacleType) {
  const base = existing || {};
  const count = Number(body.casualtyCount);
  return {
    obstacleType: obstacleType || base.obstacleType || 'Unknown',
    casualtyCount: Number.isFinite(count) && count >= 0 ? Math.floor(count) : (base.casualtyCount || 0),
    severity: SEVERITIES.includes(body.severity) ? body.severity : (base.severity || 'None'),
    forestDeptNotified: body.forestDeptNotified === true ? true : (body.forestDeptNotified === false ? false : !!base.forestDeptNotified),
    policeNotified: body.policeNotified === true ? true : (body.policeNotified === false ? false : !!base.policeNotified),
  };
}
async function enrich(incidents) {
  const users = await store.listUsers();
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const nameOf = (uid) => { const u = uid ? byId.get(String(uid)) : null; return u ? (u.username || u.user_id) : null; };
  return incidents.map((i) => ({
    ...i,
    assessedByName: nameOf(i.assessedBy), resolvedByName: nameOf(i.resolvedBy),
    acknowledgedByName: nameOf(i.acknowledgedBy),
  }));
}
async function list(req, res) {
  const { status, trainNumber, nearestStation } = req.query;
  let wanted = null;
  if (status) {
    const match = STATUSES.find((s) => s.toLowerCase() === String(status).toLowerCase());
    if (!match) return res.status(400).json({ error: 'Invalid status filter' });
    wanted = match;
  }
  let all = await store.listIncidents(wanted);
  if (trainNumber) all = all.filter((i) => String(i.trainNumber || '') === String(trainNumber));
  if (nearestStation) all = all.filter((i) => perms.normStation(i.nearestStation) === perms.normStation(nearestStation));
  const scoped = perms.filterIncidents(req.user, all);
  res.json({ incidents: await enrich(scoped), scope: perms.scopeOf(req.user) });
}
async function loadScoped(req, res) {
  const inc = await store.getIncident(req.params.id);
  if (!inc) { res.status(404).json({ error: 'Incident not found' }); return null; }
  if (!perms.canViewIncident(req.user, inc)) { res.status(403).json({ error: 'Not in your station / section scope' }); return null; }
  return inc;
}
function withHistory(inc, entry) { return { history: [...(inc.history || []), entry] }; }
function displayName(user) { return user.username || user.name || user.user_id; }

async function acknowledge(req, res) {
  const inc = await loadScoped(req, res); if (!inc) return;
  if (!perms.canModifyIncident(req.user, inc)) return res.status(403).json({ error: 'TI view is read-only — only the SS (own station) or DOM can acknowledge' });
  if (inc.status === 'Resolved') return res.status(400).json({ error: 'Cannot acknowledge a resolved incident' });
  const updated = await store.updateIncident(inc.id, {
    status: 'Acknowledged', acknowledgedBy: req.user.id, acknowledgedAt: new Date(),
    ...withHistory(inc, auditEntry(req.user, 'acknowledged', '')),
  });
  res.json({ incident: (await enrich([updated]))[0] });
}
async function resolve(req, res) {
  const inc = await loadScoped(req, res); if (!inc) return;
  if (!perms.canModifyIncident(req.user, inc)) return res.status(403).json({ error: 'TI view is read-only — only the SS (own station) or DOM can resolve' });
  if (inc.status === 'Resolved') return res.status(400).json({ error: 'Incident is already resolved' });
  const updated = await store.updateIncident(inc.id, {
    status: 'Resolved', resolvedBy: req.user.id, resolvedAt: new Date(),
    ...withHistory(inc, auditEntry(req.user, 'resolved', '')),
  });
  res.json({ incident: (await enrich([updated]))[0] });
}
async function assess(req, res) {
  const inc = await loadScoped(req, res); if (!inc) return;
  if (!perms.canModifyIncident(req.user, inc)) return res.status(403).json({ error: 'TI view is read-only' });
  const { obstacleType } = req.body || {};
  if (!OBSTACLE_TYPES.includes(obstacleType)) return res.status(400).json({ error: 'obstacleType must be Human, Animal, Vehicle, Boulder, Other or Unknown' });
  const details = assessmentDetailsFrom(req.body || {}, inc.assessmentDetails, obstacleType);
  const patch = {
    obstacleType, assessedBy: req.user.id, assessedAt: new Date(), assessmentDetails: details,
    ...withHistory(inc, auditEntry(req.user, 'assessed', `Obstacle: ${obstacleType}, casualties: ${details.casualtyCount}, severity: ${details.severity}`)),
  };
  if (inc.status !== 'Resolved') patch.status = 'Assessed';
  if (req.body.trainNumber) {
    patch.trainNumber = String(req.body.trainNumber).trim();
    const train = await store.getTrainByNumber(patch.trainNumber);
    if (train) patch.trainName = train.trainName;
  }
  const updated = await store.updateIncident(inc.id, patch);
  res.json({ incident: (await enrich([updated]))[0] });
}
async function clearTrack(req, res) {
  const inc = await loadScoped(req, res); if (!inc) return;
  if (!perms.canModifyIncident(req.user, inc)) return res.status(403).json({ error: 'TI view is read-only — only the SS (own station) or DOM can clear the track' });
  if (inc.status === 'Resolved' && inc.trackCleared) return res.status(400).json({ error: 'Track is already cleared for this incident' });
  const { obstacleType } = req.body || {};
  const patch = {
    status: 'Resolved', trackCleared: true, clearedBy: displayName(req.user), clearedAt: new Date(),
    resolvedBy: req.user.id, resolvedAt: new Date(),
    ...withHistory(inc, auditEntry(req.user, 'clear-track', 'Track manually inspected and cleared')),
  };
  if (OBSTACLE_TYPES.includes(obstacleType)) {
    patch.obstacleType = obstacleType; patch.assessedBy = req.user.id; patch.assessedAt = new Date();
    patch.assessmentDetails = assessmentDetailsFrom(req.body || {}, inc.assessmentDetails, obstacleType);
  }
  const updated = await store.updateIncident(inc.id, patch);
  res.json({ incident: (await enrich([updated]))[0] });
}
async function remove(req, res) {
  const inc = await store.getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  const ok = await store.deleteIncident(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Incident not found' });
  res.json({ ok: true });
}
module.exports = { list, acknowledge, resolve, assess, clearTrack, remove };

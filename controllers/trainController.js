const store = require('../services/store');
const perms = require('../services/permissions');

async function list(req, res) { res.json({ trains: await store.listTrains() }); }
async function create(req, res) {
  if (!perms.canManageTrains(req.user)) return res.status(403).json({ error: 'DOM only' });
  const { trainNumber, trainName, fromStation, toStation } = req.body || {};
  if (!trainNumber || !trainName) return res.status(400).json({ error: 'trainNumber and trainName are required' });
  if (await store.getTrainByNumber(trainNumber)) return res.status(409).json({ error: 'That train number already exists' });
  const train = await store.createTrain({ trainNumber, trainName, fromStation, toStation });
  res.status(201).json({ train });
}
async function update(req, res) {
  if (!perms.canManageTrains(req.user)) return res.status(403).json({ error: 'DOM only' });
  const train = await store.updateTrain(req.params.id, req.body || {});
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json({ train });
}
async function remove(req, res) {
  if (!perms.canManageTrains(req.user)) return res.status(403).json({ error: 'DOM only' });
  const ok = await store.deleteTrain(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Train not found' });
  res.json({ ok: true });
}
module.exports = { list, create, update, remove };

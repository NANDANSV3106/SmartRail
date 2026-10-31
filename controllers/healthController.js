const deviceState = require('../services/deviceState');
const store = require('../services/store');
const perms = require('../services/permissions');

async function getHealth(req, res) {
  const nodes = perms.filterNodes(req.user, deviceState.getAllNodes());
  const alerts = perms.filterHealthAlerts(req.user, await store.listHealthAlerts(50));
  res.json({ health: nodes[0] || null, nodes, alerts, scope: perms.scopeOf(req.user), usingMongo: store.isMongo() });
}
async function logs(req, res) {
  const alerts = perms.filterHealthAlerts(req.user, await store.listHealthAlerts(50));
  res.json({ logs: alerts, alerts });
}
module.exports = { getHealth, logs };

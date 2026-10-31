/**
 * Live, in-memory state of the track nodes, keyed by station.
 * The default node is station-1 / section-1 (the single USB node from v1).
 * Online = a reading (serial or HTTP) arrived in the last 15 seconds.
 * The original firmware sends a reading every 500 ms, so 15 s is generous
 * and still catches a disconnected / powered-off node quickly.
 */
const ONLINE_WINDOW_MS = 15000;

const nodes = new Map(); // stationId -> node state
let serialConnected = false;
// Pending commands for Wi-Fi nodes. A USB node gets commands over serial
// immediately; a battery/Wi-Fi node cannot be reached that way, so the
// dashboard queues a command here and the node picks it up when it polls
// GET /api/device/commands with its device key (see deviceController).
const pendingCommands = new Map(); // stationId -> [ 'BUZZER:ON', ... ]
function queueCommand(stationId, cmd) {
  const id = stationId || 'station-1';
  if (!pendingCommands.has(id)) pendingCommands.set(id, []);
  pendingCommands.get(id).push(cmd);
}
function takeCommands(stationId) {
  const id = stationId || 'station-1';
  const cmds = pendingCommands.get(id) || [];
  pendingCommands.set(id, []);
  return cmds;
}

function ensureNode(stationId = 'station-1', sectionId = 'section-1') {
  const id = stationId || 'station-1';
  if (!nodes.has(id)) {
    nodes.set(id, {
      stationId: id, sectionId: sectionId || 'section-1', divisionId: 'division-1',
      lastSeenAt: null, lastDistanceCm: null, latitude: null, longitude: null,
      gpsOk: null, sensorOk: null, gsmOk: null, buzzerOk: null, buzzerOn: false,
      lastEvent: null, lastSmsAt: null, lastPongAt: null, lastBuzzerCommandAt: null,
    });
  }
  const node = nodes.get(id);
  if (sectionId) node.sectionId = sectionId;
  return node;
}
function touch(node) { node.lastSeenAt = new Date(); }
function updateReading(distanceCm, stationId, sectionId) {
  const node = ensureNode(stationId, sectionId); touch(node);
  if (typeof distanceCm === 'number' && !Number.isNaN(distanceCm)) {
    node.lastDistanceCm = distanceCm;
    // pulseIn() timeout returns 0, which is "no echo", not a 0 cm obstacle.
    node.sensorOk = distanceCm > 0;
  }
}
function updateGps(lat, lng, stationId, sectionId) {
  const node = ensureNode(stationId, sectionId);
  if (lat == null || lng == null) { node.gpsOk = false; return; }
  touch(node); node.latitude = lat; node.longitude = lng; node.gpsOk = true;
}
function markGpsWaiting(stationId, sectionId) { ensureNode(stationId, sectionId).gpsOk = false; }
function markObstacle(stationId, sectionId) { const n = ensureNode(stationId, sectionId); touch(n); n.lastEvent = 'obstacle'; }
function markClear(stationId, sectionId) { const n = ensureNode(stationId, sectionId); touch(n); n.lastEvent = 'clear'; }
function markSmsSent(stationId, sectionId) { const n = ensureNode(stationId, sectionId); touch(n); n.gsmOk = true; n.lastSmsAt = new Date(); }
function markBuzzer(on, ok = true, stationId, sectionId) { const n = ensureNode(stationId, sectionId); n.buzzerOn = !!on; n.buzzerOk = ok; n.lastBuzzerCommandAt = new Date(); }
function markPong(stationId, sectionId) { const n = ensureNode(stationId, sectionId); touch(n); n.lastPongAt = new Date(); }
function setConnected(v) { serialConnected = !!v; }

function statusOf(node) {
  const online = !!(node.lastSeenAt && (Date.now() - new Date(node.lastSeenAt).getTime() < ONLINE_WINDOW_MS));
  return { ...node, connected: serialConnected, deviceOnline: online, lastSeenAt: node.lastSeenAt };
}
// Single-node view for v1 callers / the default node.
function getStatus(stationId) { return statusOf(ensureNode(stationId)); }
function getAllNodes() {
  // Only nodes that have actually reported — the empty default node
  // created at import must not show up as a "health alert" station.
  return [...nodes.values()].filter((n) => n.lastSeenAt).map(statusOf);
}
// Backwards-compatible `state` export: the default node's state object.
const state = ensureNode();

module.exports = {
  state, nodes, ensureNode, touch: (stationId) => touch(ensureNode(stationId)),
  updateReading, updateGps, markGpsWaiting, markObstacle, markClear,
  markSmsSent, markBuzzer, markPong, setConnected, getStatus, getAllNodes,
  queueCommand, takeCommands,
};

/**
 * Scope and permission rules for the 3 SmartRail designations.
 * Enforced on the SERVER, not just by hiding buttons.
 *
 *  SS : one station (station NAME, e.g. "Mysuru"). View + assess +
 *       acknowledge + resolve + clear-track for that station only.
 *  TI : one section (section-1 covers Mysuru / Mandya / Bengaluru by
 *       default — see sectionOfIncident). Read-only supervisory view.
 *  DOM: the whole division. View everything, create accounts and
 *       trains, delete incidents, override any incident.
 *
 * Station matching is by NAME, trimmed and case-insensitive, because
 * the screenshots use "Mysuru", "Mandya", "Bengaluru" — not station-1.
 * Old station-1 style ids still match if a user/incident carries them.
 */
function designationOf(user) {
  if (!user) return null;
  if (user.designation) return user.designation;
  if (user.department === 'RailwayAdmin') return 'DOM';
  if (user.department === 'TrafficInspector') return 'TI';
  if (user.role === 'admin') return 'DOM';
  return 'SS';
}
function normStation(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
// Default section for the stations in the screenshots. A station that is
// not in this map falls back to section-1, so a TI is never blind to a
// new station by accident — the DOM can set sectionId explicitly.
const STATION_SECTIONS = { mysuru: 'section-1', mandya: 'section-1', bengaluru: 'section-1' };
function sectionOfIncident(incident) {
  if (incident.sectionId) return incident.sectionId;
  return STATION_SECTIONS[normStation(incident.nearestStation || incident.station)] || 'section-1';
}
function stationsOfIncident(incident) {
  return [incident.nearestStation, incident.station, incident.stationId]
    .map(normStation).filter(Boolean);
}
function stationsOfUser(user) {
  return [user.station, user.stationId].map(normStation).filter(Boolean);
}
function scopeOf(user) {
  return {
    designation: designationOf(user),
    station: user.station || null,
    stationId: user.stationId || null,
    sectionId: user.sectionId || 'section-1',
    divisionId: user.divisionId || 'division-1',
  };
}
function canViewIncident(user, incident) {
  const s = scopeOf(user);
  if (s.designation === 'DOM') return true;
  if (s.designation === 'TI') return sectionOfIncident(incident) === s.sectionId;
  const us = stationsOfUser(user);
  if (!us.length) return true; // SS with no station set: do not hide everything
  return stationsOfIncident(incident).some((x) => us.includes(x));
}
function canModifyIncident(user, incident) {
  if (designationOf(user) === 'DOM') return true;
  if (designationOf(user) === 'TI') return false;
  return canViewIncident(user, incident);
}
function canCreateUsers(user) { return designationOf(user) === 'DOM'; }
function canDeleteIncident(user) { return designationOf(user) === 'DOM'; }
function canManageTrains(user) { return designationOf(user) === 'DOM'; }
function canControlDevice(user, station) {
  const s = scopeOf(user);
  if (s.designation === 'DOM') return true;
  if (s.designation === 'TI') return false;
  const target = normStation(station);
  if (!target) return true;
  return stationsOfUser(user).includes(target) || stationsOfUser(user).length === 0;
}
function filterIncidents(user, incidents) {
  return incidents.filter((i) => canViewIncident(user, i));
}
function filterNodes(user, nodes) {
  const s = scopeOf(user);
  if (s.designation === 'DOM') return nodes;
  if (s.designation === 'TI') {
    return nodes.filter((n) => (n.sectionId || sectionOfIncident(n)) === s.sectionId);
  }
  const us = stationsOfUser(user);
  if (!us.length) return nodes;
  return nodes.filter((n) => [n.station, n.nearestStation, n.stationId].map(normStation).some((x) => us.includes(x)));
}
function filterHealthAlerts(user, alerts) { return filterNodes(user, alerts); }
function scopeLabel(user) {
  const s = scopeOf(user);
  if (s.designation === 'DOM') return 'Division: all stations';
  if (s.designation === 'TI') return `Section: ${s.sectionId} (read-only)`;
  return `Station: ${s.station || s.stationId || 'all'}`;
}
module.exports = {
  designationOf, scopeOf, normStation, sectionOfIncident,
  canViewIncident, canModifyIncident, canCreateUsers, canDeleteIncident,
  canManageTrains, canControlDevice, filterIncidents, filterNodes,
  filterHealthAlerts, scopeLabel,
};

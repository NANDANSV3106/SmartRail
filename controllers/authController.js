const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../services/store');
const { designationOf } = require('../services/permissions');

function sign(user) {
  return jwt.sign(
    {
      id: user.id, name: user.username || user.name, username: user.username || user.name,
      user_id: user.user_id, department: user.department,
      designation: designationOf(user), station: user.station || null,
      stationId: user.stationId || null, sectionId: user.sectionId || null,
      divisionId: user.divisionId || 'division-1', role: user.role || null,
    },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '8h' },
  );
}
function publicOf(user) { if (!user) return null; const { password: _p, ...pub } = user; return pub; }

async function login(req, res) {
  const { user_id, username, email, password } = req.body || {};
  const loginId = user_id || username || email;
  if (!loginId || !password) return res.status(400).json({ error: 'User ID and password are required' });
  let user = await store.findUserByUserId(loginId);
  if (!user && email) user = await store.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Wrong user ID or password' });
  const hash = user.password;
  if (!hash || !(await bcrypt.compare(password, hash))) {
    return res.status(401).json({ error: 'Wrong user ID or password' });
  }
  res.json({ token: sign(user), user: publicOf(user) });
}

// DOM only. No self-signup: the DOM creates each account, so a random
// visitor cannot create a login or pick a wider scope.
async function register(req, res) {
  const { username, name, user_id, password, department, station, designation, stationId, sectionId, divisionId } = req.body || {};
  if (!username && !name) return res.status(400).json({ error: 'Username is required' });
  if (!user_id || !password) return res.status(400).json({ error: 'user_id and password are required' });
  const des = designation || (department === 'RailwayAdmin' ? 'DOM' : department === 'TrafficInspector' ? 'TI' : 'SS');
  if (!['SS', 'TI', 'DOM'].includes(des)) return res.status(400).json({ error: 'Designation must be SS, TI or DOM' });
  if (des === 'SS' && !station && !stationId) return res.status(400).json({ error: 'SS accounts need a station (e.g. Mysuru)' });
  if (await store.findUserByUserId(user_id)) return res.status(409).json({ error: 'An account with that user_id already exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = await store.createUser({
    username: username || name, user_id, password: hash, department, station,
    designation: des, stationId, sectionId, divisionId,
  });
  res.status(201).json({ user });
}

async function me(req, res) { res.json({ user: req.user }); }
async function listUsers(req, res) { res.json({ users: await store.listUsers() }); }

module.exports = { login, register, me, listUsers };

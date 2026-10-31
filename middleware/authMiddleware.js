const jwt = require('jsonwebtoken');
const { designationOf } = require('../services/permissions');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    // Normalise legacy tokens (role only) to a designation.
    if (!req.user.designation) req.user.designation = designationOf(req.user);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired login — please log in again' });
  }
}

// Only the DOM creates accounts and deletes incidents.
function requireDOM(req, res, next) {
  if (req.user && designationOf(req.user) === 'DOM') return next();
  return res.status(403).json({ error: 'DOM only' });
}

// Backwards-compatible name for v1 routes.
const requireAdmin = requireDOM;

module.exports = { authRequired, requireAdmin, requireDOM };

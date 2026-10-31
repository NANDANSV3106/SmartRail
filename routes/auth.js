const express = require('express');
const c = require('../controllers/authController');
const { authRequired, requireDOM } = require('../middleware/authMiddleware');

const router = express.Router();
router.post('/login', c.login);
router.get('/me', authRequired, c.me);
router.post('/register', authRequired, requireDOM, c.register);
router.get('/users', authRequired, requireDOM, c.listUsers);
module.exports = router;

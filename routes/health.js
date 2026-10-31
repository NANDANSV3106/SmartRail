const express = require('express');
const c = require('../controllers/healthController');
const { authRequired } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authRequired);
router.get('/', c.getHealth);
router.get('/logs', c.logs);
module.exports = router;

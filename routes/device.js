const express = require('express');
const c = require('../controllers/deviceController');
const { authRequired } = require('../middleware/authMiddleware');

const router = express.Router();
// Staff routes (login required). The ingest route is device-key auth instead
// and is deliberately NOT behind authRequired — see deviceController.ingest.
router.get('/status', authRequired, c.status);
router.post('/buzzer', authRequired, c.buzzer);
router.post('/ping', authRequired, c.ping);
router.post('/ingest', c.ingest);
router.get('/commands', c.commands);
module.exports = router;

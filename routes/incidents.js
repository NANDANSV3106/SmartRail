const express = require('express');
const c = require('../controllers/incidentController');
const { authRequired, requireDOM } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authRequired); // every incident route needs a login; scope is checked in the controller
router.get('/', c.list);
router.post('/:id/acknowledge', c.acknowledge);
router.post('/:id/resolve', c.resolve);
router.post('/:id/assess', c.assess);
router.post('/:id/clear-track', c.clearTrack);
router.delete('/:id', requireDOM, c.remove);
module.exports = router;

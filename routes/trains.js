const express = require('express');
const c = require('../controllers/trainController');
const { authRequired, requireDOM } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authRequired);
router.get('/', c.list);
router.post('/', requireDOM, c.create);
router.put('/:id', requireDOM, c.update);
router.delete('/:id', requireDOM, c.remove);
module.exports = router;

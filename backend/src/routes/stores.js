const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const controller = require('../controllers/storeController');

const router = express.Router();
router.use(noStore);

router.get('/', controller.listStores);
router.get('/mine', requireAuth, controller.listOwnedStores);
router.get('/:id/photos/:photoId', controller.getPhoto);
router.get('/:id/image', controller.getPhoto);
router.get('/:id', controller.getStore);
router.post('/', requireAuth, controller.createStore);

module.exports = router;

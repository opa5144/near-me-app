const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const notificationDeviceController = require('../controllers/notificationDeviceController');

const router = express.Router();
router.use(requireAuth, noStore);
router.get('/', notificationDeviceController.listDevices);
router.post('/', notificationDeviceController.registerDevice);
router.delete('/:id', notificationDeviceController.disableDevice);
module.exports = router;

const express = require('express');
const controller = require('../controllers/itineraryController');

const router = express.Router();
router.post('/generate', controller.generate);

module.exports = router;

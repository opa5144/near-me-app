const express = require('express');
const mapsController = require('../controllers/mapsController');

const router = express.Router();
router.post('/autocomplete', mapsController.autocomplete);
router.get('/places/:placeId', mapsController.getPlaceDetails);

module.exports = router;

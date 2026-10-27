// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const itineraryRoutes = require('./routes/itinerary');
const mapsRoutes = require('./routes/mapsRoutes'); // <--- 1. Pull in your new maps route module

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/itinerary', itineraryRoutes);
app.use('/api/maps', mapsRoutes); // <--- 2. Mount it so your frontend client can access it

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nearme';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const itineraryRoutes = require('./routes/itinerary');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/itinerary', itineraryRoutes);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nearme';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

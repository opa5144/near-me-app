const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// Resolve configuration from the backend folder even when Node starts elsewhere.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const itineraryRoutes = require('./routes/itinerary');
const mapsRoutes = require('./routes/mapsRoutes');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');

const app = express();
app.use(cors());
// Allows a <=1 MiB JPEG encoded as base64 plus the event's text.
app.use(express.json({ limit: '2mb' }));
// Each router owns the endpoints below its shared /api prefix.
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/itinerary', itineraryRoutes);
app.use('/api/maps', mapsRoutes);

// Turn JSON parsing failures into readable API responses before handling other errors.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'The request is too large. Choose a smaller event image.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'Please submit valid JSON.' });
  }
  console.error('Request failed:', err.name);
  return res.status(500).json({ message: 'Unable to complete this request.' });
});

// Start accepting requests only after Atlas connects; there is no local database fallback.
async function startServer() {
  if (!process.env.MONGO_URI) {
    console.error('Set MONGO_URI in backend/.env to your Atlas connection string.');
    process.exitCode = 1;
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log('Server running on port ' + port));
  } catch (err) {
    console.error('MongoDB connection failed:', err.name);
    process.exitCode = 1;
  }
}

// Tests can import the Express app without opening a port or connecting to Atlas.
if (require.main === module) startServer();
module.exports = app;

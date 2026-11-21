const mongoose = require('mongoose');
const Event = require('./Event');

// Clone the canonical schema so IDs and every event field survive completion.
module.exports = mongoose.model('PastEvent', Event.schema.clone(), 'PastEventsList');

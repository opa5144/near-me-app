const mongoose = require('mongoose');
const Event = require('./Event');

module.exports = mongoose.model('ArchivedEvent', Event.schema.clone(), 'ArchivedEvents');

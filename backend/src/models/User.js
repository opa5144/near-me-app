const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({ //Account data model 
    firstName: {type: String, required: true, trim: true},
    lastName: {type: String, required: true, trim: true},
    username: {type: String, required: true, trim: true, unique: true},
    email: {type: String, required: true, trim: true, unique: true, lowercase: true},
    passwordHash: {type: String, required: true, select: false}
}, {timestamps: true, collection: 'AccountList'});

module.exports = mongoose.model('User', userSchema); 
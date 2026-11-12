const mongoose = require('mongoose');

// Identity stays in AccountList. Profile, security, and avatar fields have their own models.
const userSchema = new mongoose.Schema({
    firstName: {type: String, required: true, trim: true},
    lastName: {type: String, required: true, trim: true},
    username: {
        type: String, required: [true, 'Username is required.'], trim: true, unique: true,
        maxlength: [25, 'Username must be 25 characters or fewer.'],
        match: [/^[A-Za-z0-9]+$/, 'Username can contain only letters and numbers.'],
    },
    email: {
        type: String, required: [true, 'Email is required.'], trim: true, unique: true, lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.'],
    },
    // Closure retains the account and related records, but permanently prevents authentication.
    deletedAt: {type: Date, default: null, index: true},
    // The shared write fence still belongs to identity; authVersion lives in AccountSecurity.
    archiveWriteVersion: {type: Number, default: 0, select: false},
}, {timestamps: true, collection: 'AccountList'});

module.exports = mongoose.model('User', userSchema);

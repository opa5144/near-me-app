const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({ //Account data model 
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
    passwordHash: {type: String, required: true, select: false},

    // Older accounts can leave these optional details blank until their owner adds them.
    phone: {
        type: String, trim: true, default: '',
        maxlength: [14, 'Phone number must contain exactly 11 digits.'],
        validate: {
            validator: value => value === '' || /^\d \d{3}-\d{3}-\d{4}$/.test(value),
            message: 'Phone number must contain exactly 11 digits, formatted as 1 234-567-8901.',
        },
    },
    bio: {
        type: String, trim: true, default: '',
        maxlength: [2000, 'Bio must be 2000 characters or fewer.'],
    },
    dob: {
        type: String, trim: true, default: '',
        validate: {
            validator(value) {
                if (value === '') return true;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
                // Birthdays stay calendar-date strings; UTC avoids device timezone shifts.
                const date = new Date(value + 'T00:00:00.000Z');
                return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
                    value <= new Date().toISOString().slice(0, 10);
            },
            message: 'Date of birth must be a real date in YYYY-MM-DD format and cannot be in the future.',
        },
    },
    avatarUrl: {type: String, default: ''},
    avatarData: {type: Buffer, select: false},      
    avatarMimeType: {type: String, select: false},

    // Closure retains the account and related records, but permanently prevents authentication.
    deletedAt: {type: Date, default: null, index: true},
    
    authVersion: {type: Number, default: 0, min: 0, select: false},
    archiveWriteVersion: {type: Number, default: 0, select: false},
    mfaEnabled: {type: Boolean, default: false, select: false},
    mfaSecretEncrypted: {type: String, select: false},
    mfaRecoveryCodeHashes: {type: [String], default: [], select: false},
    mfaLastUsedStep: {type: Number, default: -1, select: false},
    mfaFailedAttempts: {type: Number, default: 0, select: false},
    mfaLockedUntil: {type: Date, default: null, select: false},
    securityPasswordFailedAttempts: {type: Number, default: 0, select: false},
    securityPasswordLockedUntil: {type: Date, default: null, select: false},
    loginPasswordFailedAttempts: {type: Number, default: 0, select: false},
    loginPasswordLockedUntil: {type: Date, default: null, select: false},
}, {timestamps: true, collection: 'AccountList'});

module.exports = mongoose.model('User', userSchema);

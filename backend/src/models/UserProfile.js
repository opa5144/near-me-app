const mongoose = require('mongoose');

// Active account contact/profile data; collection/index provisioning stays explicit.
const userProfileSchema = new mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true},
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
}, {timestamps: true, collection: 'UserProfiles', autoCreate: false, autoIndex: false});

module.exports = mongoose.model('UserProfile', userProfileSchema);

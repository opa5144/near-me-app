const mongoose = require('mongoose');

// Staged schema only: no collection or index is created automatically, and existing avatar code is unchanged.
const userAvatarSchema = new mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true},
    avatarData: {type: Buffer, required: true, select: false},
    avatarMimeType: {type: String, required: true, select: false},
}, {timestamps: true, collection: 'UserAvatars', autoCreate: false, autoIndex: false});

module.exports = mongoose.model('UserAvatar', userAvatarSchema);

const mongoose = require('mongoose');

// Active avatar storage, linked by userId; collection/index provisioning stays explicit.
const userAvatarSchema = new mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true},
    avatarData: {type: Buffer, required: true, select: false},
    avatarMimeType: {type: String, required: true, select: false},
}, {timestamps: true, collection: 'UserAvatars', autoCreate: false, autoIndex: false});

module.exports = mongoose.model('UserAvatar', userAvatarSchema);

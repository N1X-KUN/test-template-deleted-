const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String
    },
    // Profile fields (used by Community + login modal account panel)
    bio: {
        type: String,
        default: ''
    },
    favoriteCharacter: {
        type: String,
        default: 'Not set'
    },
    mainHeroId: {
        type: String,
        default: ''
    },
    rank: {
        type: String,
        default: 'Unranked'
    },
    winrate: {
        type: Number,
        default: 0
    },
    avatar: {
        type: String,
        default: 'Images/Rival.png'
    },
    // Role-based access (used for admin view + admin panel permissions)
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    // Timed bans (admin can set until a timestamp; login is blocked until then)
    bannedUntil: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);


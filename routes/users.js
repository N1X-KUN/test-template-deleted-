const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { sendWelcomeEmail } = require('../utils/emailService');

function getAdminEmail() {
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const fallbackAdminEmail = 'admin67@gmail.com';
    return configuredAdminEmail || fallbackAdminEmail;
}

function requireAdmin(req, res, next) {
    // Lightweight guard for the assignment: admin panel sends these headers.
    // (Not bulletproof security, but prevents normal site calls.)
    const adminEmail = getAdminEmail();
    const hdrEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
    const hdrRole = String(req.headers['x-admin-role'] || '').trim().toLowerCase();

    if (adminEmail && hdrEmail === adminEmail && hdrRole === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
}

// Create a new user
router.post('/', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const adminEmail = getAdminEmail();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const role = (adminEmail && normalizedEmail === adminEmail) ? 'admin' : 'user';

        const newUser = new User({ name, email: normalizedEmail, password, role });
        await newUser.save();
        
        // Send welcome email (non-blocking - don't wait for it)
        const creationDate = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        sendWelcomeEmail(email, name, password, creationDate).catch(err => {
            console.error('Failed to send welcome email:', err);
            // Don't fail registration if email fails
        });
        
        res.status(201).json(newUser);
    } catch (error) {
        // Duplicate email (unique index)
        if (error?.code === 11000) {
            return res.status(409).json({ error: 'Email already registered. Please log in instead.' });
        }
        res.status(400).json({ error: error.message || 'Registration failed.' });
    }
});

// Get all users
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        console.log(`[GET /users] Returning ${users.length} user(s)`); // Debug log
        res.json(users);
    } catch (error) {
        console.error('[GET /users] Error:', error); // Debug log
        res.status(500).json({ error: error.message });
    }
});

// Get a user by ID
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ban a user (timed, max 24h)
router.patch('/:id/ban', requireAdmin, async (req, res) => {
    try {
        const minutes = Number(req.body?.minutes);
        if (!Number.isFinite(minutes)) return res.status(400).json({ error: 'minutes is required' });

        const minMinutes = 5;
        const maxMinutes = 24 * 60;
        const clamped = Math.floor(minutes);
        if (clamped < minMinutes || clamped > maxMinutes) {
            return res.status(400).json({ error: `Ban duration must be between ${minMinutes} and ${maxMinutes} minutes.` });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (String(user.role) === 'admin') return res.status(400).json({ error: 'Cannot ban an admin account.' });

        user.bannedUntil = new Date(Date.now() + clamped * 60 * 1000);
        await user.save();

        const safe = user.toObject();
        delete safe.password;
        res.json({ message: 'User banned', user: safe });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Unban a user
router.patch('/:id/unban', requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.bannedUntil = null;
        await user.save();

        const safe = user.toObject();
        delete safe.password;
        res.json({ message: 'User unbanned', user: safe });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a user
router.put('/:id', async (req, res) => {
    try {
        // Prevent privilege escalation: never allow role edits via this public route.
        // Only allow safe profile fields used by the site UI.
        const allowed = [
            'name',
            'email',
            'password',
            'bio',
            'favoriteCharacter',
            'mainHeroId',
            'rank',
            'winrate',
            'avatar'
        ];

        const update = {};
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                if (key === 'email') update.email = String(req.body.email || '').trim().toLowerCase();
                else update[key] = req.body[key];
            }
        }

        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const safe = user.toObject ? user.toObject() : user;
        if (safe && typeof safe === 'object') delete safe.password;
        res.json(safe);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a user
router.delete('/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;


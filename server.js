const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Force IPv4 localhost to avoid "::1" IPv6 connection issues on Windows
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mywebapp';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000
})
.then(() => {
  console.log('🙆‍♂️ MongoDB connected successfully!');
  console.log('💻 Database: mywebapp');
})
.catch(err => {
  console.error('❌😫 MongoDB connection error:', err.message);
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// IMPORTANT:
// - Serve the main website (Rivals.html, assets, etc.) from root directory
// - Do NOT serve `public` at the site root, otherwise its `index.html`
//   will override "/" and you'll see the old standalone login page.

const userRoutes = require('./routes/users');

app.use('/users', userRoutes);

app.post('/login', async (req, res) => {
  try {
    const User = require('./models/user');
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    // Normalize email for consistent lookups (we store emails lowercased on registration).
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPassword = String(password).trim();
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const user =
      (await User.findOne({ email: normalizedEmail })) ||
      (await User.findOne({ email: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, 'i') }));
    
    if (!user) {
      return res.status(401).json({ error: 'Account not found. Please register first or check your email address.' });
    }
    
    // Compare passwords (trimmed to avoid whitespace issues)
    if (String(user.password || '').trim() !== normalizedPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please check your password and try again.' });
    }

    // Enforce timed bans
    if (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) {
      const remainingMs = new Date(user.bannedUntil).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      const remainingText = remainingMin >= 60
        ? `${Math.ceil(remainingMin / 60)} hour(s)`
        : `${remainingMin} minute(s)`;
      return res.status(403).json({
        error: `Your account has been banned. Try again in ${remainingText}.`,
        bannedUntil: user.bannedUntil
      });
    }

    // Optional: auto-promote a configured admin account (email-based) so the "special account"
    // consistently gets the admin view without manual DB edits.
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const fallbackAdminEmail = 'admin67@gmail.com';
    const adminEmail = configuredAdminEmail || fallbackAdminEmail;

    if (adminEmail && String(user.email || '').toLowerCase() === adminEmail && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        username: user.name,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        favoriteCharacter: user.favoriteCharacter,
        mainHeroId: user.mainHeroId,
        rank: user.rank,
        winrate: user.winrate,
        createdAt: user.createdAt,
        role: user.role || 'user',
        bannedUntil: user.bannedUntil || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/send-welcome-email', async (req, res) => {
  try {
    const { sendWelcomeEmail } = require('./utils/emailService');
    const { email, nickname, password, creationDate } = req.body;
    if (!email || !nickname) return res.status(400).json({ error: 'Email and nickname are required' });
    const result = await sendWelcomeEmail(email, nickname, password, creationDate);
    if (result.success) res.json({ message: 'Email sent successfully', messageId: result.messageId });
    else res.status(500).json({ error: result.error || 'Failed to send email' });
  } catch (error) {
    console.error('Email endpoint error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Homepage must be Rivals.html (your main site)
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'Rivals.html'))
);

// Static assets for the main site (prevent index.html auto-serving)
app.use(
  express.static(__dirname, { index: false })
);

// Serve the standalone login/admin UI under /public (keeps it accessible but not as homepage)
app.use(
  '/public',
  express.static(path.join(__dirname, 'public'), { index: false })
);

app.get('/:page', (req, res) => {
  const page = req.params.page;
  const validPages = ['Community', 'Hero', 'Patch', 'login'];
  if (validPages.includes(page)) return res.sendFile(path.join(__dirname, `${page}.html`));
  res.status(404).send('Page not found');
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Also accessible at http://127.0.0.1:${PORT}`);
});



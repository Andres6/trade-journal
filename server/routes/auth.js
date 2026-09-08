const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    return res.status(500).json({
      error: 'Server has no APP_PASSWORD_HASH set. See server/.env.example.',
    });
  }
  if (!password || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  req.session.loggedIn = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

module.exports = { router, requireAuth };

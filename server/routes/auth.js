const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(403).json({ error: 'Admins only' });
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  req.session.userId = user.id;
  req.session.isAdmin = !!user.is_admin;
  req.session.username = user.username;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      loggedIn: true,
      username: req.session.username,
      isAdmin: !!req.session.isAdmin,
    });
  }
  res.json({ loggedIn: false });
});

// --- Guest account management (admin only) ---

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db
    .prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC')
    .all();
  res.json(users);
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password should be at least 4 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'That username is already taken' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)')
    .run(username, hash);
  res.status(201).json({ id: info.lastInsertRowid, username, is_admin: 0 });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) {
    return res.status(400).json({ error: 'Cannot delete the admin account' });
  }
  // Positions/notes reference user_id without ON DELETE CASCADE (added via
  // migration, not the original CREATE TABLE), so clean those up first —
  // trades cascade from their position automatically.
  db.prepare('DELETE FROM positions WHERE user_id = ?').run(target.id);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(target.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

module.exports = { router, requireAuth, requireAdmin };

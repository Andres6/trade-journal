const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { category, title, content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content is required' });
  const info = db
    .prepare('INSERT INTO notes (category, title, content) VALUES (?, ?, ?)')
    .run(category || 'Lesson', title || null, content);
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const { category, title, content } = req.body || {};
  const next = {
    category: category ?? note.category,
    title: title ?? note.title,
    content: content ?? note.content,
  };
  db.prepare(
    `UPDATE notes SET category = ?, title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(next.category, next.title, next.content, note.id);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

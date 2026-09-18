const express = require('express');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['Earnings', 'Economic', 'Fed', 'Expiration', 'Other'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// The calendar always asks for a bounded window (a week or a month grid)
// rather than the whole table, so this stays cheap on the Pi even after
// years of events pile up.
function normalize(body, fallback = {}) {
  const out = {};

  const date = body.event_date ?? fallback.event_date;
  if (!date || !DATE_RE.test(date)) {
    throw new Error('event_date must be a YYYY-MM-DD date');
  }
  out.event_date = date;

  const title = (body.title ?? fallback.title ?? '').trim();
  if (!title) throw new Error('title is required');
  out.title = title;

  // Empty string from the form means "all day", not "unchanged".
  const time = body.event_time === undefined ? fallback.event_time : body.event_time;
  if (time === null || time === undefined || time === '') {
    out.event_time = null;
  } else if (TIME_RE.test(time)) {
    out.event_time = time;
  } else {
    throw new Error('event_time must be HH:MM (24-hour) or blank');
  }

  const category = body.category ?? fallback.category ?? 'Other';
  out.category = CATEGORIES.includes(category) ? category : 'Other';

  const symbol = body.symbol === undefined ? fallback.symbol : body.symbol;
  out.symbol = symbol ? String(symbol).trim().toUpperCase() : null;

  const notes = body.notes === undefined ? fallback.notes : body.notes;
  out.notes = notes ? String(notes).trim() : null;

  return out;
}

// GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD   (inclusive both ends)
router.get('/', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return res.status(400).json({ error: 'start and end (YYYY-MM-DD) are required' });
  }
  const rows = db
    .prepare(
      `SELECT * FROM events
       WHERE user_id = ? AND event_date BETWEEN ? AND ?
       ORDER BY event_date ASC, COALESCE(event_time, '99:99') ASC, id ASC`
    )
    .all(req.session.userId, start, end);
  res.json(rows);
});

// POST /api/events
router.post('/', (req, res) => {
  let data;
  try {
    data = normalize(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const info = db
    .prepare(
      `INSERT INTO events (user_id, event_date, event_time, title, category, symbol, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.session.userId,
      data.event_date,
      data.event_time,
      data.title,
      data.category,
      data.symbol,
      data.notes
    );
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
});

// PATCH /api/events/:id
router.patch('/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM events WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  let data;
  try {
    data = normalize(req.body || {}, existing);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  db.prepare(
    `UPDATE events
     SET event_date = ?, event_time = ?, title = ?, category = ?, symbol = ?, notes = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    data.event_date,
    data.event_time,
    data.title,
    data.category,
    data.symbol,
    data.notes,
    existing.id
  );

  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(existing.id));
});

// DELETE /api/events/:id
router.delete('/:id', (req, res) => {
  const existing = db
    .prepare('SELECT id FROM events WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

module.exports = router;

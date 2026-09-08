const express = require('express');
const db = require('../db');
const { parseOrderText, computeNet } = require('../lib/parseOrder');

const router = express.Router();

function touchPosition(positionId) {
  db.prepare("UPDATE positions SET updated_at = datetime('now') WHERE id = ?").run(positionId);
}

// POST /api/trades/parse  { text }  -> preview only, does not save
router.post('/parse', (req, res) => {
  try {
    const parsed = parseOrderText(req.body?.text);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/trades  { position_id, trade_date, comment, ...either raw_text OR (action,size,structure,price) }
router.post('/', (req, res) => {
  const { position_id, trade_date, comment, raw_text } = req.body || {};
  if (!position_id) return res.status(400).json({ error: 'position_id is required' });
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(position_id);
  if (!position) return res.status(404).json({ error: 'Position not found' });

  let fields;
  try {
    if (raw_text) {
      fields = parseOrderText(raw_text);
    } else {
      const { action, size, structure, price } = req.body;
      if (!action || !size || !structure || price === undefined) {
        return res.status(400).json({
          error: 'Provide raw_text, or action, size, structure and price',
        });
      }
      const net = computeNet(action, Number(size), Number(price));
      fields = { action, size: Number(size), structure, price: Number(price), net, raw_text: null };
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const date = trade_date || new Date().toISOString().slice(0, 10);
  const info = db
    .prepare(
      `INSERT INTO trades (position_id, trade_date, action, size, structure, price, net, comment, raw_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(position_id, date, fields.action, fields.size, fields.structure, fields.price, fields.net, comment || null, fields.raw_text);

  touchPosition(position_id);
  res.status(201).json(db.prepare('SELECT * FROM trades WHERE id = ?').get(info.lastInsertRowid));
});

// PATCH /api/trades/:id
router.patch('/:id', (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });

  const { trade_date, action, size, structure, price, comment } = req.body || {};
  const next = {
    trade_date: trade_date ?? trade.trade_date,
    action: action ?? trade.action,
    size: size !== undefined ? Number(size) : trade.size,
    structure: structure ?? trade.structure,
    price: price !== undefined ? Number(price) : trade.price,
    comment: comment ?? trade.comment,
  };
  next.net = computeNet(next.action, next.size, next.price);

  db.prepare(
    `UPDATE trades SET trade_date = ?, action = ?, size = ?, structure = ?, price = ?, net = ?, comment = ? WHERE id = ?`
  ).run(next.trade_date, next.action, next.size, next.structure, next.price, next.net, next.comment, trade.id);

  touchPosition(trade.position_id);
  res.json(db.prepare('SELECT * FROM trades WHERE id = ?').get(trade.id));
});

// DELETE /api/trades/:id
router.delete('/:id', (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  touchPosition(trade.position_id);
  res.json({ ok: true });
});

module.exports = router;

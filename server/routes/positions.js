const express = require('express');
const db = require('../db');

const router = express.Router();

function computePositionTotals(positionId) {
  const trades = db
    .prepare('SELECT * FROM trades WHERE position_id = ? ORDER BY trade_date ASC, id ASC')
    .all(positionId);
  let running = 0;
  const withCostBasis = trades.map((t) => {
    running += t.net;
    return { ...t, cost_basis: running };
  });
  return { trades: withCostBasis, realized_or_running: running };
}

// GET /api/positions?status=open|closed
router.get('/', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status === 'open' || status === 'closed') {
    rows = db.prepare('SELECT * FROM positions WHERE status = ? ORDER BY opened_at DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM positions ORDER BY opened_at DESC').all();
  }

  const withTotals = rows.map((p) => {
    const { realized_or_running } = computePositionTotals(p.id);
    const tradeCount = db
      .prepare('SELECT COUNT(*) AS c FROM trades WHERE position_id = ?')
      .get(p.id).c;
    return { ...p, net_total: realized_or_running, trade_count: tradeCount };
  });
  res.json(withTotals);
});

// GET /api/positions/summary  (dashboard KPIs)
router.get('/summary', (req, res) => {
  const openTrades = db.prepare("SELECT COUNT(*) AS c FROM positions WHERE status = 'open'").get().c;
  const totalPositions = db.prepare('SELECT COUNT(*) AS c FROM positions').get().c;
  const totalTrades = db.prepare('SELECT COUNT(*) AS c FROM trades').get().c;

  const closedIds = db.prepare("SELECT id FROM positions WHERE status = 'closed'").all().map((r) => r.id);
  let realizedPL = 0;
  let wins = 0;
  for (const id of closedIds) {
    const { realized_or_running } = computePositionTotals(id);
    realizedPL += realized_or_running;
    if (realized_or_running > 0) wins += 1;
  }
  const winRate = closedIds.length ? Math.round((wins / closedIds.length) * 1000) / 10 : null;

  res.json({
    open_positions: openTrades,
    total_positions: totalPositions,
    total_trades: totalTrades,
    realized_pl: Math.round(realizedPL * 100) / 100,
    closed_positions: closedIds.length,
    win_rate: winRate,
  });
});

// GET /api/positions/:id
router.get('/:id', (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).json({ error: 'Position not found' });
  const { trades, realized_or_running } = computePositionTotals(position.id);
  res.json({ ...position, trades, net_total: realized_or_running });
});

// POST /api/positions  { symbol, opened_at, comment }
router.post('/', (req, res) => {
  const { symbol, opened_at, comment } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const openedAt = opened_at || new Date().toISOString().slice(0, 10);
  const info = db
    .prepare('INSERT INTO positions (symbol, opened_at, comment) VALUES (?, ?, ?)')
    .run(symbol.toUpperCase(), openedAt, comment || null);
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(position);
});

// PATCH /api/positions/:id  { status, comment, closing_remarks, closed_at }
router.patch('/:id', (req, res) => {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!position) return res.status(404).json({ error: 'Position not found' });

  const { status, comment, closing_remarks, closed_at, symbol } = req.body || {};
  const next = {
    status: status ?? position.status,
    comment: comment ?? position.comment,
    closing_remarks: closing_remarks ?? position.closing_remarks,
    symbol: symbol ? symbol.toUpperCase() : position.symbol,
    closed_at:
      status === 'closed'
        ? closed_at || position.closed_at || new Date().toISOString().slice(0, 10)
        : status === 'open'
        ? null
        : position.closed_at,
  };

  db.prepare(
    `UPDATE positions SET status = ?, comment = ?, closing_remarks = ?, symbol = ?, closed_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(next.status, next.comment, next.closing_remarks, next.symbol, next.closed_at, position.id);

  res.json(db.prepare('SELECT * FROM positions WHERE id = ?').get(position.id));
});

// DELETE /api/positions/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM positions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');

const router = express.Router();

function extractExpirationDate(structure) {
  // Extract expiration date from structure like "BACKRATIO SPY 100 18 SEP 26 730/700 PUT"
  // Expected format: digit(s) MONTH digit(s) followed by optional space and more content
  // Match patterns like "18 SEP 26", "21 AUG 22", etc.
  const match = structure.match(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{2})\b/);
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]}`;
  }
  return null;
}

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
  const userId = req.session.userId;
  let rows;
  if (status === 'open' || status === 'closed') {
    rows = db
      .prepare('SELECT * FROM positions WHERE user_id = ? AND status = ? ORDER BY opened_at DESC')
      .all(userId, status);
  } else {
    rows = db
      .prepare('SELECT * FROM positions WHERE user_id = ? ORDER BY opened_at DESC')
      .all(userId);
  }

  const withTotals = rows.map((p) => {
    const { realized_or_running } = computePositionTotals(p.id);
    const tradeCount = db
      .prepare('SELECT COUNT(*) AS c FROM trades WHERE position_id = ?')
      .get(p.id).c;
    
    // Get the earliest trade date for this position
    const earliestTrade = db
      .prepare('SELECT trade_date, structure FROM trades WHERE position_id = ? ORDER BY trade_date ASC LIMIT 1')
      .get(p.id);
    
    let actualOpenedAt = p.opened_at;
    let expirationDate = null;
    if (earliestTrade) {
      actualOpenedAt = earliestTrade.trade_date;
      expirationDate = extractExpirationDate(earliestTrade.structure);
    }
    
    return { 
      ...p, 
      net_total: realized_or_running, 
      trade_count: tradeCount,
      opened_at: actualOpenedAt,
      expiration_date: expirationDate
    };
  });
  res.json(withTotals);
});

// GET /api/positions/summary  (dashboard KPIs)
router.get('/summary', (req, res) => {
  const userId = req.session.userId;
  
  // Get all open positions
  const openPositions = db
    .prepare("SELECT id FROM positions WHERE user_id = ? AND status = 'open'")
    .all(userId);

  const openTradesCount = openPositions.length;

  const totalPositions = db
    .prepare('SELECT COUNT(*) AS c FROM positions WHERE user_id = ?')
    .get(userId).c;
  
  const totalTrades = db
    .prepare(
      `SELECT COUNT(*) AS c FROM trades
       JOIN positions ON positions.id = trades.position_id
       WHERE positions.user_id = ?`
    )
    .get(userId).c;

  // Calculate Unrealized P/L from open positions
  let unrealizedPL = 0;
  for (const p of openPositions) {
    const { realized_or_running } = computePositionTotals(p.id);
    unrealizedPL += realized_or_running;
  }

  // Calculate Realized P/L and Win Rate from closed positions
  const closedIds = db
    .prepare("SELECT id FROM positions WHERE user_id = ? AND status = 'closed'")
    .all(userId)
    .map((r) => r.id);
  
  let realizedPL = 0;
  let wins = 0;
  for (const id of closedIds) {
    const { realized_or_running } = computePositionTotals(id);
    realizedPL += realized_or_running;
    if (realized_or_running > 0) wins += 1;
  }
  const winRate = closedIds.length ? Math.round((wins / closedIds.length) * 1000) / 10 : null;

  res.json({
    open_positions: openTradesCount,
    total_positions: totalPositions,
    total_trades: totalTrades,
    realized_pl: Math.round(realizedPL * 100) / 100,
    unrealized_pl: Math.round(unrealizedPL * 100) / 100,
    closed_positions: closedIds.length,
    win_rate: winRate,
  });
});

// GET /api/positions/:id
router.get('/:id', (req, res) => {
  const position = db
    .prepare('SELECT * FROM positions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!position) return res.status(404).json({ error: 'Position not found' });
  const { trades, realized_or_running } = computePositionTotals(position.id);
  
  // Get the earliest trade date and extract expiration
  let actualOpenedAt = position.opened_at;
  let expirationDate = null;
  if (trades.length > 0) {
    actualOpenedAt = trades[0].trade_date;
    expirationDate = extractExpirationDate(trades[0].structure);
  }
  
  res.json({ 
    ...position, 
    trades, 
    net_total: realized_or_running,
    opened_at: actualOpenedAt,
    expiration_date: expirationDate
  });
});

// POST /api/positions  { symbol, opened_at, comment }
router.post('/', (req, res) => {
  const { symbol, opened_at, comment } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const openedAt = opened_at || new Date().toISOString().slice(0, 10);
  const info = db
    .prepare('INSERT INTO positions (symbol, opened_at, comment, user_id) VALUES (?, ?, ?, ?)')
    .run(symbol.toUpperCase(), openedAt, comment || null, req.session.userId);
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(position);
});

// PATCH /api/positions/:id  { status, comment, closing_remarks, closed_at }
router.patch('/:id', (req, res) => {
  const position = db
    .prepare('SELECT * FROM positions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
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
  const position = db
    .prepare('SELECT id FROM positions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!position) return res.status(404).json({ error: 'Position not found' });
  db.prepare('DELETE FROM positions WHERE id = ?').run(position.id);
  res.json({ ok: true });
});

module.exports = router;
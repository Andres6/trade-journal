const express = require('express');
const axios = require('axios');
const db = require('../db');
const finnhub = require('../lib/finnhub');

const router = express.Router();

let syncing = false; // one sync at a time keeps us under Finnhub's rate limit

// GET /api/calendar/status
router.get('/status', (req, res) => {
  const userId = req.session.userId;
  const { usable, skipped } = finnhub.trackedSymbols(db, userId);
  const watchlist = db
    .prepare('SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY symbol')
    .all(userId)
    .map((r) => r.symbol);
  res.json({
    configured: finnhub.isConfigured(),          // Finnhub (earnings)
    fredConfigured: !!process.env.FRED_API_KEY,  // FRED (economic)
    tracked: usable, skipped, watchlist,
  });
});

// POST /api/calendar/sync   body: { only?: 'both' | 'earnings' | 'economic' }
// Runs whichever sources have keys. Each source reports its own status.
router.post('/sync', async (req, res) => {
  const only = ['both', 'earnings', 'economic'].includes(req.body && req.body.only) ? req.body.only : 'both';
  if (syncing) return res.status(409).json({ error: 'A sync is already running. Try again in a moment.' });
  syncing = true;
  try {
    const client = finnhub.isConfigured()
      ? finnhub.createClient({ apiKey: process.env.FINNHUB_API_KEY, http: axios })
      : null;
    const result = await finnhub.runSync({ db, userId: req.session.userId, client, only });
    res.json(result);
  } catch (err) {
    console.error('Calendar sync error:', err.message);
    res.status(500).json({ error: 'Sync failed. Check server logs.' });
  } finally {
    syncing = false;
  }
});

// POST /api/calendar/watchlist  { symbol }
router.post('/watchlist', (req, res) => {
  const symbol = String((req.body && req.body.symbol) || '').trim().toUpperCase();
  if (!finnhub.SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ error: 'Enter a valid ticker symbol, e.g. NVDA.' });
  }
  db.prepare('INSERT OR IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)').run(req.session.userId, symbol);
  res.status(201).json({ ok: true, symbol });
});

// DELETE /api/calendar/watchlist/:symbol
router.delete('/watchlist/:symbol', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?')
    .run(req.session.userId, String(req.params.symbol).toUpperCase());
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const axios = require('axios');
const db = require('../db');
const finnhub = require('../lib/finnhub');

const router = express.Router();

// One sync at a time keeps us under Finnhub's rate limit. Earnings can take a
// couple of minutes for a long watchlist (1 call/sec), so it runs in the
// background and the client polls /sync/status.
let job = null; // { userId, running, done, total, result, error }

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
// Economic (FRED) is quick and returns its result directly. Earnings starts a
// background job and returns 202; poll GET /api/calendar/sync/status.
router.post('/sync', async (req, res) => {
  const only = ['both', 'earnings', 'economic'].includes(req.body && req.body.only) ? req.body.only : 'both';
  if (job && job.running) return res.status(409).json({ error: 'A sync is already running. Try again in a moment.' });
  const userId = req.session.userId;

  try {
    if (only === 'economic') {
      return res.json(await finnhub.runSync({ db, userId, client: null, only: 'economic' }));
    }

    const client = finnhub.isConfigured()
      ? finnhub.createClient({ apiKey: process.env.FINNHUB_API_KEY, http: axios })
      : null;

    const current = { userId, running: true, done: 0, total: 0, result: null, error: null };
    job = current;
    finnhub
      .runSync({
        db, userId, client, only,
        onProgress: (done, total) => { current.done = done; current.total = total; },
      })
      .then((result) => { current.result = result; })
      .catch((err) => {
        console.error('Calendar sync error:', err.message);
        current.error = 'Sync failed. Check server logs.';
      })
      .finally(() => { current.running = false; });

    res.status(202).json({ started: true });
  } catch (err) {
    console.error('Calendar sync error:', err.message);
    res.status(500).json({ error: 'Sync failed. Check server logs.' });
  }
});

// GET /api/calendar/sync/status
router.get('/sync/status', (req, res) => {
  if (!job || job.userId !== req.session.userId) return res.json({ running: false, idle: true });
  const { running, done, total, result, error } = job;
  res.json({ running, done, total, result, error });
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

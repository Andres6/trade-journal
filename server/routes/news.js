const express = require('express');
const axios = require('axios');
const db = require('../db');
const finnhub = require('../lib/finnhub');
const news = require('../lib/news');
const syncLock = require('../lib/syncLock');

const router = express.Router();

let job = null; // { userId, running, done, total, result, error }

// GET /api/news?days=3
// Stored headlines for the symbols currently tracked (open positions + watchlist).
router.get('/', (req, res) => {
  const userId = req.session.userId;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || news.DAYS_BACK, 1), 14);
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const { usable } = finnhub.trackedSymbols(db, userId);
  const tracked = new Set(usable);
  const watchlist = db
    .prepare('SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY symbol')
    .all(userId)
    .map((r) => r.symbol);

  const items = db
    .prepare(
      `SELECT id, symbol, headline, source, url, published_at
       FROM news WHERE user_id = ? AND published_at >= ?
       ORDER BY published_at DESC LIMIT 2000`
    )
    .all(userId, since)
    .filter((r) => tracked.has(r.symbol))
    .map((r) => ({ ...r, major: news.isMajor(r.headline) }));

  res.json({
    configured: finnhub.isConfigured(),
    tracked: usable,
    watchlist,
    items,
  });
});

// POST /api/news/sync  -> starts a background job (202); poll /sync/status
router.post('/sync', (req, res) => {
  if (!finnhub.isConfigured()) {
    return res.status(400).json({ error: 'News needs FINNHUB_API_KEY in server/.env.' });
  }
  if (!syncLock.tryAcquire()) {
    return res.status(409).json({ error: 'A Finnhub sync is already running. Try again in a moment.' });
  }
  const userId = req.session.userId;
  const current = { userId, running: true, done: 0, total: 0, result: null, error: null };
  job = current;

  const client = finnhub.createClient({ apiKey: process.env.FINNHUB_API_KEY, http: axios });
  news
    .syncNews({
      db, userId, client,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      onProgress: (done, total) => { current.done = done; current.total = total; },
    })
    .then((result) => { current.result = result; })
    .catch((err) => {
      console.error('News sync error:', err.message);
      current.error = 'Sync failed. Check server logs.';
    })
    .finally(() => {
      current.running = false;
      syncLock.release();
    });

  res.status(202).json({ started: true });
});

// GET /api/news/sync/status
router.get('/sync/status', (req, res) => {
  if (!job || job.userId !== req.session.userId) return res.json({ running: false, idle: true });
  const { running, done, total, result, error } = job;
  res.json({ running, done, total, result, error });
});

module.exports = router;

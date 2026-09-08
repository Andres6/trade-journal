const express = require('express');
const schwab = require('../lib/schwab');

const router = express.Router();

// GET /api/schwab/status
router.get('/status', (req, res) => {
  res.json({ connected: schwab.isConnected() });
});

// GET /api/schwab/auth-url  -> where to send the browser to start OAuth
router.get('/auth-url', (req, res) => {
  if (!process.env.SCHWAB_CLIENT_ID || !process.env.SCHWAB_REDIRECT_URI) {
    return res.status(500).json({
      error: 'Set SCHWAB_CLIENT_ID and SCHWAB_REDIRECT_URI in server/.env first.',
    });
  }
  res.json({ url: schwab.getAuthorizeUrl() });
});

// GET /api/schwab/callback?code=...  (Schwab redirects here after login)
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');
    await schwab.exchangeCodeForTokens(code);
    // Send the user back into the app, e.g. to the Settings page.
    // APP_BASE_PATH matches wherever this is mounted (e.g. "/journal"),
    // set in server/.env — leave blank if served at the domain root.
    const basePath = process.env.APP_BASE_PATH || '';
    res.redirect(`${basePath}/settings?schwab=connected`);
  } catch (err) {
    console.error('Schwab callback error:', err.response?.data || err.message);
    res.status(500).send('Failed to connect to Schwab. Check server logs.');
  }
});

// GET /api/schwab/transactions?days=14  -> normalized legs, not yet imported
router.get('/transactions', async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 14;
    const legs = await schwab.fetchRecentTransactions(days);
    res.json(legs);
  } catch (err) {
    console.error('Schwab transactions error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Could not fetch transactions from Schwab. Check server logs.' });
  }
});

module.exports = router;

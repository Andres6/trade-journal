const axios = require('axios');
const db = require('../db');
const { computeNet } = require('./parseOrder');

const AUTH_BASE = 'https://api.schwabapi.com/v1/oauth';
const API_BASE = 'https://api.schwabapi.com/trader/v1';

function basicAuthHeader() {
  const raw = `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function getAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: process.env.SCHWAB_CLIENT_ID,
    redirect_uri: process.env.SCHWAB_REDIRECT_URI,
    response_type: 'code',
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.SCHWAB_REDIRECT_URI,
  });
  const { data } = await axios.post(`${AUTH_BASE}/token`, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  saveTokens(data);
  await loadPrimaryAccount();
  return data;
}

async function refreshAccessToken() {
  const row = db.prepare('SELECT * FROM schwab_tokens WHERE id = 1').get();
  if (!row || !row.refresh_token) throw new Error('Not connected to Schwab yet');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
  });
  const { data } = await axios.post(`${AUTH_BASE}/token`, body.toString(), {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  saveTokens(data);
  return data;
}

function saveTokens(data) {
  const expiresAt = Date.now() + (data.expires_in || 1800) * 1000;
  const existing = db.prepare('SELECT id FROM schwab_tokens WHERE id = 1').get();
  if (existing) {
    db.prepare(
      `UPDATE schwab_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1`
    ).run(data.access_token, data.refresh_token || existing.refresh_token, expiresAt);
  } else {
    db.prepare(
      `INSERT INTO schwab_tokens (id, access_token, refresh_token, expires_at) VALUES (1, ?, ?, ?)`
    ).run(data.access_token, data.refresh_token, expiresAt);
  }
}

// Returns a valid access token, refreshing it first if it's expired/near-expiry.
async function getValidAccessToken() {
  const row = db.prepare('SELECT * FROM schwab_tokens WHERE id = 1').get();
  if (!row || !row.access_token) throw new Error('Not connected to Schwab yet');

  const soon = Date.now() + 60 * 1000; // refresh a minute early
  if (row.expires_at && row.expires_at < soon) {
    await refreshAccessToken();
    return db.prepare('SELECT access_token FROM schwab_tokens WHERE id = 1').get().access_token;
  }
  return row.access_token;
}

async function loadPrimaryAccount() {
  const token = await getValidAccessToken();
  const { data } = await axios.get(`${API_BASE}/accounts/accountNumbers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (Array.isArray(data) && data.length > 0) {
    const { accountNumber, hashValue } = data[0];
    db.prepare(
      `UPDATE schwab_tokens SET account_number = ?, account_hash = ? WHERE id = 1`
    ).run(accountNumber, hashValue);
  }
  return data;
}

function isConnected() {
  const row = db.prepare('SELECT * FROM schwab_tokens WHERE id = 1').get();
  return !!(row && row.refresh_token);
}

// Fetches recent transactions and normalizes them into a flat list of
// option "legs" the frontend can offer up for import into a position.
// `days` controls how far back to look (Schwab caps this at 60 days per call).
async function fetchRecentTransactions(days = 14) {
  const token = await getValidAccessToken();
  const row = db.prepare('SELECT account_hash FROM schwab_tokens WHERE id = 1').get();
  if (!row || !row.account_hash) await loadPrimaryAccount();
  const accountHash = db.prepare('SELECT account_hash FROM schwab_tokens WHERE id = 1').get().account_hash;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    types: 'TRADE',
  });

  const { data } = await axios.get(
    `${API_BASE}/accounts/${accountHash}/transactions?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return normalizeTransactions(data);
}

// Schwab's transaction shape has a transferItems array per trade; each item
// with an OPTION instrument is one leg. We flatten that into something that
// looks like a row from the old spreadsheet, ready to review and import.
function normalizeTransactions(transactions) {
  const legs = [];
  for (const txn of transactions || []) {
    const items = txn.transferItems || [];
    for (const item of items) {
      const instrument = item.instrument || {};
      if (instrument.assetType !== 'OPTION') continue;

      const isSell = (item.instruction || '').toUpperCase().includes('SELL');
      const size = Math.abs(item.amount || 0);
      const price = item.price != null ? item.price : 0;
      const action = isSell ? 'SOLD' : 'BOT';

      legs.push({
        schwab_activity_id: `${txn.activityId}-${instrument.symbol}`,
        trade_date: txn.tradeDate,
        underlying: instrument.underlyingSymbol || instrument.symbol,
        action,
        size,
        structure: instrument.description || instrument.symbol,
        price,
        net: computeNet(action, size, price),
      });
    }
  }
  return legs;
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  isConnected,
  fetchRecentTransactions,
};

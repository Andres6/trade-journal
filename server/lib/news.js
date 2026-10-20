const finnhub = require('./finnhub');

const DAYS_BACK = 3;          // look-back window for each sync
const PER_SYMBOL_KEEP = 15;   // newest N unique headlines stored per symbol per sync
const RETENTION_DAYS = 14;    // older rows are pruned on every sync
const MAX_HEADLINE = 300;

// Finnhub's free tier has no importance score, so "major" is a keyword
// heuristic on the headline. It is a filter, not a guarantee.
const MAJOR_RE = new RegExp(
  '\\b(' + [
    'upgrad\\w*', 'downgrad\\w*', 'price target', 'initiates?', 'guidance', 'outlook',
    'earnings', 'beats?', 'misses?', 'profit warning',
    'acquir\\w*', 'acquisition', 'merger', 'buyout', 'takeover', 'bid for',
    'lawsuit', 'sues?', 'sued', 'probe', 'investigation', 'subpoena', 'settle\\w*',
    'sec', 'doj', 'ftc', 'fda', 'approv\\w*', 'recall\\w*', 'trial', 'phase [123i]+',
    'bankrupt\\w*', 'layoffs?', 'job cuts', 'resign\\w*', 'steps? down', 'ceo', 'cfo',
    'dividend', 'buyback', 'repurchase', 'stock split', 'offering',
    'short seller', 'halted?', 'plunge[sd]?', 'tumbles?', 'soars?', 'crash\\w*',
  ].join('|') + ')\\b',
  'i'
);

function isMajor(headline) {
  return MAJOR_RE.test(headline || '');
}

function cleanUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : null;
}

function normHeadline(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapNews(row, symbol) {
  const headline = String(row.headline || '').trim().slice(0, MAX_HEADLINE);
  const url = cleanUrl(row.url);
  const ts = Number(row.datetime);
  if (!headline || !url || !Number.isFinite(ts) || ts <= 0) return null;
  return {
    symbol,
    headline,
    source: row.source ? String(row.source).slice(0, 80) : null,
    url,
    published_at: Math.floor(ts),
    external_id: row.id !== undefined && row.id !== null ? String(row.id) : url,
  };
}

function pruneOld(db, userId, nowSec) {
  db.prepare('DELETE FROM news WHERE user_id = ? AND published_at < ?')
    .run(userId, nowSec - RETENTION_DAYS * 86400);
}

async function syncNews({ db, userId, client, now = new Date(), sleep, onProgress }) {
  const out = { symbols: 0, added: 0, failed: [], stopped: null, truncated: [] };
  if (!client) { out.stopped = 'not_configured'; return out; }

  const { usable, truncated } = finnhub.trackedSymbols(db, userId);
  out.symbols = usable.length;
  out.truncated = truncated;
  if (onProgress) onProgress(0, usable.length);

  const today = finnhub.isoInTz(now);
  const from = finnhub.addDaysISO(today, -DAYS_BACK);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO news (user_id, symbol, headline, source, url, published_at, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let done = 0;
  for (const symbol of usable) {
    let attempts = 0;
    for (;;) {
      try {
        const rows = await client.companyNews(symbol, from, today);
        const seen = new Set();
        const items = rows
          .map((r) => mapNews(r, symbol))
          .filter(Boolean)
          .sort((a, b) => b.published_at - a.published_at)
          .filter((it) => {
            const key = normHeadline(it.headline);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, PER_SYMBOL_KEEP);
        for (const it of items) {
          const res = insert.run(userId, it.symbol, it.headline, it.source, it.url, it.published_at, it.external_id);
          if (res.changes) out.added += 1;
        }
      } catch (err) {
        if (err.kind === 'auth') { out.stopped = 'auth'; return out; }
        if (err.kind === 'rate') {
          attempts += 1;
          if (attempts > finnhub.RATE_RETRIES) { out.stopped = 'rate'; return out; }
          await sleep(finnhub.RATE_RETRY_MS);
          continue;
        }
        out.failed.push(symbol);
      }
      break;
    }
    done += 1;
    if (onProgress) onProgress(done, usable.length);
    await sleep(finnhub.THROTTLE_MS);
  }

  pruneOld(db, userId, Math.floor(now.getTime() / 1000));
  return out;
}

module.exports = { syncNews, isMajor, mapNews, DAYS_BACK };

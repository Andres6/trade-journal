const axios = require('axios');
const fred = require('./fred');

const BASE = 'https://finnhub.io/api/v1';
const TZ = process.env.CALENDAR_TIMEZONE || 'America/New_York';

// Keep the calendar lean: a short look-ahead, a hard cap on symbols, and only
// high-impact US economic releases.
const EARNINGS_DAYS_AHEAD = 60;
const MAX_SYMBOLS = 40;
const THROTTLE_MS = 300; // free tier allows ~60 calls/minute

// Indexes and big ETFs never report earnings; skip them to save API calls.
const NO_EARNINGS = new Set([
  'SPX', 'SPXW', 'XSP', 'NDX', 'RUT', 'VIX', 'VIXW', 'DJX',
  'SPY', 'QQQ', 'IWM', 'DIA',
]);

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const HOUR_LABEL = { bmo: 'before open', amc: 'after close', dmh: 'during hours' };

class FinnhubError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'auth' | 'premium' | 'rate' | 'other'
  }
}

function isConfigured() {
  return !!process.env.FINNHUB_API_KEY;
}

// ---------- tiny date helpers (string-based, no local-time surprises) ----------

function isoInTz(date, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Finnhub economic times are "YYYY-MM-DD HH:MM:SS" in UTC; show them in ET.
function utcToLocal(timeStr, tz = TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(timeStr || '');
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  // No time, or exactly midnight UTC, means "no specific time": keep the date as-is.
  if (hh === undefined || (hh === '00' && mm === '00')) {
    return { date: `${y}-${mo}-${d}`, time: null };
  }
  const utc = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(utc);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// ---------- API client ----------

function createClient({ apiKey, http = axios }) {
  async function get(path, params) {
    try {
      const res = await http.get(`${BASE}${path}`, {
        params,
        headers: { 'X-Finnhub-Token': apiKey },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 401) throw new FinnhubError('auth', 'Finnhub rejected the API key.');
      if (status === 403) throw new FinnhubError('premium', 'Not available on this Finnhub plan.');
      if (status === 429) throw new FinnhubError('rate', 'Finnhub rate limit hit.');
      throw new FinnhubError('other', err.message || 'Request failed');
    }
  }
  return {
    async earnings(symbol, from, to) {
      const data = await get('/calendar/earnings', { symbol, from, to });
      return (data && data.earningsCalendar) || [];
    },
  };
}

// ---------- mapping Finnhub rows to calendar events ----------

const fmtEps = (n) => `$${Number(n).toFixed(2)}`;
function fmtRev(n) {
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}
const has = (v) => v !== null && v !== undefined && v !== '';

function mapEarnings(r) {
  const symbol = String(r.symbol || '').toUpperCase();
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return null;
  const when = HOUR_LABEL[r.hour];
  const bits = [];
  if (r.year && r.quarter) bits.push(`Q${r.quarter} ${r.year}`);
  if (has(r.epsActual)) {
    bits.push(`EPS ${fmtEps(r.epsActual)}${has(r.epsEstimate) ? ` vs est. ${fmtEps(r.epsEstimate)}` : ''}`);
  } else if (has(r.epsEstimate)) {
    bits.push(`EPS est. ${fmtEps(r.epsEstimate)}`);
  }
  if (has(r.revenueEstimate) && !has(r.revenueActual)) bits.push(`Rev est. ${fmtRev(r.revenueEstimate)}`);
  return {
    source: 'finnhub-earnings',
    external_id: r.year && r.quarter ? `${symbol}:${r.year}Q${r.quarter}` : `${symbol}:${r.date}`,
    event_date: r.date,
    event_time: null,
    title: `Earnings${when ? ` · ${when}` : ''}`,
    category: 'Earnings',
    symbol,
    notes: bits.join(' · ') || null,
  };
}

// ---------- writing to the events table ----------

// Insert new feed events; refresh existing ones; never touch rows the user
// edited or deleted (hidden).
function upsertEvent(db, userId, ev) {
  const existing = db
    .prepare('SELECT * FROM events WHERE user_id = ? AND source = ? AND external_id = ?')
    .get(userId, ev.source, ev.external_id);

  if (!existing) {
    db.prepare(
      `INSERT INTO events (user_id, event_date, event_time, title, category, symbol, notes, source, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, ev.event_date, ev.event_time, ev.title, ev.category, ev.symbol, ev.notes, ev.source, ev.external_id);
    return 'added';
  }
  if (existing.hidden || existing.edited) return 'kept';

  const same =
    existing.event_date === ev.event_date &&
    existing.event_time === ev.event_time &&
    existing.title === ev.title &&
    existing.notes === ev.notes;
  if (same) return 'kept';

  db.prepare(
    `UPDATE events SET event_date = ?, event_time = ?, title = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(ev.event_date, ev.event_time, ev.title, ev.notes, existing.id);
  return 'updated';
}

// ---------- symbols to track ----------

function openPositionSymbols(db, userId) {
  return db
    .prepare("SELECT DISTINCT UPPER(TRIM(symbol)) AS s FROM positions WHERE user_id = ? AND status = 'open'")
    .all(userId)
    .map((r) => r.s)
    .filter(Boolean);
}

function watchlistSymbols(db, userId) {
  return db
    .prepare('SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY symbol')
    .all(userId)
    .map((r) => r.symbol);
}

function trackedSymbols(db, userId) {
  const all = [...new Set([...openPositionSymbols(db, userId), ...watchlistSymbols(db, userId)])];
  const usable = all.filter((s) => SYMBOL_RE.test(s) && !NO_EARNINGS.has(s));
  return { usable: usable.slice(0, MAX_SYMBOLS), skipped: all.filter((s) => !usable.includes(s)) };
}

// ---------- the sync ----------
// Earnings (Finnhub) and economic dates (FRED) are independent: a failure in
// one never stops the other.

async function syncEarnings({ db, userId, client, today, sleep }) {
  const out = { symbols: 0, added: 0, updated: 0, failed: [], stopped: null, skipped: [] };
  if (!client) { out.stopped = 'not_configured'; return out; }

  const { usable, skipped } = trackedSymbols(db, userId);
  out.skipped = skipped;
  out.symbols = usable.length;

  const to = addDaysISO(today, EARNINGS_DAYS_AHEAD);
  for (const symbol of usable) {
    try {
      const rows = await client.earnings(symbol, today, to);
      for (const row of rows) {
        const ev = mapEarnings(row);
        if (!ev) continue;
        const res = upsertEvent(db, userId, ev);
        if (res === 'added') out.added += 1;
        if (res === 'updated') out.updated += 1;
      }
    } catch (err) {
      if (err.kind === 'auth' || err.kind === 'rate') {
        out.stopped = err.kind;
        return out;
      }
      out.failed.push(symbol);
    }
    await sleep(THROTTLE_MS);
  }
  return out;
}

async function syncEconomic({ db, userId, today, fred, apiKey }) {
  const out = { status: 'ok', added: 0, updated: 0, scanned: 0, matched: [], message: null };
  if (!apiKey) {
    out.status = 'not_configured';
    out.message = 'FRED_API_KEY is not set in server/.env. Add it and restart the server.';
    return out;
  }
  try {
    const { hits, scanned, missing, failed } = await fred.fetchEconomicDates({
      apiKey, from: today, to: addDaysISO(today, fred.DAYS_AHEAD),
    });
    out.scanned = scanned;
    out.matched = [...new Set(hits.map((h) => h.label))];
    const notes = [];
    if (missing.length) notes.push(`not found on FRED: ${missing.join(', ')}`);
    if (failed.length) notes.push(`could not fetch: ${failed.join(', ')}`);
    out.message = notes.length ? notes.join('. ') : null;
    for (const h of hits) {
      const res = upsertEvent(db, userId, fred.mapEconomicDate(h));
      if (res === 'added') out.added += 1;
      if (res === 'updated') out.updated += 1;
    }
  } catch (err) {
    out.status = 'error';
    out.message = err.message;
  }
  return out;
}

async function runSync({
  db, userId, client, now = new Date(), tz = TZ,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  fred = require('./fred'),
  fredKey = process.env.FRED_API_KEY,
  only = 'both', // 'both' | 'earnings' | 'economic'
}) {
  const today = isoInTz(now, tz);
  const result = {};
  if (only !== 'economic') {
    result.earnings = await syncEarnings({ db, userId, client, today, sleep });
  }
  if (only !== 'earnings') {
    result.economic = await syncEconomic({ db, userId, today, fred, apiKey: fredKey });
  }
  return result;
}

module.exports = {
  FinnhubError, isConfigured, createClient, runSync,
  syncEarnings, syncEconomic,
  mapEarnings, utcToLocal, trackedSymbols, SYMBOL_RE,
};

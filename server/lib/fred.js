const axios = require('axios');

// FRED (St. Louis Fed) publishes release DATES only: no release times and no
// consensus estimates. So economic events from here are all-day entries.
const BASE = 'https://api.stlouisfed.org/fred';
const DAYS_AHEAD = 30;
const PER_RELEASE_LIMIT = 100; // newest-first, so this covers the next year of scheduled dates
const TIMEOUT_MS = 20000;

// Only the releases that move markets. Matched against FRED's release names.
const WATCHED = [
  { re: /^Employment Situation/i, label: 'Jobs report (nonfarm payrolls)' },
  { re: /^Consumer Price Index/i, label: 'CPI' },
  { re: /^Producer Price Index/i, label: 'PPI' },
  { re: /^Gross Domestic Product/i, label: 'GDP' },
  { re: /^Personal Income and Outlays/i, label: 'PCE inflation' },
  { re: /^Advance Monthly Sales for Retail/i, label: 'Retail sales' },
  { re: /^Job Openings and Labor Turnover/i, label: 'JOLTS job openings' },
  { re: /^Unemployment Insurance Weekly Claims/i, label: 'Initial jobless claims' },
  { re: /^Industrial Production/i, label: 'Industrial production' },
];

// Release IDs change rarely, so look them up once per server run.
let idCache = null; // { byLabel: Map<label, {id, name}>, at: ms }
const ID_CACHE_MS = 24 * 60 * 60 * 1000;

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

class FredError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'auth' | 'rate' | 'other'
  }
}

function wrapError(err) {
  const status = err.response && err.response.status;
  // FRED puts the real reason in the body, e.g. "Bad value for api_key".
  const reason = (err.response && err.response.data && err.response.data.error_message) || '';
  if (status === 400 || status === 401 || status === 403) {
    return new FredError('auth', `FRED rejected the request (${status})${reason ? `: ${reason}` : '.'}`);
  }
  if (status === 429) return new FredError('rate', 'FRED rate limit hit. Try again in a minute.');
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
    return new FredError('other', 'FRED did not respond in time. Try again in a minute.');
  }
  return new FredError('other', err.message || 'FRED request failed');
}

async function get(http, path, params, apiKey) {
  try {
    const res = await http.get(`${BASE}${path}`, {
      params: { api_key: apiKey, file_type: 'json', ...params },
      timeout: TIMEOUT_MS,
    });
    return res.data || {};
  } catch (err) {
    throw wrapError(err);
  }
}

// One small call: the list of all releases (names + IDs). Matched to our watch list.
async function resolveWatchedIds(apiKey, http) {
  if (idCache && Date.now() - idCache.at < ID_CACHE_MS) return idCache.byLabel;

  const data = await get(http, '/releases', { limit: 1000 }, apiKey);
  const releases = data.releases || [];
  const byLabel = new Map();
  for (const w of WATCHED) {
    const hit = releases.find((r) => w.re.test(r.name || ''));
    if (hit) byLabel.set(w.label, { id: hit.id, name: hit.name });
  }
  idCache = { byLabel, at: Date.now() };
  return byLabel;
}

// Returns { hits, scanned, missing, failed } for the window [from, to].
async function fetchEconomicDates({ apiKey, from, to, http = axios }) {
  const ids = await resolveWatchedIds(apiKey, http);
  const missing = WATCHED.map((w) => w.label).filter((l) => !ids.has(l));

  const hits = [];
  const failed = [];
  let scanned = 0;

  for (const [label, { id }] of ids) {
    try {
      const data = await get(http, '/release/dates', {
        release_id: id,
        include_release_dates_with_no_data: 'true',
        sort_order: 'desc',
        limit: PER_RELEASE_LIMIT,
      }, apiKey);
      const rows = data.release_dates || [];
      scanned += rows.length;
      for (const r of rows) {
        if (r.date >= from && r.date <= to) {
          hits.push({ date: r.date, release_id: id, label });
        }
      }
    } catch (err) {
      // An auth or rate-limit problem affects everything, so stop. A single
      // slow release shouldn't block the others.
      if (err.kind === 'auth' || err.kind === 'rate') throw err;
      failed.push(label);
    }
  }

  return { hits, scanned, missing, failed };
}

function mapEconomicDate(row) {
  return {
    source: 'fred-economic',
    external_id: `${row.release_id}|${row.date}`,
    event_date: row.date,
    event_time: null,
    title: row.label,
    category: 'Economic',
    symbol: null,
    notes: null,
  };
}

module.exports = { FredError, fetchEconomicDates, mapEconomicDate, DAYS_AHEAD, addDaysISO, WATCHED };

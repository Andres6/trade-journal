import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const PER_SYMBOL_DEFAULT = 3;
const LATEST_LIMIT = 60;
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "2h ago" within a day, otherwise "19 OCT" plus the time.
function formatWhen(sec) {
  const d = new Date(sec * 1000);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)}h ago`;
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} · ${time}`;
}

function describeSync(r) {
  if (!r) return '';
  if (r.stopped === 'not_configured') return 'News needs FINNHUB_API_KEY in server/.env.';
  const parts = [`${r.added} new headline${r.added === 1 ? '' : 's'} (${r.symbols} symbol${r.symbols === 1 ? '' : 's'})`];
  if (r.stopped === 'rate') parts.push('stopped early: rate limit, try again in a minute');
  if (r.stopped === 'auth') parts.push('Finnhub rejected the API key');
  if (r.failed && r.failed.length) parts.push(`could not fetch ${r.failed.join(', ')}`);
  if (r.truncated && r.truncated.length) parts.push(`${r.truncated.length} symbol(s) over the limit were skipped`);
  return parts.join(' · ');
}

function Headline({ item, showSymbol }) {
  return (
    <a className="news-item" href={item.url} target="_blank" rel="noopener noreferrer">
      <span className="news-meta">
        {showSymbol && <span className="news-sym">{item.symbol}</span>}
        <span className="news-source">{item.source || 'Source'}</span>
        <span className="news-when">{formatWhen(item.published_at)}</span>
      </span>
      <span className="news-headline">{item.headline}</span>
    </a>
  );
}

export default function News() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const [view, setView] = useState('symbol'); // 'symbol' | 'latest'
  const [majorOnly, setMajorOnly] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [expanded, setExpanded] = useState(() => new Set());

  function load() {
    return api
      .newsList()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function runSync() {
    setSyncing(true);
    setSyncMsg('');
    setError('');
    try {
      await api.newsSync();
      // The server works through the list in the background; poll until done.
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const st = await api.newsSyncStatus();
        if (st.running) {
          setSyncMsg(`Syncing… ${st.done} of ${st.total} symbols`);
          continue;
        }
        if (st.error) throw new Error(st.error);
        if (st.result) setSyncMsg(describeSync(st.result));
        break;
      }
      await load();
    } catch (err) {
      setSyncMsg(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const watchSet = useMemo(() => new Set(data?.watchlist || []), [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.items.filter(
      (it) => (!majorOnly || it.major) && (symbolFilter === 'ALL' || it.symbol === symbolFilter)
    );
  }, [data, majorOnly, symbolFilter]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of visible) {
      if (!map.has(it.symbol)) map.set(it.symbol, []);
      map.get(it.symbol).push(it);
    }
    // Symbols with the freshest headline first.
    return [...map.entries()].sort((a, b) => b[1][0].published_at - a[1][0].published_at);
  }, [visible]);

  function toggleExpanded(sym) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }

  const trackedSorted = [...(data?.tracked || [])].sort();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">News</div>
          <h1>Headlines</h1>
        </div>
        <button className="btn btn-primary" onClick={runSync} disabled={syncing || !data?.configured}>
          {syncing ? 'Syncing…' : 'Sync news'}
        </button>
      </div>

      {data && !data.configured && (
        <p className="muted">Add FINNHUB_API_KEY to server/.env and restart the server to turn this on.</p>
      )}
      {syncMsg && <p className="cal-feed-msg">{syncMsg}</p>}
      {error && <div className="form-error">{error}</div>}

      <div className="cal-controls">
        <div className="tabs tabs-compact cal-view-tabs">
          {[['symbol', 'By symbol'], ['latest', 'Latest']].map(([v, label]) => (
            <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <div className="news-filters">
          <label className="news-check">
            <input type="checkbox" checked={majorOnly} onChange={(e) => setMajorOnly(e.target.checked)} />
            Major only
          </label>
          <select value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} aria-label="Filter by symbol">
            <option value="ALL">All symbols</option>
            {trackedSorted.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {majorOnly && (
        <p className="sym-legend muted">
          "Major" is a keyword match on the headline (upgrades, earnings, deals, lawsuits, FDA, and similar).
          It's a rough filter and can miss things.
        </p>
      )}

      {loading && <p className="muted">Loading…</p>}

      {!loading && data && trackedSorted.length === 0 && (
        <p className="muted">
          No symbols yet. Open positions are included automatically; add more under{' '}
          <Link to="/settings">Settings</Link>.
        </p>
      )}

      {!loading && data && trackedSorted.length > 0 && visible.length === 0 && (
        <p className="muted">
          {data.items.length === 0
            ? 'No headlines stored yet. Press "Sync news" to pull the last few days.'
            : 'Nothing matches these filters.'}
        </p>
      )}

      {view === 'latest' && visible.length > 0 && (
        <div className="news-list">
          {visible.slice(0, LATEST_LIMIT).map((it) => (
            <Headline key={it.id} item={it} showSymbol />
          ))}
          {visible.length > LATEST_LIMIT && (
            <p className="muted">Showing the newest {LATEST_LIMIT} of {visible.length}.</p>
          )}
        </div>
      )}

      {view === 'symbol' &&
        groups.map(([sym, items]) => {
          const open = expanded.has(sym);
          const shown = open ? items : items.slice(0, PER_SYMBOL_DEFAULT);
          return (
            <section key={sym} className="news-group">
              <h2 className="news-group-head">
                <span className={`news-group-sym ${watchSet.has(sym) ? '' : 'is-auto'}`}>{sym}</span>
                <span className="news-count">{items.length}</span>
              </h2>
              <div className="news-list">
                {shown.map((it) => (
                  <Headline key={it.id} item={it} />
                ))}
              </div>
              {items.length > PER_SYMBOL_DEFAULT && (
                <button className="news-more" onClick={() => toggleExpanded(sym)}>
                  {open ? 'Show fewer' : `Show ${items.length - PER_SYMBOL_DEFAULT} more`}
                </button>
              )}
            </section>
          );
        })}

      {view === 'symbol' && groups.length > 0 && (
        <p className="sym-legend muted">Italic = from open positions. Upright = watchlist.</p>
      )}
    </div>
  );
}

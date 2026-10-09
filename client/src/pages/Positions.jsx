import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtMoney } from '../lib/api.js';
import { fmtDate } from '../lib/dates.js';
import { useSortedRows } from '../hooks/useSortedRows.js';
import SortableTh from '../components/SortableTh.jsx';
import StatusStamp from '../components/StatusStamp.jsx';
import KpiStrip from '../components/KpiStrip.jsx';

export default function Positions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState('open');
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1');
  const [symbol, setSymbol] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const { sorted, sort, toggleSort, resetSort } = useSortedRows(positions);
  const isOpen = filter === 'open';

  // If the active sort column is hidden on this tab, fall back to the default sort.
  useEffect(() => {
    if ((isOpen && sort.key === 'closed') || (!isOpen && sort.key === 'last')) resetSort();
  }, [filter]);

  function load() {
    setLoading(true);
    Promise.all([
      api.listPositions(filter === 'all' ? undefined : filter),
      api.summary ? api.summary() : Promise.resolve(null) // Safe fallback depending on your api helper method name
    ])
      .then(([posData, summaryData]) => {
        setPositions(posData);
        if (summaryData) setSummary(summaryData);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  async function createPosition(e) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setError('');
    setCreating(true);
    try {
      const position = await api.createPosition({
        symbol: symbol.trim(),
        comment: comment.trim() || undefined,
      });
      navigate(`/positions/${position.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Positions</div>
          <h1>Tracking your trades</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New position'}
        </button>
      </div>

      <KpiStrip 
        summary={summary} 
        metrics={['open_positions', 'total_trades', 'realized_pl', 'unrealized_pl', 'win_rate']} 
      />

      {showForm && (
        <form className="card form-card" onSubmit={createPosition}>
          <div className="form-row">
            <label>
              Symbol
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. TSLA"
                autoFocus
              />
            </label>
            <label className="grow">
              Opening comment (optional)
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Thesis, setup, anything worth remembering"
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create position'}
          </button>
        </form>
      )}

      <div className="tabs">
        {['open', 'closed', 'all'].map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && positions.length === 0 && (
        <div className="empty-state">Nothing here yet.</div>
      )}
      {!loading && positions.length > 0 && (
        <div className="table-scroll" style={{ '--table-min-width': isOpen ? '740px' : '750px' }}>
        <table className="ledger-table">
          <colgroup>
            <col style={{ width: '90px' }} />
            <col style={{ width: '100px' }} />
            {isOpen && <col style={{ width: '100px' }} />}
            <col style={{ width: '120px' }} />
            {!isOpen && <col style={{ width: '100px' }} />}
            <col style={{ width: '60px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '150px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Symbol</th>
              {isOpen && <SortableTh label="Last" sortKey="last" sort={sort} onSort={toggleSort} />}
              <SortableTh label="Open" sortKey="opened" sort={sort} onSort={toggleSort} />
              <SortableTh label="Expiration" sortKey="expiration" sort={sort} onSort={toggleSort} />
              {!isOpen && <SortableTh label="Closed" sortKey="closed" sort={sort} onSort={toggleSort} />}
              <th>Trades</th>
              <th>Running total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id} className={i % 2 === 1 ? 'stripe' : ''}>
                <td>
                  <Link to={`/positions/${p.id}`} className="symbol-link">
                    {p.symbol}
                  </Link>
                </td>
                {isOpen && <td className="mono">{fmtDate(p.last_trade_date)}</td>}
                <td className="mono">{fmtDate(p.opened_at)}</td>
                <td className="mono">{fmtDate(p.expiration_date)}</td>
                {!isOpen && <td className="mono">{fmtDate(p.closed_at)}</td>}
                <td className="mono">{p.trade_count}</td>
                <td className={`mono ${p.net_total >= 0 ? 'pl-gain' : 'pl-loss'}`}>
                  {fmtMoney(p.net_total)}
                </td>
                <td>
                  <StatusStamp status={p.status} netTotal={p.net_total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

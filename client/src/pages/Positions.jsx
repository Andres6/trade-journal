import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../lib/api.js';
import StatusStamp from '../components/StatusStamp.jsx';

export default function Positions() {
  const [filter, setFilter] = useState('open');
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api
      .listPositions(filter === 'all' ? undefined : filter)
      .then(setPositions)
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  async function createPosition(e) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setError('');
    try {
      await api.createPosition({ symbol: symbol.trim(), comment: comment.trim() || undefined });
      setSymbol('');
      setComment('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Positions</div>
          <h1>Every symbol you've traded</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New position'}
        </button>
      </div>

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
          <button type="submit" className="btn btn-primary">
            Create position
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
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Opened</th>
              <th>Closed</th>
              <th>Trades</th>
              <th>Running total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => (
              <tr key={p.id} className={i % 2 === 1 ? 'stripe' : ''}>
                <td>
                  <Link to={`/positions/${p.id}`} className="symbol-link">
                    {p.symbol}
                  </Link>
                </td>
                <td className="mono">{p.opened_at}</td>
                <td className="mono">{p.closed_at || '—'}</td>
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
      )}
    </div>
  );
}

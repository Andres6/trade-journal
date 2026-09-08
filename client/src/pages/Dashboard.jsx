import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../lib/api.js';
import KpiStrip from '../components/KpiStrip.jsx';
import StatusStamp from '../components/StatusStamp.jsx';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [openPositions, setOpenPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    Promise.all([api.summary(), api.listPositions('open')])
      .then(([s, p]) => {
        setSummary(s);
        setOpenPositions(p);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Today's ledger</div>
          <h1>{today}</h1>
        </div>
        <Link to="/positions" className="btn btn-primary">
          + New position
        </Link>
      </div>

      <KpiStrip summary={summary} />

      <section className="section">
        <h2>Open positions</h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && openPositions.length === 0 && (
          <div className="empty-state">
            No open positions. When you log a new trade, it starts a position here.
          </div>
        )}
        {!loading && openPositions.length > 0 && (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Opened</th>
                <th>Trades</th>
                <th>Running total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? 'stripe' : ''}>
                  <td>
                    <Link to={`/positions/${p.id}`} className="symbol-link">
                      {p.symbol}
                    </Link>
                  </td>
                  <td className="mono">{p.opened_at}</td>
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
      </section>
    </div>
  );
}

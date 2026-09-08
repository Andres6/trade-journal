import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtMoney } from '../lib/api.js';
import StatusStamp from '../components/StatusStamp.jsx';
import TradeEntryForm from '../components/TradeEntryForm.jsx';

export default function PositionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closingRemarks, setClosingRemarks] = useState('');
  const [comment, setComment] = useState('');

  function load() {
    setLoading(true);
    api
      .getPosition(id)
      .then((p) => {
        setPosition(p);
        setComment(p.comment || '');
        setClosingRemarks(p.closing_remarks || '');
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function toggleStatus() {
    const nextStatus = position.status === 'open' ? 'closed' : 'open';
    await api.updatePosition(id, { status: nextStatus, closing_remarks: closingRemarks });
    load();
  }

  async function saveNotes() {
    await api.updatePosition(id, { comment, closing_remarks: closingRemarks });
    load();
  }

  async function removePosition() {
    if (!confirm(`Delete position ${position.symbol} and all its trades? This can't be undone.`)) return;
    await api.deletePosition(id);
    navigate('/positions');
  }

  async function removeTrade(tradeId) {
    if (!confirm('Delete this trade?')) return;
    await api.deleteTrade(tradeId);
    load();
  }

  if (loading) return <div className="page">Loading…</div>;
  if (!position) return <div className="page">Position not found.</div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Position</div>
          <h1>
            {position.symbol}{' '}
            <span className="net-total-inline mono">{fmtMoney(position.net_total)}</span>
          </h1>
        </div>
        <div className="button-row">
          <StatusStamp status={position.status} netTotal={position.net_total} />
          <button className="btn" onClick={toggleStatus}>
            Mark {position.status === 'open' ? 'closed' : 'open'}
          </button>
          <button className="btn btn-danger" onClick={removePosition}>
            Delete
          </button>
        </div>
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Action</th>
            <th>Size</th>
            <th>Structure</th>
            <th>Price</th>
            <th>Net</th>
            <th>Running total</th>
            <th>Comment</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {position.trades.map((t, i) => (
            <tr key={t.id} className={i % 2 === 1 ? 'stripe' : ''}>
              <td className="mono">{i + 1}</td>
              <td className="mono">{t.trade_date}</td>
              <td className={t.action === 'SOLD' ? 'action-sold' : 'action-bot'}>{t.action}</td>
              <td className="mono">{t.size}</td>
              <td>{t.structure}</td>
              <td className="mono">{t.price}</td>
              <td className={`mono ${t.net >= 0 ? 'pl-gain' : 'pl-loss'}`}>{fmtMoney(t.net)}</td>
              <td className={`mono ${t.cost_basis >= 0 ? 'pl-gain' : 'pl-loss'}`}>
                {fmtMoney(t.cost_basis)}
              </td>
              <td className="muted">{t.comment || ''}</td>
              <td>
                <button className="link-btn" onClick={() => removeTrade(t.id)}>
                  remove
                </button>
              </td>
            </tr>
          ))}
          {position.trades.length === 0 && (
            <tr>
              <td colSpan={10} className="empty-state">
                No trades logged yet. Add the first leg below.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <TradeEntryForm positionId={position.id} onAdded={load} />

      <section className="section">
        <h2>Comments</h2>
        <div className="card">
          <label>
            Opening thesis / trade comments
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Why you put this on, what you're watching…"
            />
          </label>
          <label>
            Closing remarks
            <textarea
              value={closingRemarks}
              onChange={(e) => setClosingRemarks(e.target.value)}
              rows={3}
              placeholder="How it played out, what you'd do differently…"
            />
          </label>
          <button className="btn btn-primary" onClick={saveNotes}>
            Save notes
          </button>
        </div>
      </section>
    </div>
  );
}

import React, { useState } from 'react';
import { api, fmtMoney } from '../lib/api.js';

export default function TradeRow({ trade, index, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setForm({
      trade_date: trade.trade_date,
      action: trade.action,
      size: trade.size,
      structure: trade.structure,
      price: trade.price,
      comment: trade.comment || '',
    });
    setError('');
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.updateTrade(trade.id, {
        ...form,
        size: Number(form.size),
        price: Number(form.price),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this trade?')) return;
    await api.deleteTrade(trade.id);
    onChanged();
  }

  const rowClass = index % 2 === 1 ? 'stripe' : '';
  // Action color follows the trade's own net, same convention as Net and
  // Running total columns: profitable (or credit-received) legs are green,
  // debit/loss legs are red — not a fixed color per SOLD vs BOT.
  const netClass = trade.net >= 0 ? 'pl-gain' : 'pl-loss';

  if (!editing) {
    return (
      <tr className={rowClass}>
        <td className="mono">{index + 1}</td>
        <td className="mono">{trade.trade_date}</td>
        <td className={`mono ${netClass}`}>{trade.action}</td>
        <td className="mono">{trade.size}</td>
        <td>{trade.structure}</td>
        <td className="mono">{trade.price}</td>
        <td className={`mono ${netClass}`}>{fmtMoney(trade.net)}</td>
        <td className={`mono ${trade.cost_basis >= 0 ? 'pl-gain' : 'pl-loss'}`}>
          {fmtMoney(trade.cost_basis)}
        </td>
        <td className="muted">{trade.comment || ''}</td>
        <td className="row-actions">
          <button className="link-btn" onClick={startEdit}>
            edit
          </button>
          <button className="link-btn" onClick={remove}>
            remove
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={rowClass}>
      <td className="mono">{index + 1}</td>
      <td>
        <input
          type="date"
          value={form.trade_date}
          onChange={(e) => setForm({ ...form, trade_date: e.target.value })}
        />
      </td>
      <td>
        <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
          <option value="SOLD">SOLD</option>
          <option value="BOT">BOT</option>
        </select>
      </td>
      <td>
        <input
          type="number"
          min="1"
          value={form.size}
          onChange={(e) => setForm({ ...form, size: e.target.value })}
        />
      </td>
      <td>
        <input value={form.structure} onChange={(e) => setForm({ ...form, structure: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          step="0.01"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
      </td>
      <td colSpan={2} className="muted">
        net & running total recalculate on save
      </td>
      <td>
        <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      </td>
      <td className="row-actions">
        {error && <div className="form-error">{error}</div>}
        <button className="link-btn" onClick={save} disabled={busy}>
          {busy ? 'saving…' : 'save'}
        </button>
        <button className="link-btn" onClick={() => setEditing(false)}>
          cancel
        </button>
      </td>
    </tr>
  );
}

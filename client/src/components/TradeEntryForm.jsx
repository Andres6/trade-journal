import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function TradeEntryForm({ positionId, onAdded }) {
  const [mode, setMode] = useState('paste'); // 'paste' | 'manual'
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [manual, setManual] = useState({ action: 'SOLD', size: '', structure: '', price: '' });
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handlePreview() {
    setError('');
    setPreview(null);
    if (!rawText.trim()) return;
    try {
      const parsed = await api.parseOrderText(rawText.trim());
      setPreview(parsed);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'paste') {
        if (!rawText.trim()) throw new Error('Paste an order line first');
        await api.createTrade({
          position_id: positionId,
          raw_text: rawText.trim(),
          trade_date: tradeDate,
          comment: comment.trim() || undefined,
        });
        setRawText('');
        setPreview(null);
      } else {
        const { action, size, structure, price } = manual;
        if (!size || !structure || price === '') throw new Error('Fill in size, structure and price');
        await api.createTrade({
          position_id: positionId,
          action,
          size: Number(size),
          structure,
          price: Number(price),
          trade_date: tradeDate,
          comment: comment.trim() || undefined,
        });
        setManual({ action: 'SOLD', size: '', structure: '', price: '' });
      }
      setComment('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2>Add a trade</h2>
      <div className="card form-card">
        <div className="tabs tabs-compact">
          <button
            type="button"
            className={`tab ${mode === 'paste' ? 'active' : ''}`}
            onClick={() => setMode('paste')}
          >
            Paste order text
          </button>
          <button
            type="button"
            className={`tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual entry
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'paste' ? (
            <>
              <label>
                Order text
                <textarea
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    setPreview(null);
                  }}
                  onBlur={handlePreview}
                  rows={2}
                  placeholder="SOLD -2 1/2 BACKRATIO TSLA 100 21 AUG 26 355/370 CALL @-.07"
                />
              </label>
              {preview && (
                <div className="preview-row mono">
                  {preview.action} {preview.size} · {preview.structure} · @{preview.price} → net{' '}
                  {preview.net >= 0 ? '+' : ''}
                  {preview.net.toFixed(2)}
                </div>
              )}
            </>
          ) : (
            <div className="form-row">
              <label>
                Action
                <select
                  value={manual.action}
                  onChange={(e) => setManual({ ...manual, action: e.target.value })}
                >
                  <option value="SOLD">SOLD</option>
                  <option value="BOT">BOT</option>
                </select>
              </label>
              <label>
                Size
                <input
                  type="number"
                  min="1"
                  value={manual.size}
                  onChange={(e) => setManual({ ...manual, size: e.target.value })}
                />
              </label>
              <label className="grow">
                Structure
                <input
                  value={manual.structure}
                  onChange={(e) => setManual({ ...manual, structure: e.target.value })}
                  placeholder="1/2 BACKRATIO TSLA 21 AUG 26 355/370 CALL"
                />
              </label>
              <label>
                Price
                <input
                  type="number"
                  step="0.01"
                  value={manual.price}
                  onChange={(e) => setManual({ ...manual, price: e.target.value })}
                  placeholder="-0.07"
                />
              </label>
            </div>
          )}

          <div className="form-row">
            <label>
              Date
              <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
            </label>
            <label className="grow">
              Comment (optional)
              <input value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add trade'}
          </button>
        </form>
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const CATEGORIES = ['Earnings', 'Economic', 'Fed', 'Expiration', 'Other'];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// All date math here is deliberately local-time and string-based.
// `new Date('2026-09-17')` parses as UTC and lands on the wrong day west of
// Greenwich, so dates are only ever built from explicit Y/M/D components.
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function midnight(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d, n) {
  const c = midnight(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfWeek(d) {
  const c = midnight(d);
  return addDays(c, -c.getDay());
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

function catClass(category) {
  return `cal-cat-${String(category || 'other').toLowerCase()}`;
}

const EMPTY_FORM = {
  id: null,
  event_date: '',
  event_time: '',
  title: '',
  category: 'Earnings',
  symbol: '',
  notes: '',
};

export default function Calendar() {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => midnight(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);

  const todayISO = useMemo(() => toISO(new Date()), []);

  // The visible window: exactly the week, or the full month grid including
  // the leading/trailing days borrowed from neighbouring months.
  const range = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: startOfWeek(firstOfMonth), end: addDays(startOfWeek(lastOfMonth), 6) };
  }, [view, anchor]);

  const startISO = toISO(range.start);
  const endISO = toISO(range.end);

  const days = useMemo(() => {
    const out = [];
    const total = Math.round((range.end - range.start) / 86400000) + 1;
    for (let i = 0; i < total; i += 1) out.push(addDays(range.start, i));
    return out;
  }, [startISO, endISO]);

  function load() {
    setLoading(true);
    api
      .listEvents(startISO, endISO)
      .then((rows) => {
        setEvents(rows);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [startISO, endISO]);

  const byDate = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    }
    return map;
  }, [events]);

  const headline =
    view === 'week'
      ? `${MONTH_SHORT[range.start.getMonth()]} ${range.start.getDate()} – ${
          MONTH_SHORT[range.end.getMonth()]
        } ${range.end.getDate()}, ${range.end.getFullYear()}`
      : `${MONTH_LONG[anchor.getMonth()]} ${anchor.getFullYear()}`;

  function step(direction) {
    setAnchor((a) =>
      view === 'week'
        ? addDays(a, 7 * direction)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1)
    );
  }

  // The form sits above the grid, so opening it from a day further down
  // would otherwise scroll it off-screen on mobile.
  function revealForm() {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function openNew(dateISO) {
    setError('');
    setForm({ ...EMPTY_FORM, event_date: dateISO });
    revealForm();
  }

  function openEdit(event) {
    setError('');
    revealForm();
    setForm({
      id: event.id,
      event_date: event.event_date,
      event_time: event.event_time || '',
      title: event.title,
      category: event.category,
      symbol: event.symbol || '',
      notes: event.notes || '',
    });
  }

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Give the event a title.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      event_date: form.event_date,
      event_time: form.event_time || null,
      title: form.title,
      category: form.category,
      symbol: form.symbol || null,
      notes: form.notes || null,
    };
    try {
      if (form.id) await api.updateEvent(form.id, payload);
      else await api.createEvent(payload);
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    if (!confirm('Delete this event?')) return;
    setSaving(true);
    try {
      await api.deleteEvent(form.id);
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Calendar</div>
          <h1>{headline}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => openNew(todayISO)}>
          + New event
        </button>
      </div>

      <div className="cal-controls">
        <div className="button-row">
          <button className="btn" onClick={() => step(-1)} aria-label="Previous">
            ‹
          </button>
          <button className="btn" onClick={() => setAnchor(midnight(new Date()))}>
            Today
          </button>
          <button className="btn" onClick={() => step(1)} aria-label="Next">
            ›
          </button>
        </div>
        <div className="tabs tabs-compact cal-view-tabs">
          {['week', 'month'].map((v) => (
            <button
              key={v}
              className={`tab ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {form && (
        <form className="card form-card" ref={formRef} onSubmit={save}>
          <div className="form-row">
            <label>
              Date
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                required
              />
            </label>
            <label>
              Time (blank = all day)
              <input
                type="time"
                value={form.event_time}
                onChange={(e) => setForm({ ...form, event_time: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Symbol (optional)
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="e.g. NVDA"
              />
            </label>
          </div>
          <div className="form-row">
            <label className="grow">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. NVDA earnings, after close"
                autoFocus
              />
            </label>
          </div>
          <div className="form-row">
            <label className="grow">
              Notes (optional)
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Consensus, expected move, what you're watching"
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add event'}
            </button>
            <button type="button" className="btn" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </button>
            {form.id && (
              <button type="button" className="btn btn-danger" onClick={remove} disabled={saving}>
                Delete
              </button>
            )}
          </div>
        </form>
      )}

      {error && !form && <div className="form-error">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && view === 'week' && (
        <div className="cal-week">
          {days.map((d) => {
            const iso = toISO(d);
            const list = byDate[iso] || [];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={iso}
                className={`cal-day-row ${iso === todayISO ? 'is-today' : ''} ${
                  isWeekend ? 'is-weekend' : ''
                }`}
              >
                <div className="cal-day-label">
                  <span className="cal-day-name">{WEEKDAY_SHORT[d.getDay()]}</span>
                  <span className="cal-day-num mono">
                    {MONTH_SHORT[d.getMonth()]} {d.getDate()}
                  </span>
                </div>
                <div className="cal-day-body">
                  {list.length === 0 && <span className="cal-day-empty">—</span>}
                  {list.map((e) => (
                    <button key={e.id} className={`cal-event ${catClass(e.category)}`} onClick={() => openEdit(e)}>
                      {e.event_time && <span className="cal-event-time mono">{fmtTime(e.event_time)}</span>}
                      {e.symbol && <span className="cal-event-symbol mono">{e.symbol}</span>}
                      <span className="cal-event-title">{e.title}</span>
                      {e.notes && <span className="cal-event-notes">{e.notes}</span>}
                    </button>
                  ))}
                  <button className="cal-add" onClick={() => openNew(iso)} aria-label={`Add event on ${iso}`}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && view === 'month' && (
        <div className="cal-month">
          <div className="cal-month-head">
            {WEEKDAY_SHORT.map((w) => (
              <div key={w} className="cal-month-head-cell">
                {w}
              </div>
            ))}
          </div>
          <div className="cal-month-grid">
            {days.map((d) => {
              const iso = toISO(d);
              const list = byDate[iso] || [];
              const outside = d.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={iso}
                  className={`cal-month-cell ${iso === todayISO ? 'is-today' : ''} ${
                    outside ? 'is-outside' : ''
                  }`}
                  onClick={() => openNew(iso)}
                >
                  <div className="cal-month-daynum mono">{d.getDate()}</div>
                  {list.map((e) => (
                    <button
                      key={e.id}
                      className={`cal-chip ${catClass(e.category)}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEdit(e);
                      }}
                      title={`${e.event_time ? fmtTime(e.event_time) + ' · ' : ''}${e.title}`}
                    >
                      {e.symbol ? `${e.symbol} ` : ''}
                      {e.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && (
        <div className="cal-legend">
          {CATEGORIES.map((c) => (
            <span key={c} className="cal-legend-item">
              <span className={`cal-swatch ${catClass(c)}`} />
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

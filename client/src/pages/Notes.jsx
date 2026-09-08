import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const CATEGORIES = ['Lesson', 'Setup', 'Mistake', 'Idea', 'General'];

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Lesson');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.listNotes().then(setNotes).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setError('');
    try {
      await api.createNote({ title: title.trim() || undefined, category, content: content.trim() });
      setTitle('');
      setContent('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this note?')) return;
    await api.deleteNote(id);
    load();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Journal</div>
          <h1>Notes &amp; lessons</h1>
        </div>
      </div>

      <form className="card form-card" onSubmit={submit}>
        <div className="form-row">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Title (optional)
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label>
          Note
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="What did the market teach you today?"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="btn btn-primary">
          Save note
        </button>
      </form>

      {loading && <p className="muted">Loading…</p>}
      <div className="notes-list">
        {notes.map((n) => (
          <article key={n.id} className="note-card">
            <div className="note-head">
              <span className="note-category">{n.category}</span>
              <span className="note-date mono">{n.created_at?.slice(0, 10)}</span>
            </div>
            {n.title && <h3>{n.title}</h3>}
            <p>{n.content}</p>
            <button className="link-btn" onClick={() => remove(n.id)}>
              remove
            </button>
          </article>
        ))}
        {!loading && notes.length === 0 && <div className="empty-state">No notes yet.</div>}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function Login({ onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">Ledger</div>
        <p className="login-sub">Options trade journal — private access</p>
        <label className="login-label" htmlFor="pw">
          Password
        </label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

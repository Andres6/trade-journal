import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from '../lib/api.js';

export default function Settings({ isAdmin }) {
  const [connected, setConnected] = useState(null);
  const [days, setDays] = useState(14);
  const [legs, setLegs] = useState([]);
  const [openPositions, setOpenPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importedIds, setImportedIds] = useState(new Set());

  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [userError, setUserError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  function refreshStatus() {
    if (!isAdmin) return;
    api.schwabStatus().then((s) => setConnected(s.connected));
    api.listPositions('open').then(setOpenPositions);
    loadUsers();
  }

  function loadUsers() {
    api.listUsers().then(setUsers).catch(() => {});
  }

  useEffect(refreshStatus, [isAdmin]);

  async function connect() {
    setError('');
    try {
      const { url } = await api.schwabAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  async function fetchTransactions() {
    setLoading(true);
    setError('');
    try {
      const rows = await api.schwabTransactions(days);
      setLegs(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function findOpenPosition(underlying) {
    return openPositions.find((p) => p.symbol === underlying.toUpperCase());
  }

  async function importLeg(leg) {
    let position = findOpenPosition(leg.underlying);
    if (!position) {
      position = await api.createPosition({ symbol: leg.underlying, opened_at: leg.trade_date?.slice(0, 10) });
      setOpenPositions((prev) => [...prev, position]);
    }
    await api.createTrade({
      position_id: position.id,
      trade_date: leg.trade_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      action: leg.action,
      size: leg.size,
      structure: leg.structure,
      price: leg.price,
    });
    setImportedIds((prev) => new Set(prev).add(leg.schwab_activity_id));
  }

  async function createGuest(e) {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    setUserError('');
    setCreatingUser(true);
    try {
      await api.createUser({ username: newUsername.trim(), password: newPassword });
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } catch (err) {
      setUserError(err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  async function removeGuest(id, username) {
    if (!confirm(`Remove the guest account "${username}"? This deletes everything in their journal too.`)) {
      return;
    }
    await api.deleteUser(id);
    loadUsers();
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Settings</div>
            <h1>Nothing here yet</h1>
          </div>
        </div>
        <p className="muted">
          Guest accounts don't have any settings to manage — this page is only used by the account
          owner.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Connections</h1>
        </div>
      </div>

      <section className="section">
        <h2>Guest accounts</h2>
        <p className="muted">
          Each guest gets their own completely separate journal — their positions, trades, and notes
          are invisible to you and to other guests. Handy for showing someone how the app works
          without exposing your real trades.
        </p>
        <div className="card form-card">
          <form onSubmit={createGuest}>
            <div className="form-row">
              <label>
                Username
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. guest"
                  autoCapitalize="none"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
            </div>
            {userError && <div className="form-error">{userError}</div>}
            <button type="submit" className="btn btn-primary" disabled={creatingUser}>
              {creatingUser ? 'Creating…' : 'Create guest account'}
            </button>
          </form>
        </div>

        {users.filter((u) => !u.is_admin).length > 0 && (
          <table className="ledger-table">
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Username</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => !u.is_admin)
                .map((u, i) => (
                  <tr key={u.id} className={i % 2 === 1 ? 'stripe' : ''}>
                    <td>{u.username}</td>
                    <td className="mono">{u.created_at?.slice(0, 10)}</td>
                    <td>
                      <button className="link-btn" onClick={() => removeGuest(u.id, u.username)}>
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>Schwab account</h2>
        <div className="card">
          {connected === null && <p className="muted">Checking connection…</p>}
          {connected === false && (
            <>
              <p>
                Not connected. You'll need a Schwab Developer app registered at{' '}
                <a href="https://developer.schwab.com" target="_blank" rel="noreferrer">
                  developer.schwab.com
                </a>{' '}
                with its client ID, secret, and callback URL set in <code>server/.env</code> before
                this will work — see the README.
              </p>
              <button className="btn btn-primary" onClick={connect}>
                Connect Schwab account
              </button>
            </>
          )}
          {connected === true && (
            <>
              <p className="stamp stamp-win" style={{ display: 'inline-block' }}>
                CONNECTED
              </p>
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <label>
                  Look back
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                </label>
                <button className="btn btn-primary" onClick={fetchTransactions} disabled={loading}>
                  {loading ? 'Fetching…' : 'Fetch recent transactions'}
                </button>
              </div>
            </>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
      </section>

      {legs.length > 0 && (
        <section className="section">
          <h2>Transactions to review</h2>
          <p className="muted">
            Each row becomes one trade leg. Importing creates the position if it doesn't already exist
            as an open position for that symbol.
          </p>
          <div className="table-scroll" style={{ '--table-min-width': '825px' }}>
          <table className="ledger-table">
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '65px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Action</th>
                <th>Size</th>
                <th>Structure</th>
                <th>Price</th>
                <th>Net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg, i) => {
                const done = importedIds.has(leg.schwab_activity_id);
                return (
                  <tr key={leg.schwab_activity_id || i} className={i % 2 === 1 ? 'stripe' : ''}>
                    <td className="mono">{leg.trade_date?.slice(0, 10)}</td>
                    <td>{leg.underlying}</td>
                    <td className={`mono ${leg.net >= 0 ? 'pl-gain' : 'pl-loss'}`}>{leg.action}</td>
                    <td className="mono">{leg.size}</td>
                    <td>{leg.structure}</td>
                    <td className="mono">{leg.price}</td>
                    <td className={`mono ${leg.net >= 0 ? 'pl-gain' : 'pl-loss'}`}>{fmtMoney(leg.net)}</td>
                    <td>
                      <button className="link-btn" disabled={done} onClick={() => importLeg(leg)}>
                        {done ? 'imported' : 'import'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}

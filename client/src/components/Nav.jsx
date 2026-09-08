import React from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Nav({ onLogout }) {
  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <header className="nav">
      <div className="nav-mark">Ledger</div>
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/positions" className={({ isActive }) => (isActive ? 'active' : '')}>
          Positions
        </NavLink>
        <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}>
          Notes &amp; Lessons
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
          Settings
        </NavLink>
      </nav>
      <button className="nav-logout" onClick={logout}>
        Log out
      </button>
    </header>
  );
}

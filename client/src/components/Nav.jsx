import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Nav({ onLogout, isAdmin, username }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  async function logout() {
    await api.logout();
    onLogout();
  }

  // Close the mobile dropdown whenever the route changes (i.e. after
  // tapping a link), so it doesn't stay open on the next page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="nav">
      <div className="nav-mark">
        <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
          M.G.I. Options
        </NavLink>
      </div>

      <button
        className="nav-hamburger"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      <nav className={`nav-links ${menuOpen ? 'open' : ''}`}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/positions" className={({ isActive }) => (isActive ? 'active' : '')}>
          Positions
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
          Calendar
        </NavLink>
        <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}>
          Notes &amp; Lessons
        </NavLink>
        {isAdmin && (
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            Settings
          </NavLink>
        )}
        <button className="nav-logout-mobile" onClick={logout}>
          Log out{username ? ` (${username})` : ''}
        </button>
      </nav>

      <span className="nav-username">{username}</span>
      <button className="nav-logout" onClick={logout}>
        Log out
      </button>
    </header>
  );
}

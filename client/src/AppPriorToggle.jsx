import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api.js';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Positions from './pages/Positions.jsx';
import PositionDetail from './pages/PositionDetail.jsx';
import Calendar from './pages/Calendar.jsx';
import Notes from './pages/Notes.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [session, setSession] = useState(null); // null = checking

  function refreshSession() {
    api
      .session()
      .then((s) => setSession(s.loggedIn ? s : false))
      .catch(() => setSession(false));
  }

  useEffect(refreshSession, []);

  if (session === null) {
    return <div className="boot-screen">Opening the ledger…</div>;
  }

  if (!session) {
    return <Login onLoggedIn={refreshSession} />;
  }

  return (
    <div className="app-shell">
      <Nav isAdmin={session.isAdmin} username={session.username} onLogout={() => setSession(false)} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/positions/:id" element={<PositionDetail />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings isAdmin={session.isAdmin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

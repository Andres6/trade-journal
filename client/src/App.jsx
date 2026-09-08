import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api.js';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Positions from './pages/Positions.jsx';
import PositionDetail from './pages/PositionDetail.jsx';
import Notes from './pages/Notes.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(null); // null = checking

  useEffect(() => {
    api
      .session()
      .then((s) => setLoggedIn(s.loggedIn))
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) {
    return <div className="boot-screen">Opening the ledger…</div>;
  }

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app-shell">
      <Nav onLogout={() => setLoggedIn(false)} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/positions/:id" element={<PositionDetail />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

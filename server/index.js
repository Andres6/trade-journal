require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const { router: authRouter, requireAuth } = require('./routes/auth');
const positionsRouter = require('./routes/positions');
const tradesRouter = require('./routes/trades');
const notesRouter = require('./routes/notes');
const schwabRouter = require('./routes/schwab');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // secure: true, // uncomment once served over HTTPS
    },
  })
);

// Auth routes are open (that's how you log in); everything else needs a session.
app.use('/api/auth', authRouter);
app.use('/api/positions', requireAuth, positionsRouter);
app.use('/api/trades', requireAuth, tradesRouter);
app.use('/api/notes', requireAuth, notesRouter);
app.use('/api/schwab', requireAuth, schwabRouter);

// Schwab redirects the browser here directly, outside the fetch/XHR session
// flow above still applies since the browser carries the session cookie.

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built frontend
const clientDist = path.resolve(__dirname, process.env.CLIENT_DIST || '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Trade journal server listening on port ${PORT}`);
});

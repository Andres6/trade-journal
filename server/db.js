const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'journal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'closed'
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    comment TEXT,
    closing_remarks TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    trade_date TEXT NOT NULL,
    action TEXT NOT NULL,                        -- 'SOLD' | 'BOT'
    size INTEGER NOT NULL,
    structure TEXT NOT NULL,
    price REAL NOT NULL,                          -- signed, broker convention: + debit / - credit
    net REAL NOT NULL,                             -- -100 * size * price
    comment TEXT,
    raw_text TEXT,
    schwab_activity_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'Lesson',
    title TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schwab_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    account_number TEXT,
    account_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trades_position ON trades(position_id);
  CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
`);

module.exports = db;

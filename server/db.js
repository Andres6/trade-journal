const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'journal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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

// --- Migration: add user_id to positions/notes if this DB predates accounts ---
// This only ever ADDS a column and backfills it; it never touches existing
// trade/position/note rows beyond stamping them with an owner id, so
// upgrading never loses or alters real trade data.
function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function migrateOwnership() {
  const needsPositionsMigration = !columnExists('positions', 'user_id');
  const needsNotesMigration = !columnExists('notes', 'user_id');

  if (needsPositionsMigration) {
    db.exec('ALTER TABLE positions ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
  if (needsNotesMigration) {
    db.exec('ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }

  // Seed the owner account from server/.env on first run, or if this DB
  // predates accounts entirely (users table empty).
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = process.env.APP_PASSWORD_HASH;
    if (!hash) {
      console.warn(
        'No users exist yet and APP_PASSWORD_HASH is not set in server/.env — set it and restart before logging in.'
      );
      return;
    }
    const username = process.env.APP_OWNER_USERNAME || 'owner';
    const info = db
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
      .run(username, hash);
    const ownerId = info.lastInsertRowid;

    // Any pre-existing positions/notes (from before accounts existed) belong
    // to the owner — this is what actually preserves real trade history
    // across the upgrade.
    db.prepare('UPDATE positions SET user_id = ? WHERE user_id IS NULL').run(ownerId);
    db.prepare('UPDATE notes SET user_id = ? WHERE user_id IS NULL').run(ownerId);

    console.log(`Seeded owner account "${username}" (existing data assigned to this account).`);
  }
}

migrateOwnership();

module.exports = db;

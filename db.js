const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data', 'wedding.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    max_guests INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    attending INTEGER,
    song_request TEXT,
    message TEXT,
    responded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 8,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_child INTEGER NOT NULL DEFAULT 0,
    invited_events TEXT NOT NULL DEFAULT 'ceremony,reception',
    attending INTEGER,
    meal_choice TEXT,
    dietary_notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_guests_party ON guests(party_id);
  CREATE INDEX IF NOT EXISTS idx_guests_table ON guests(table_id);
  CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(last_name, first_name);
`);

const guestCols = db.prepare('PRAGMA table_info(guests)').all().map((c) => c.name);
if (!guestCols.includes('table_id')) {
  db.exec('ALTER TABLE guests ADD COLUMN table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL');
}

module.exports = db;

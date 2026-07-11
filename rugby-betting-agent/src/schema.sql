CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  competition TEXT,
  elo_rating REAL NOT NULL DEFAULT 1500
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  competition TEXT NOT NULL,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  bookmaker TEXT NOT NULL,
  market_type TEXT NOT NULL,
  selection TEXT NOT NULL,
  line REAL,
  price REAL NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id, market_type, captured_at);

CREATE TABLE IF NOT EXISTS fair_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  market_type TEXT NOT NULL,
  selection TEXT NOT NULL,
  line REAL,
  fair_prob REAL NOT NULL,
  method TEXT NOT NULL,
  contributing_books INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fair_values_match ON fair_values(match_id, market_type, computed_at);

CREATE TABLE IF NOT EXISTS value_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  bookmaker TEXT NOT NULL,
  market_type TEXT NOT NULL,
  selection TEXT NOT NULL,
  line REAL,
  price REAL NOT NULL,
  fair_prob REAL NOT NULL,
  implied_prob REAL NOT NULL,
  edge_pct REAL NOT NULL,
  kelly_fraction REAL NOT NULL,
  confidence TEXT NOT NULL,
  reason TEXT,
  flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opportunities_match ON value_opportunities(match_id, flagged_at);

CREATE TABLE IF NOT EXISTS elo_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  match_id INTEGER REFERENCES matches(id),
  rating_before REAL NOT NULL,
  rating_after REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

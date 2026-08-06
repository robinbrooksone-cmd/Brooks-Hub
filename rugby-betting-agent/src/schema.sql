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
  player_id INTEGER REFERENCES players(id),
  line REAL,
  price REAL NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id, market_type, captured_at);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  position TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, team_id)
);

-- One row per team per historical match: how many tries that team scored, and
-- against whom. Drives both attack rate (own tries scored) and defense factor
-- (tries conceded = the opponent's tries_scored row for the same match).
CREATE TABLE IF NOT EXISTS team_match_tries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  opponent_id INTEGER NOT NULL REFERENCES teams(id),
  match_date TEXT NOT NULL,
  competition TEXT,
  tries_scored INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_match_tries_team ON team_match_tries(team_id, match_date);
CREATE INDEX IF NOT EXISTS idx_team_match_tries_opponent ON team_match_tries(opponent_id, match_date);

-- One row per player per historical match: how many tries they personally scored.
-- Divided by the team's team_match_tries total for the same period, this gives a
-- player's historical share of their team's tries — the input that lets a strong
-- driving-maul hooker show up with a higher share than a generic positional guess.
CREATE TABLE IF NOT EXISTS player_tries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  match_date TEXT NOT NULL,
  competition TEXT,
  tries INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_player_tries_player ON player_tries(player_id, match_date);

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
  opportunity_type TEXT NOT NULL DEFAULT 'book_outlier',
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

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function getOrCreateTeam(name, competition) {
  const existing = db.prepare('SELECT * FROM teams WHERE name = ?').get(name);
  if (existing) return existing;
  const initialRating = require('./config').elo.initialRating;
  const info = db
    .prepare('INSERT INTO teams (name, competition, elo_rating) VALUES (?, ?, ?)')
    .run(name, competition || null, initialRating);
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid);
}

function getOrCreatePlayer(name, teamId) {
  const existing = db
    .prepare('SELECT * FROM players WHERE name = ? AND (team_id = ? OR (team_id IS NULL AND ? IS NULL))')
    .get(name, teamId ?? null, teamId ?? null);
  if (existing) return existing;
  const info = db
    .prepare('INSERT INTO players (name, team_id) VALUES (?, ?)')
    .run(name, teamId ?? null);
  return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Sources without a stable external_id (scrapers, manual CSV prop odds) still need
 * to land on the same match row as an API-sourced fixture for the same fixture,
 * otherwise fair-value computation never sees the combined odds. Falls back to
 * matching an existing match on the same home/away teams with a kickoff on the
 * same calendar day — good enough for one fixture per day between two given teams,
 * which covers rugby scheduling in practice.
 */
function getOrCreateMatch({ externalId, competition, homeTeam, awayTeam, kickoffAt }) {
  if (externalId) {
    const existing = db.prepare('SELECT * FROM matches WHERE external_id = ?').get(externalId);
    if (existing) return existing;
  }

  const home = getOrCreateTeam(homeTeam, competition);
  const away = getOrCreateTeam(awayTeam, competition);

  if (!externalId) {
    const dayStart = `${String(kickoffAt).slice(0, 10)}T00:00:00`;
    const dayEnd = `${String(kickoffAt).slice(0, 10)}T23:59:59`;
    const existing = db
      .prepare(
        `SELECT * FROM matches
         WHERE home_team_id = ? AND away_team_id = ? AND kickoff_at BETWEEN ? AND ?`
      )
      .get(home.id, away.id, dayStart, dayEnd);
    if (existing) return existing;
  }

  const info = db
    .prepare(
      `INSERT INTO matches (external_id, competition, home_team_id, away_team_id, kickoff_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(externalId || null, competition, home.id, away.id, kickoffAt);
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { db, getOrCreateTeam, getOrCreateMatch, getOrCreatePlayer };

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

function getOrCreateMatch({ externalId, competition, homeTeam, awayTeam, kickoffAt }) {
  if (externalId) {
    const existing = db.prepare('SELECT * FROM matches WHERE external_id = ?').get(externalId);
    if (existing) return existing;
  }
  const home = getOrCreateTeam(homeTeam, competition);
  const away = getOrCreateTeam(awayTeam, competition);
  const info = db
    .prepare(
      `INSERT INTO matches (external_id, competition, home_team_id, away_team_id, kickoff_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(externalId || null, competition, home.id, away.id, kickoffAt);
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { db, getOrCreateTeam, getOrCreateMatch };

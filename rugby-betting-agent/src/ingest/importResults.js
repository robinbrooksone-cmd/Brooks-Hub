const fs = require('fs');
const { db, getOrCreateTeam } = require('../db');
const { updateRatings } = require('../analysis/elo');

/**
 * Seeds/updates the Elo power-rating model from a CSV of historical results.
 * Expected header: date,competition,home_team,away_team,home_score,away_score
 * date should be ISO-parseable (YYYY-MM-DD); rows are processed oldest-first so
 * ratings evolve chronologically. This repo ships no real historical results —
 * see data/sample-results.csv for the format and pull your own data (e.g. from
 * a rugby stats provider, ESPN Scrum, or Wikipedia match archives) before relying
 * on the Elo half of the fair-value model.
 */

function parseCsv(text) {
  const lines = text.trim().split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const [header, ...rows] = lines;
  const cols = header.split(',').map((c) => c.trim());
  return rows.map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const record = {};
    cols.forEach((col, i) => { record[col] = values[i]; });
    return record;
  });
}

function importResultsFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const records = parseCsv(text)
    .map((r) => ({
      date: r.date,
      competition: r.competition,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
    }))
    .filter((r) => r.homeTeam && r.awayTeam && Number.isFinite(r.homeScore) && Number.isFinite(r.awayScore))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let processed = 0;
  const tx = db.transaction((recs) => {
    for (const r of recs) {
      const home = getOrCreateTeam(r.homeTeam, r.competition);
      const away = getOrCreateTeam(r.awayTeam, r.competition);

      const { homeRating, awayRating } = updateRatings(
        home.elo_rating,
        away.elo_rating,
        r.homeScore,
        r.awayScore
      );

      db.prepare('UPDATE teams SET elo_rating = ? WHERE id = ?').run(homeRating, home.id);
      db.prepare('UPDATE teams SET elo_rating = ? WHERE id = ?').run(awayRating, away.id);
      db.prepare(
        'INSERT INTO elo_history (team_id, rating_before, rating_after) VALUES (?, ?, ?)'
      ).run(home.id, home.elo_rating, homeRating);
      db.prepare(
        'INSERT INTO elo_history (team_id, rating_before, rating_after) VALUES (?, ?, ?)'
      ).run(away.id, away.elo_rating, awayRating);

      processed += 1;
    }
  });
  tx(records);

  return { processed };
}

module.exports = { importResultsFromFile, parseCsv };

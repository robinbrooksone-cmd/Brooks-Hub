const { db } = require('../db');

/**
 * Full drill-down for a single match: every bookmaker's latest price on every
 * market (not just the ones that cleared the value-flagging bar), the blended
 * fair value behind each selection, every opportunity ever flagged, and the
 * complete odds history for that match so price movement is visible. Backs the
 * dashboard's match-detail page (src/server/public/match.html).
 */

function latestByKey(rows, keyFn, tieBreakerField) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const existing = map.get(key);
    if (!existing || row[tieBreakerField] > existing[tieBreakerField]) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function getMatchDetail(matchId) {
  const match = db
    .prepare(
      `SELECT m.*, home.name AS home_team, away.name AS away_team
       FROM matches m
       JOIN teams home ON home.id = m.home_team_id
       JOIN teams away ON away.id = m.away_team_id
       WHERE m.id = ?`
    )
    .get(matchId);
  if (!match) return null;

  const priceHistory = db
    .prepare('SELECT * FROM odds_snapshots WHERE match_id = ? ORDER BY captured_at ASC')
    .all(matchId);

  const board = latestByKey(
    priceHistory,
    (r) => `${r.bookmaker}::${r.market_type}::${r.selection}::${r.line ?? ''}`,
    'captured_at'
  ).sort((a, b) => a.market_type.localeCompare(b.market_type) || a.selection.localeCompare(b.selection) || a.bookmaker.localeCompare(b.bookmaker));

  const fairValueHistory = db
    .prepare('SELECT * FROM fair_values WHERE match_id = ? ORDER BY computed_at ASC')
    .all(matchId);
  const fairValues = latestByKey(
    fairValueHistory,
    (r) => `${r.market_type}::${r.selection}::${r.line ?? ''}`,
    'computed_at'
  ).sort((a, b) => a.market_type.localeCompare(b.market_type) || a.selection.localeCompare(b.selection));

  const opportunityHistory = db
    .prepare('SELECT * FROM value_opportunities WHERE match_id = ? ORDER BY flagged_at DESC')
    .all(matchId);
  const opportunities = latestByKey(
    opportunityHistory,
    (r) => `${r.bookmaker}::${r.market_type}::${r.selection}::${r.line ?? ''}`,
    'flagged_at'
  ).sort((a, b) => b.edge_pct - a.edge_pct);

  return { match, board, fairValues, opportunities, priceHistory };
}

/**
 * Finds matches by team name (partial, case-insensitive) and/or competition —
 * deliberately not restricted to "upcoming" so a match that has already kicked
 * off (or finished) is still findable for drill-down.
 */
function findMatches({ team, competition } = {}) {
  let query = `
    SELECT m.*, home.name AS home_team, away.name AS away_team
    FROM matches m
    JOIN teams home ON home.id = m.home_team_id
    JOIN teams away ON away.id = m.away_team_id
    WHERE 1 = 1`;
  const params = [];
  if (team) {
    query += ' AND (home.name LIKE ? OR away.name LIKE ?)';
    params.push(`%${team}%`, `%${team}%`);
  }
  if (competition) {
    query += ' AND m.competition LIKE ?';
    params.push(`%${competition}%`);
  }
  query += ' ORDER BY m.kickoff_at DESC LIMIT 50';
  return db.prepare(query).all(...params);
}

module.exports = { getMatchDetail, findMatches };

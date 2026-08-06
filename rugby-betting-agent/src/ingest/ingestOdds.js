const { db, getOrCreateMatch, getOrCreateTeam, getOrCreatePlayer } = require('../db');
const { fetchAllConfiguredOdds } = require('../providers/oddsApiClient');
const { scrapeAllConfiguredBookmakers } = require('../providers/scraperEngine');
const { loadBookmakerConfigs } = require('../providers/scraperEngine');

const PLAYER_MARKET_PREFIX = 'player_';

const insertOdds = db.prepare(`
  INSERT INTO odds_snapshots (match_id, bookmaker, market_type, selection, player_id, line, price)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Player prop records (r.marketType starting with "player_") carry r.selection as
 * the player's display name and r.playerTeam as their team name, so we can resolve
 * them to a row in `players` (creating it on first sight) and link odds_snapshots
 * to it — that link is what lets the try-scorer model find the right player later.
 */
function persistRecords(records) {
  let stored = 0;
  const tx = db.transaction((recs) => {
    for (const r of recs) {
      if (!Number.isFinite(r.price) || r.price <= 1) continue; // decimal odds must be > 1
      const match = getOrCreateMatch({
        externalId: r.externalId,
        competition: r.competition,
        homeTeam: r.homeTeam,
        awayTeam: r.awayTeam,
        kickoffAt: r.kickoffAt,
      });

      let playerId = null;
      if (r.marketType.startsWith(PLAYER_MARKET_PREFIX) && r.playerTeam) {
        const team = getOrCreateTeam(r.playerTeam, r.competition);
        const player = getOrCreatePlayer(r.selection, team.id);
        if (r.playerPosition && !player.position) {
          db.prepare('UPDATE players SET position = ? WHERE id = ?').run(r.playerPosition, player.id);
        }
        playerId = player.id;
      }

      insertOdds.run(match.id, r.bookmaker, r.marketType, r.selection, playerId, r.line, r.price);
      stored += 1;
    }
  });
  tx(records);
  return stored;
}

async function ingestAll() {
  const summary = { apiRecords: 0, apiErrors: [], scraperRecords: 0, scraperSkipped: [], stored: 0 };

  try {
    const apiRecords = await fetchAllConfiguredOdds();
    summary.apiRecords = apiRecords.length;
    summary.stored += persistRecords(apiRecords);
  } catch (err) {
    summary.apiErrors.push(err.message);
  }

  const bookmakerConfigs = loadBookmakerConfigs();
  const competitions = [...new Set(bookmakerConfigs.map(() => 'rugby-union'))];
  for (const competition of competitions.length ? competitions : ['rugby-union']) {
    const { records, skippedBookmakers, disabled } = await scrapeAllConfiguredBookmakers(competition);
    if (disabled) continue;
    summary.scraperRecords += records.length;
    summary.scraperSkipped.push(...skippedBookmakers);
    summary.stored += persistRecords(records);
  }

  return summary;
}

module.exports = { ingestAll, persistRecords };

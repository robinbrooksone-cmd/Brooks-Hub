const fs = require('fs');
const { parseCsv } = require('./importResults');
const { persistRecords } = require('./ingestOdds');

/**
 * Player prop odds (anytime/first try scorer) are usually thin: many odds-comparison
 * APIs don't cover rugby props at all, and even when a bookmaker offers them, it's
 * often only readable off their own site/slip rather than an aggregator. Rather than
 * pretend an automated feed exists, this is a manual/CSV entry point — check a book's
 * try-scorer market yourself and log it here, or point a scraper you've built at it
 * and have it write this same CSV shape.
 *
 * Format: date,home_team,away_team,competition,bookmaker,player,player_team,position,market,price
 *   market: player_try_scorer_anytime | player_try_scorer_first | player_try_scorer_last
 *   price: decimal odds for that player "Yes" on that market
 */

const VALID_MARKETS = new Set([
  'player_try_scorer_anytime',
  'player_try_scorer_first',
  'player_try_scorer_last',
]);

function importPropOddsFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);

  const records = [];
  const rejected = [];
  for (const r of rows) {
    const price = Number(r.price);
    if (!VALID_MARKETS.has(r.market)) {
      rejected.push({ row: r, reason: `unknown market "${r.market}"` });
      continue;
    }
    if (!r.home_team || !r.away_team || !r.player || !r.player_team || !Number.isFinite(price)) {
      rejected.push({ row: r, reason: 'missing required field or invalid price' });
      continue;
    }
    records.push({
      externalId: null,
      competition: r.competition,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      kickoffAt: r.date,
      bookmaker: r.bookmaker,
      marketType: r.market,
      selection: r.player,
      playerTeam: r.player_team,
      playerPosition: r.position || null,
      line: null,
      price,
    });
  }

  const stored = persistRecords(records);
  return { stored, rejected };
}

module.exports = { importPropOddsFromFile, VALID_MARKETS };

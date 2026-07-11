const fs = require('fs');
const { parseCsv } = require('./importResults');
const { persistRecords } = require('./ingestOdds');

/**
 * Manual/CSV entry point for match-level odds (h2h/spreads/totals), for fixtures
 * that the Odds API adapter and bookmaker scrapers don't reliably cover — smaller
 * or age-grade tournaments (e.g. the U20 Rugby World Cup) often get thin-to-no
 * coverage on mainstream odds-comparison APIs, and bookmakers that do list them
 * may only be readable off their own site. Same shape as importPropOdds.js.
 *
 * Format: date,home_team,away_team,competition,bookmaker,market,selection,line,price
 *   market: h2h | spreads | totals
 *   selection: a team name for h2h/spreads, or "Over"/"Under" for totals
 *   line: required for spreads/totals, blank for h2h
 *
 * IMPORTANT — team naming: team identity in this system is keyed by name alone
 * (see src/db.js), and Elo ratings / player try-shares are tracked per team name.
 * A senior national side and its U20 side share a country name but are completely
 * different teams — if you import both as e.g. "South Africa", their ratings and
 * rosters will get merged into one nonsense team. Use a distinct name for the
 * junior side (e.g. "South Africa U20") consistently across every CSV/import you
 * feed it — results, tries, and odds alike.
 */

const VALID_MARKETS = new Set(['h2h', 'spreads', 'totals']);

function importMatchOddsFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);

  const records = [];
  const rejected = [];
  for (const r of rows) {
    const price = Number(r.price);
    const line = r.line === undefined || r.line === '' ? null : Number(r.line);

    if (!VALID_MARKETS.has(r.market)) {
      rejected.push({ row: r, reason: `unknown market "${r.market}"` });
      continue;
    }
    if (!r.home_team || !r.away_team || !r.selection || !Number.isFinite(price)) {
      rejected.push({ row: r, reason: 'missing required field or invalid price' });
      continue;
    }
    if (r.market !== 'h2h' && !Number.isFinite(line)) {
      rejected.push({ row: r, reason: `market "${r.market}" requires a numeric line` });
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
      selection: r.selection,
      line,
      price,
    });
  }

  const stored = persistRecords(records);
  return { stored, rejected };
}

module.exports = { importMatchOddsFromFile, VALID_MARKETS };

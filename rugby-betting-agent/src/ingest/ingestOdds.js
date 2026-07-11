const { db, getOrCreateMatch } = require('../db');
const { fetchAllConfiguredOdds } = require('../providers/oddsApiClient');
const { scrapeAllConfiguredBookmakers } = require('../providers/scraperEngine');
const { loadBookmakerConfigs } = require('../providers/scraperEngine');

const insertOdds = db.prepare(`
  INSERT INTO odds_snapshots (match_id, bookmaker, market_type, selection, line, price)
  VALUES (?, ?, ?, ?, ?, ?)
`);

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
      insertOdds.run(match.id, r.bookmaker, r.marketType, r.selection, r.line, r.price);
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

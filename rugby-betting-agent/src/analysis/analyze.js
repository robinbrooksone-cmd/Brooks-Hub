const { db } = require('../db');
const { computeAndStoreFairValues } = require('./fairValue');
const { findValueForMatch } = require('./valueFinder');

/**
 * Full analysis pass: recompute fair values then re-scan for opportunities on every
 * upcoming match that has odds ingested. Safe to run repeatedly (e.g. after every
 * ingestion) — fair_values and value_opportunities are append-only history tables,
 * so downstream consumers should always read the most recent row per key.
 */
function analyzeAllUpcomingMatches() {
  const matches = db
    .prepare("SELECT id FROM matches WHERE status = 'scheduled' AND kickoff_at >= datetime('now')")
    .all();

  const summary = { matchesProcessed: 0, fairValuesWritten: 0, opportunitiesFound: 0 };
  for (const { id } of matches) {
    summary.fairValuesWritten += computeAndStoreFairValues(id);
    summary.opportunitiesFound += findValueForMatch(id).length;
    summary.matchesProcessed += 1;
  }
  return summary;
}

module.exports = { analyzeAllUpcomingMatches };

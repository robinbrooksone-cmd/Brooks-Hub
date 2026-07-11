const config = require('../config');
const { db } = require('../db');
const { buildConsensus } = require('./consensus');
const { matchProbabilities } = require('./elo');

/**
 * Blends the bookmaker-consensus fair probability with the independent Elo-model
 * probability for selections both methods cover (moneyline/h2h). For markets Elo
 * doesn't model (spreads, totals) we fall back to consensus alone — that's still
 * genuinely useful (cross-book mispricing) even without an independent view.
 */
function blendProbabilities(consensusProbs, eloProbs, weights = {}) {
  const consensusWeight = weights.consensusWeight ?? config.analysis.consensusWeight;
  const eloWeight = weights.eloWeight ?? config.analysis.eloWeight;

  const selections = new Set([...Object.keys(consensusProbs), ...Object.keys(eloProbs || {})]);
  const blended = {};
  for (const selection of selections) {
    const c = consensusProbs[selection];
    const e = eloProbs ? eloProbs[selection] : undefined;
    if (c !== undefined && e !== undefined) {
      blended[selection] = c * consensusWeight + e * eloWeight;
    } else if (c !== undefined) {
      blended[selection] = c;
    } else {
      blended[selection] = e;
    }
  }
  const sum = Object.values(blended).reduce((a, b) => a + b, 0);
  const normalized = {};
  for (const [selection, p] of Object.entries(blended)) normalized[selection] = p / sum;
  return normalized;
}

const insertFairValue = db.prepare(`
  INSERT INTO fair_values (match_id, market_type, selection, line, fair_prob, method, contributing_books)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function eloProbsForMatch(match) {
  const home = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.home_team_id);
  const away = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.away_team_id);
  if (!home || !away) return null;
  const probs = matchProbabilities(home.elo_rating, away.elo_rating);
  return { [home.name]: probs.home, Draw: probs.draw, [away.name]: probs.away };
}

/**
 * Computes and persists fair values for every market on a match, using whatever
 * odds snapshots have been ingested for it. Returns the number of fair-value rows
 * written (0 if there wasn't enough bookmaker coverage to trust a consensus yet).
 */
function computeAndStoreFairValues(matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return 0;

  const rows = db
    .prepare('SELECT bookmaker, market_type, selection, line, price FROM odds_snapshots WHERE match_id = ?')
    .all(matchId);

  const byMarketAndLine = new Map();
  for (const row of rows) {
    const key = `${row.market_type}::${row.line ?? ''}`;
    if (!byMarketAndLine.has(key)) byMarketAndLine.set(key, []);
    byMarketAndLine.get(key).push(row);
  }

  let written = 0;
  const elo = eloProbsForMatch(match);

  const tx = db.transaction(() => {
    for (const [key, marketRows] of byMarketAndLine) {
      const [marketType, lineStr] = key.split('::');
      const line = lineStr === '' ? null : Number(lineStr);

      const consensus = buildConsensus(marketRows, config.analysis.minBookmakersForConsensus);
      if (!consensus) continue; // not enough independent books to trust a fair line yet

      const method = marketType === 'h2h' && elo ? 'consensus+elo' : 'consensus';
      const fairProbs = marketType === 'h2h' && elo
        ? blendProbabilities(consensus.probs, elo)
        : consensus.probs;

      for (const [selection, fairProb] of Object.entries(fairProbs)) {
        insertFairValue.run(matchId, marketType, selection, line, fairProb, method, consensus.bookCount);
        written += 1;
      }
    }
  });
  tx();

  return written;
}

module.exports = { blendProbabilities, computeAndStoreFairValues, eloProbsForMatch };

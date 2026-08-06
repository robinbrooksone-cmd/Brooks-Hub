const config = require('../config');
const { db } = require('../db');

/**
 * Compares each bookmaker's live price against the blended fair value to find two
 * distinct kinds of gap:
 *
 *  - "book_outlier": one specific bookmaker's price stands out from the rest of the
 *    market (or it's the only book quoting this selection at all). This is the
 *    stronger signal — it doesn't require trusting our own model, just that this
 *    book disagrees with its peers.
 *  - "model_divergence": every book agrees with each other, but our independent
 *    model (Elo for match markets, the try-scorer model for props) disagrees with
 *    all of them — the whole market may be leaning too far one way. This is the
 *    "gap where the market is under/over" case explicitly, but it's a bigger claim
 *    (our model vs. the market's collective wisdom) so it needs a higher edge bar
 *    and is always reported as lower/model-driven confidence.
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
  return map;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function kellyFraction(price, fairProb, cap) {
  const b = price - 1;
  if (b <= 0) return 0;
  const raw = (b * fairProb - (1 - fairProb)) / b;
  return Math.max(0, Math.min(raw, cap));
}

function usesIndependentModel(method) {
  return method.includes('elo') || method.includes('try_model');
}

function confidenceLabel(bookCount, method, opportunityType) {
  if (opportunityType === 'model_divergence') {
    return bookCount >= 3 ? 'medium (model-driven)' : 'low (model-driven)';
  }
  if (method === 'consensus+elo' && bookCount >= 4) return 'high';
  if (bookCount >= 3) return 'medium';
  return 'low';
}

const insertOpportunity = db.prepare(`
  INSERT INTO value_opportunities
    (match_id, bookmaker, market_type, selection, line, price, fair_prob, implied_prob, edge_pct, kelly_fraction, confidence, opportunity_type, reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Scans one match's latest odds against its latest fair values and persists any
 * flagged opportunities. Returns the list of opportunities found (also written to DB).
 */
function findValueForMatch(matchId, opts = {}) {
  const edgeThreshold = opts.edgeThresholdPct ?? config.analysis.edgeThresholdPct;
  const outlierThreshold = opts.outlierThresholdPct ?? config.analysis.outlierThresholdPct;
  const modelDivergenceThreshold = opts.modelDivergenceThresholdPct ?? config.analysis.modelDivergenceThresholdPct;
  const kellyCap = opts.kellyFractionCap ?? config.analysis.kellyFractionCap;

  const oddsRows = db
    .prepare('SELECT * FROM odds_snapshots WHERE match_id = ? ORDER BY captured_at DESC')
    .all(matchId);
  const fairRows = db
    .prepare('SELECT * FROM fair_values WHERE match_id = ? ORDER BY computed_at DESC')
    .all(matchId);

  if (!oddsRows.length || !fairRows.length) return [];

  const latestOdds = latestByKey(
    oddsRows,
    (r) => `${r.bookmaker}::${r.market_type}::${r.selection}::${r.line ?? ''}`,
    'captured_at'
  );
  const latestFair = latestByKey(
    fairRows,
    (r) => `${r.market_type}::${r.selection}::${r.line ?? ''}`,
    'computed_at'
  );

  // Market price per market_type::selection::line, to detect single-book outliers.
  const pricesByMarketSelection = new Map();
  for (const row of latestOdds.values()) {
    const key = `${row.market_type}::${row.selection}::${row.line ?? ''}`;
    if (!pricesByMarketSelection.has(key)) pricesByMarketSelection.set(key, []);
    pricesByMarketSelection.get(key).push(row.price);
  }

  const opportunities = [];

  const tx = db.transaction(() => {
    for (const oddsRow of latestOdds.values()) {
      const fairKey = `${oddsRow.market_type}::${oddsRow.selection}::${oddsRow.line ?? ''}`;
      const fairRow = latestFair.get(fairKey);
      if (!fairRow) continue;

      const impliedProb = 1 / oddsRow.price;
      const edgePct = (fairRow.fair_prob * oddsRow.price - 1) * 100;
      if (edgePct < edgeThreshold) continue;

      const marketPrices = pricesByMarketSelection.get(fairKey) || [oddsRow.price];
      const marketMedian = median(marketPrices);
      const deviationPct = marketMedian > 0 ? ((oddsRow.price - marketMedian) / marketMedian) * 100 : 0;
      const isSingleBook = marketPrices.length === 1;
      const isBookOutlier = isSingleBook || deviationPct >= outlierThreshold;

      let opportunityType;
      if (isBookOutlier) {
        opportunityType = 'book_outlier';
      } else if (usesIndependentModel(fairRow.method) && edgePct >= modelDivergenceThreshold) {
        opportunityType = 'model_divergence';
      } else {
        continue; // agrees with peers, and either no independent model or not enough divergence to trust it
      }

      const kelly = kellyFraction(oddsRow.price, fairRow.fair_prob, kellyCap);
      const confidence = confidenceLabel(fairRow.contributing_books, fairRow.method, opportunityType);

      let reason;
      if (opportunityType === 'model_divergence') {
        reason = `Every tracked book agrees around this price (${oddsRow.bookmaker} is only ${deviationPct.toFixed(1)}% off the ${marketPrices.length}-book median) — but the ${fairRow.method} model puts fair value ${edgePct.toFixed(1)}% below this price. This is the whole market potentially leaning the wrong way, not one book's mistake, so treat it as more speculative and check what the model is seeing before acting.`;
      } else if (isSingleBook) {
        reason = `Only one book (${oddsRow.bookmaker}) priced; ${edgePct.toFixed(1)}% above fair value per the ${fairRow.method} model — treat with lower confidence until more books are ingested.`;
      } else {
        reason = `${oddsRow.bookmaker} is ${deviationPct.toFixed(1)}% above the ${marketPrices.length}-book median price on this selection, and ${edgePct.toFixed(1)}% above fair value per the ${fairRow.method} model.`;
      }

      insertOpportunity.run(
        matchId,
        oddsRow.bookmaker,
        oddsRow.market_type,
        oddsRow.selection,
        oddsRow.line,
        oddsRow.price,
        fairRow.fair_prob,
        impliedProb,
        edgePct,
        kelly,
        confidence,
        opportunityType,
        reason
      );

      opportunities.push({
        matchId,
        bookmaker: oddsRow.bookmaker,
        marketType: oddsRow.market_type,
        selection: oddsRow.selection,
        line: oddsRow.line,
        price: oddsRow.price,
        fairProb: fairRow.fair_prob,
        impliedProb,
        edgePct,
        kellyFraction: kelly,
        confidence,
        opportunityType,
        reason,
      });
    }
  });
  tx();

  return opportunities;
}

function findValueForAllUpcomingMatches() {
  const matches = db
    .prepare("SELECT id FROM matches WHERE status = 'scheduled' AND kickoff_at >= datetime('now')")
    .all();
  const all = [];
  for (const { id } of matches) {
    all.push(...findValueForMatch(id));
  }
  return all;
}

module.exports = { findValueForMatch, findValueForAllUpcomingMatches, kellyFraction, median };

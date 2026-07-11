const { devigShin } = require('./devig');

/**
 * Builds a consensus "wisdom of the market" fair probability per selection from a set
 * of bookmaker odds on the same match/market. Each bookmaker's own book is de-vigged
 * independently first (so no single bookmaker's margin skews the average), then the
 * de-vigged probabilities are averaged across bookmakers and renormalized.
 *
 * @param {Array<{bookmaker: string, selection: string, price: number}>} oddsRows
 * @param {number} minBookmakers minimum distinct bookmakers required to trust the consensus
 * @returns {{ probs: Record<string, number>, bookCount: number } | null}
 */
function buildConsensus(oddsRows, minBookmakers = 2) {
  const byBookmaker = new Map();
  for (const row of oddsRows) {
    if (!byBookmaker.has(row.bookmaker)) byBookmaker.set(row.bookmaker, []);
    byBookmaker.get(row.bookmaker).push(row);
  }

  const selectionTotals = new Map();
  let usableBookCount = 0;

  for (const [, rows] of byBookmaker) {
    if (rows.length < 2) continue; // need at least two outcomes priced to devig
    const selections = rows.map((r) => r.selection);
    const prices = rows.map((r) => r.price);
    const fairProbs = devigShin(prices);

    usableBookCount += 1;
    selections.forEach((selection, i) => {
      selectionTotals.set(selection, (selectionTotals.get(selection) || 0) + fairProbs[i]);
    });
  }

  if (usableBookCount < minBookmakers) return null;

  const averaged = {};
  for (const [selection, total] of selectionTotals) {
    averaged[selection] = total / usableBookCount;
  }
  const sum = Object.values(averaged).reduce((a, b) => a + b, 0);
  const probs = {};
  for (const [selection, p] of Object.entries(averaged)) {
    probs[selection] = p / sum;
  }

  return { probs, bookCount: usableBookCount };
}

module.exports = { buildConsensus };

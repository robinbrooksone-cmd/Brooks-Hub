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

/**
 * Consensus for one-sided prop markets (e.g. "anytime try scorer: Yes" with no
 * published "No" price to devig against). Without a complementary outcome there's
 * no principled way to strip the bookmaker's margin, so this simply averages raw
 * implied probabilities (1/price) across books. Callers should treat the result as
 * still containing each book's margin — genuinely lower confidence than a proper
 * de-vigged consensus, and the method name returned downstream reflects that.
 *
 * @param {Array<{bookmaker: string, price: number}>} oddsRows same player/market/line only
 * @param {number} minBookmakers minimum distinct bookmakers required
 * @returns {{ avgProb: number, bookCount: number } | null}
 */
function buildSingleSidedConsensus(oddsRows, minBookmakers = 1) {
  const byBookmaker = new Map();
  for (const row of oddsRows) {
    if (!byBookmaker.has(row.bookmaker)) byBookmaker.set(row.bookmaker, row.price);
  }
  const prices = [...byBookmaker.values()];
  if (prices.length < minBookmakers) return null;

  const impliedProbs = prices.map((price) => 1 / price);
  const avgProb = impliedProbs.reduce((a, b) => a + b, 0) / impliedProbs.length;
  return { avgProb, bookCount: prices.length };
}

module.exports = { buildConsensus, buildSingleSidedConsensus };

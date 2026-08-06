/**
 * Removing the bookmaker's overround ("vig") from a set of decimal odds to recover
 * fair (no-vig) win probabilities. Two methods:
 *
 *  - multiplicative: the standard approach — normalize implied probabilities so they
 *    sum to 1. Simple, robust, works for any number of outcomes.
 *  - shin: Shin's (1992) model, which assumes the overround partly reflects informed
 *    ("insider") trading concentrated on favorites, and corrects for the resulting
 *    favorite-longshot bias. Solved numerically via bisection on the insider fraction z.
 */

function impliedProbs(decimalOdds) {
  return decimalOdds.map((price) => 1 / price);
}

function devigMultiplicative(decimalOdds) {
  const raw = impliedProbs(decimalOdds);
  const overround = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / overround);
}

function shinFairProbsForZ(rawProbs, overround, z) {
  return rawProbs.map((p) => {
    const inner = z * z + 4 * (1 - z) * (p * p) / overround;
    return (Math.sqrt(Math.max(inner, 0)) - z) / (2 * (1 - z));
  });
}

function devigShin(decimalOdds, { tolerance = 1e-8, maxIterations = 100 } = {}) {
  const rawProbs = impliedProbs(decimalOdds);
  const overround = rawProbs.reduce((a, b) => a + b, 0);

  if (overround <= 1 + 1e-9) {
    // No overround to remove (or arbitrage-priced market) — fall back to normalization.
    return devigMultiplicative(decimalOdds);
  }

  let lo = 0;
  let hi = 1 - 1e-6;
  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (lo + hi) / 2;
    const probs = shinFairProbsForZ(rawProbs, overround, mid);
    const sum = probs.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) < tolerance) {
      return probs;
    }
    // Higher z pushes the sum down for this formulation; adjust bounds accordingly.
    if (sum > 1) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return shinFairProbsForZ(rawProbs, overround, (lo + hi) / 2);
}

function overroundPct(decimalOdds) {
  const raw = impliedProbs(decimalOdds);
  return (raw.reduce((a, b) => a + b, 0) - 1) * 100;
}

module.exports = { impliedProbs, devigMultiplicative, devigShin, overroundPct };

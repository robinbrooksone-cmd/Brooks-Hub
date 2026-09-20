'use strict';

const { clampProb } = require('../lib/stats');

/**
 * Removing the bookmaker's overround.
 *
 * A price of 1.90 / 1.90 on a two-way market implies 52.6% + 52.6% = 105.3%.
 * That extra 5.3% is the margin, and it has to be stripped before the model's
 * probability can be compared to anything. HOW it is stripped changes the
 * answer materially on longshots, which is where most prop value hides.
 */

/** Raw implied probabilities (still including margin). */
function impliedProbs(odds) {
  return odds.map((o) => (o > 1 ? 1 / o : 0));
}

function overround(odds) {
  return impliedProbs(odds).reduce((s, q) => s + q, 0);
}

/**
 * Proportional / multiplicative: divide through by the booksum.
 * Simple and stable, but it assumes margin is spread evenly in proportion to
 * probability — which understates the true price of a favourite.
 */
function multiplicative(odds) {
  const q = impliedProbs(odds);
  const sum = q.reduce((s, v) => s + v, 0);
  if (sum <= 0) return q.map(() => 0);
  return q.map((v) => clampProb(v / sum));
}

/**
 * Power method: find k such that sum(q_i^k) = 1.
 *
 * Applies proportionally more of the margin removal to longshots, which is the
 * empirically observed shape of bookmaker pricing (favourite-longshot bias).
 * This is the sensible default for player props, where margins run 15-20%.
 */
function power(odds, tol = 1e-12, maxIter = 200) {
  const q = impliedProbs(odds).filter((v) => v > 0);
  if (q.length === 0) return odds.map(() => 0);

  let lo = 0.2;
  let hi = 3;
  const f = (k) => q.reduce((s, v) => s + Math.pow(v, k), 0) - 1;

  // Expand the bracket if needed, then bisect: monotone in k, so this is safe.
  let it = 0;
  while (f(lo) < 0 && lo > 1e-4 && it++ < 50) lo /= 2;
  it = 0;
  while (f(hi) > 0 && hi < 64 && it++ < 50) hi *= 2;

  let k = 1;
  for (let i = 0; i < maxIter; i++) {
    k = 0.5 * (lo + hi);
    const val = f(k);
    if (Math.abs(val) < tol) break;
    if (val > 0) lo = k;
    else hi = k;
  }

  const all = impliedProbs(odds);
  return all.map((v) => (v > 0 ? clampProb(Math.pow(v, k)) : 0));
}

/**
 * Shin (1992): models margin as the book protecting itself against a proportion
 * z of insider money. Behaves well on skewed two-way markets and is the closest
 * of the three to how a real book actually shades a lopsided line.
 */
function shin(odds, tol = 1e-12, maxIter = 200) {
  const q = impliedProbs(odds);
  const sum = q.reduce((s, v) => s + v, 0);
  if (sum <= 0) return q.map(() => 0);
  if (sum <= 1) return multiplicative(odds);

  const probsFor = (z) =>
    q.map((v) => {
      if (v <= 0) return 0;
      const inner = z * z + 4 * (1 - z) * ((v * v) / sum);
      return (Math.sqrt(Math.max(0, inner)) - z) / (2 * (1 - z));
    });

  let lo = 0;
  let hi = 0.99;
  let z = 0;
  for (let i = 0; i < maxIter; i++) {
    z = 0.5 * (lo + hi);
    const total = probsFor(z).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 1) < tol) break;
    if (total > 1) lo = z;
    else hi = z;
  }
  return probsFor(z).map(clampProb);
}

const METHODS = { multiplicative, power, shin };

/**
 * De-vig a market. `method` defaults to power for the wide-margin markets
 * (player props) and multiplicative for tight main lines, which is roughly how
 * the two behave best in practice.
 */
function devig(odds, method = 'auto') {
  const chosen =
    method === 'auto' ? (overround(odds) > 1.07 ? 'power' : 'multiplicative') : method;
  const fn = METHODS[chosen] || multiplicative;
  return { method: chosen, probs: fn(odds), overround: overround(odds) };
}

/** Fair (zero-margin) decimal odds for a probability. */
function fairOdds(p) {
  return p > 0 ? 1 / p : Infinity;
}

module.exports = {
  impliedProbs,
  overround,
  multiplicative,
  power,
  shin,
  devig,
  fairOdds,
};

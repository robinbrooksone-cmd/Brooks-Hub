'use strict';

const { devig, fairOdds, overround } = require('./devig');
const { clampProb } = require('../lib/stats');

/**
 * Turn a model probability plus a bookmaker price into an actionable rating.
 */

/** Expected profit per 1 unit staked. */
function expectedValue(modelProb, decimalOdds) {
  return modelProb * (decimalOdds - 1) - (1 - modelProb);
}

/**
 * Full Kelly fraction. Negative means the bet is -EV and should not be placed.
 *   f* = (p*o - 1) / (o - 1)
 */
function kellyFraction(modelProb, decimalOdds) {
  if (decimalOdds <= 1) return 0;
  return (modelProb * decimalOdds - 1) / (decimalOdds - 1);
}

/**
 * Confidence rating (0-100).
 *
 * Edge alone is a bad ranking key: a 6% edge on a line built from a thin player
 * sample deserves less money than a 4% edge on a team total. This blends edge
 * size, the reliability of the inputs, and a penalty for extreme probabilities
 * where model error is largest in relative terms.
 */
function confidence({ edge, dataQuality = 0.7, modelProb, marketOverround = 1.05 }) {
  const edgeScore = Math.min(1, Math.max(0, edge / 0.09));
  // Probabilities near 0 or 1 are the least reliable part of any count model.
  const central = 1 - Math.abs(modelProb - 0.5) * 1.4;
  const centralScore = Math.min(1, Math.max(0.15, central));
  // A fat market margin means the fair price is itself uncertain.
  const marginPenalty = Math.min(1, Math.max(0.35, 1 - (marketOverround - 1) * 2.5));

  const raw = 0.46 * edgeScore + 0.24 * dataQuality + 0.18 * centralScore + 0.12 * marginPenalty;
  return Math.round(clampProb(raw) * 100);
}

/**
 * Price a single selection against the book.
 *
 * `marketOdds` should be every outcome of the market (e.g. both sides of an
 * over/under) so the margin can be removed properly; `index` says which of
 * those outcomes we are betting.
 */
function priceSelection({
  modelProb,
  marketOdds,
  index = 0,
  method = 'auto',
  dataQuality = 0.7,
  kellyFractionCap = 0.25,
  bankroll = 100,
}) {
  const takenOdds = marketOdds[index];
  const { probs, method: used, overround: ovr } = devig(marketOdds, method);
  const fairProb = probs[index];

  const edge = modelProb - fairProb;
  const ev = expectedValue(modelProb, takenOdds);
  const fullKelly = kellyFraction(modelProb, takenOdds);
  const stakedKelly = Math.max(0, fullKelly) * kellyFractionCap;

  return {
    odds: takenOdds,
    modelProb,
    modelFairOdds: fairOdds(modelProb),
    marketFairProb: fairProb,
    marketFairOdds: fairOdds(fairProb),
    edge,
    edgePct: edge * 100,
    ev,
    evPct: ev * 100,
    overround: ovr,
    devigMethod: used,
    kelly: fullKelly,
    stakeFraction: stakedKelly,
    stake: Math.round(stakedKelly * bankroll * 100) / 100,
    confidence: confidence({ edge, dataQuality, modelProb, marketOverround: ovr }),
  };
}

/** Human-readable grade used for the UI badges. */
function grade(evPct) {
  if (evPct >= 12) return 'A+';
  if (evPct >= 8) return 'A';
  if (evPct >= 5) return 'B';
  if (evPct >= 2.5) return 'C';
  if (evPct > 0) return 'D';
  return 'PASS';
}

module.exports = { expectedValue, kellyFraction, confidence, priceSelection, grade, overround };

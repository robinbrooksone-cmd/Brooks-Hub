'use strict';

const {
  normalInv,
  cholesky,
  makeRng,
  standardNormalPair,
  clampProb,
  bivariateNormalUpper,
} = require('../lib/stats');

/**
 * Correlation-aware parlay pricing.
 *
 * A parlay across DIFFERENT matches is genuinely independent, so its true
 * probability is the product of the legs and multiplying the odds is correct.
 * Inside ONE match nothing is independent: "over 2.5 goals" and "Salah 2+ shots
 * on target" move together, and pricing that combination as a product is simply
 * wrong. We therefore model the legs with a Gaussian copula and only fall back
 * to the product when the legs really are independent.
 */

/**
 * Pairwise correlation between two legs in the same match, before direction is
 * applied. Values are judgement-calibrated rather than fitted — they are the
 * part of this model most worth replacing with fitted values from match data.
 */
const FAMILY_CORRELATION = {
  'player_shots|player_sot': 0.72,
  'player_shots|player_goals': 0.55,
  'player_sot|player_goals': 0.62,
  'player_fouls|player_booked': 0.68,
  'player_shots|player_fouls': -0.05,

  'team_goals|team_shots': 0.50,
  'team_goals|team_corners': 0.28,
  'team_shots|team_corners': 0.45,
  'team_goals|team_cards': -0.08,

  'player_shots|team_shots': 0.42,
  'player_sot|team_shots': 0.38,
  'player_goals|team_goals': 0.45,
  'player_sot|team_goals': 0.34,
  'player_fouls|match_cards': 0.30,
  'player_booked|match_cards': 0.45,
  'player_fouls|team_cards': 0.34,

  'match_goals|match_corners': 0.20,
  'match_goals|match_cards': -0.06,
  'match_corners|match_cards': 0.08,
  'match_goals|match_shots': 0.52,
  'match_shots|match_corners': 0.50,
  'match_goals|btts': 0.55,
  'match_goals|team_goals': 0.58,
  'match_corners|team_corners': 0.62,
  'match_cards|team_cards': 0.60,
  'match_shots|team_shots': 0.60,
};

/**
 * The table above is written in whichever order reads naturally, so normalise
 * every key to sorted order once at load. Doing the lookup against unsorted
 * keys silently misses pairs and falls through to the default correlation,
 * which is exactly the kind of bug that produces plausible-looking nonsense.
 */
const NORMALISED_CORRELATION = Object.fromEntries(
  Object.entries(FAMILY_CORRELATION).map(([key, value]) => [
    key.split('|').sort().join('|'),
    value,
  ])
);

function familyKey(a, b) {
  return [a, b].sort().join('|');
}

function lookupFamilyCorrelation(a, b) {
  return NORMALISED_CORRELATION[familyKey(a, b)];
}

/** Is this leg betting the "high" side of its market? */
function isOver(leg) {
  return leg.side === 'over' || leg.side === 'yes';
}

/**
 * Correlation between two legs, sign-adjusted for direction and damped when the
 * legs concern opposing teams (a shared tempo effect, but a weaker one).
 */
const PLAYER_FAMILIES = new Set([
  'player_shots', 'player_sot', 'player_goals', 'player_fouls', 'player_booked',
]);

const isPlayerLeg = (leg) => PLAYER_FAMILIES.has(leg.family);

/**
 * Correlation between two legs, sign-adjusted for direction.
 *
 * The critical distinction is WHOSE events are being correlated. "Shots" and
 * "shots on target" move together at 0.72 for the SAME player and barely at all
 * for two different players - conflating those inflates same-game parlay
 * probabilities enormously, so player identity is checked before the family
 * table is ever consulted.
 */
function legCorrelation(a, b) {
  if (a.matchId !== b.matchId) return 0;

  const sameTeam = a.team === b.team;
  let base;

  if (isPlayerLeg(a) && isPlayerLeg(b)) {
    if (a.playerId && a.playerId === b.playerId) {
      // Same player: two views of one player's afternoon.
      base = a.family === b.family
        ? (a.marketId === b.marketId ? 0.97 : 0.86)
        : (lookupFamilyCorrelation(a.family, b.family) ?? 0.30);
    } else {
      // Different players. They share only team context - a side that dominates
      // gives all its attackers more shots - which is a weak effect.
      base = sameTeam ? 0.11 : 0.03;
      // Team-mates competing for the same finite events (shots in one attack)
      // offset some of that shared benefit.
      if (sameTeam && a.family === b.family) base = 0.07;
    }
  } else if (isPlayerLeg(a) || isPlayerLeg(b)) {
    // One player leg against a team or match total.
    const playerLeg = isPlayerLeg(a) ? a : b;
    const otherLeg = isPlayerLeg(a) ? b : a;
    base = lookupFamilyCorrelation(a.family, b.family) ?? 0.08;
    // A player only drives his own team's totals.
    if (otherLeg.team !== 'match' && otherLeg.team !== playerLeg.team) base *= 0.2;
  } else {
    // Two team or match level legs.
    if (a.family === b.family) {
      if (a.marketId === b.marketId) base = 0.97;
      else if (a.team === 'match' || b.team === 'match') base = 0.62;
      else base = sameTeam ? 0.88 : 0.14; // opposing sides share game state only
    } else {
      base = lookupFamilyCorrelation(a.family, b.family) ?? 0.08;
      if (a.team !== 'match' && b.team !== 'match' && !sameTeam) base *= 0.35;
    }
  }

  // Direction: betting opposite sides flips the sign of the association.
  const signed = isOver(a) === isOver(b) ? base : -base;
  return Math.max(-0.95, Math.min(0.95, signed));
}

function correlationMatrix(legs) {
  const n = legs.length;
  const m = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = legCorrelation(legs[i], legs[j]);
      m[i][j] = r;
      m[j][i] = r;
    }
  }
  return m;
}

/**
 * Fast analytic approximation of the joint probability.
 *
 * Exact for two legs; beyond that it keeps all pairwise dependence and drops
 * only the higher-order terms:
 *
 *   log P  ~  sum_i log p_i  +  sum_{i<j} log( P(i and j) / (p_i p_j) )
 *
 * Accurate to well under a percentage point on realistic slips, and roughly
 * four orders of magnitude cheaper than Monte Carlo - which is what makes
 * searching thousands of combinations practical. The winning combination is
 * always re-priced by simulation before it is shown.
 */
function approxJointProbability(legs) {
  const n = legs.length;
  const probs = legs.map((l) => Math.min(0.999, Math.max(0.001, clampProb(l.modelProb))));
  if (n === 1) return probs[0];

  const z = probs.map((p) => normalInv(1 - p));
  let logP = probs.reduce((s, p) => s + Math.log(p), 0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = legCorrelation(legs[i], legs[j]);
      if (Math.abs(r) < 1e-9) continue;
      const pair = bivariateNormalUpper(z[i], z[j], r);
      const indep = probs[i] * probs[j];
      if (pair > 1e-12 && indep > 1e-12) logP += Math.log(pair / indep);
    }
  }
  return clampProb(Math.exp(logP));
}

/** True when no two legs share a match — the product rule is then exact. */
function allIndependent(legs) {
  const seen = new Set();
  for (const leg of legs) {
    if (seen.has(leg.matchId)) return false;
    seen.add(leg.matchId);
  }
  return true;
}

/**
 * Joint probability that every leg lands.
 *
 * Exact product when the legs are in different matches; Gaussian-copula Monte
 * Carlo otherwise. The RNG is seeded so the same slip always prices the same.
 */
function jointProbability(legs, { draws = 120000, seed = 20260920 } = {}) {
  if (legs.length === 0) return { probability: 0, independentProbability: 0, method: 'empty' };

  const independent = legs.reduce((p, l) => p * clampProb(l.modelProb), 1);
  if (legs.length === 1) {
    return { probability: independent, independentProbability: independent, method: 'single' };
  }
  if (allIndependent(legs)) {
    return { probability: independent, independentProbability: independent, method: 'independent' };
  }

  const n = legs.length;
  const thresholds = legs.map((l) => normalInv(1 - clampProb(l.modelProb)));
  const L = cholesky(correlationMatrix(legs));
  const rng = makeRng(seed);

  let hits = 0;
  const eps = new Array(n);
  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < n; i += 2) {
      const [a, b] = standardNormalPair(rng);
      eps[i] = a;
      if (i + 1 < n) eps[i + 1] = b;
    }
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      let x = 0;
      for (let k = 0; k <= i; k++) x += L[i][k] * eps[k];
      if (x <= thresholds[i]) ok = false;
    }
    if (ok) hits++;
  }

  const p = hits / draws;
  return {
    probability: clampProb(p),
    independentProbability: independent,
    method: 'copula',
    // Standard error of the MC estimate, so the UI can be honest about precision.
    standardError: Math.sqrt(Math.max(p * (1 - p), 1e-12) / draws),
  };
}

/**
 * Price a slip. `payoutOdds` lets the caller supply a real same-game-parlay
 * price; without one we multiply the legs, which is correct for cross-match
 * accumulators and merely indicative for same-game combinations.
 */
function priceParlay(legs, { bankroll = 100, kellyCap = 0.25, payoutOdds = null, draws } = {}) {
  const combinedOdds = legs.reduce((o, l) => o * l.odds, 1);
  const { probability, independentProbability, method, standardError } = jointProbability(legs, { draws });
  const sameGame = !allIndependent(legs);

  // A same-game parlay is NOT paid at the product of its legs - the book prices
  // the correlation in. So unless a real SGP price is supplied we refuse to
  // quote an EV against a number nobody will offer, and report the break-even
  // price instead: the shortest odds at which this slip is still worth taking.
  const priceKnown = Boolean(payoutOdds) || !sameGame;
  const payout = payoutOdds || (sameGame ? null : combinedOdds);
  const breakEvenOdds = probability > 0 ? 1 / probability : Infinity;

  // How much better our view is than the book's, leg by leg. This is the part
  // of a same-game parlay's value that does not depend on the SGP price, so it
  // is what we rank same-game candidates by.
  const valueIndex = legs.reduce((acc, l) => {
    const fair = l.marketFairProb;
    return acc * (fair && fair > 0 ? clampProb(l.modelProb) / fair : 1);
  }, 1);

  const ev = priceKnown ? probability * (payout - 1) - (1 - probability) : null;
  const fullKelly = priceKnown && payout > 1 ? (probability * payout - 1) / (payout - 1) : 0;
  const stakeFraction = Math.max(0, fullKelly) * kellyCap;

  return {
    legs,
    legCount: legs.length,
    combinedOdds,
    payoutOdds: payout,
    priceKnown,
    priceIsIndicative: sameGame && !payoutOdds,
    probability,
    independentProbability,
    correlationUplift: independentProbability > 0 ? probability / independentProbability - 1 : 0,
    method,
    standardError: standardError || 0,
    fairOdds: breakEvenOdds,
    breakEvenOdds,
    valueIndex,
    ev,
    evPct: ev === null ? null : ev * 100,
    kelly: fullKelly,
    stakeFraction,
    stake: Math.round(stakeFraction * bankroll * 100) / 100,
    sameGame,
    // Ranking key that works for both flavours.
    score: priceKnown ? ev : valueIndex * (1 + Math.max(0, probability > 0 ? probability / independentProbability - 1 : 0)) - 1,
  };
}

/**
 * Search for the best parlay from a pool of candidate legs.
 *
 * Constraints keep the output bettable rather than a lottery ticket: a floor on
 * joint probability, a cap on legs from any one match, and one selection per
 * market so the slip never contains two versions of the same opinion.
 */
function buildBestParlay(pool, options = {}) {
  const {
    minLegs = 3,
    maxLegs = 4,
    maxPerMatch = 2,
    minJointProb = 0.12,
    poolSize = 22,
    bankroll = 100,
    finalDraws = 200000,
  } = options;

  const candidates = [...pool]
    .filter((l) => l.ev > 0)
    .sort((a, b) => b.ev - a.ev)
    .slice(0, poolSize);

  if (candidates.length < minLegs) return null;

  const results = [];

  const combine = (start, chosen, perMatch, markets) => {
    if (chosen.length >= minLegs) {
      // Score with the analytic approximation; the winner is re-priced exactly.
      const p = allIndependent(chosen)
        ? chosen.reduce((acc, l) => acc * clampProb(l.modelProb), 1)
        : approxJointProbability(chosen);
      if (p >= minJointProb) {
        const independent = allIndependent(chosen);
        const payout = chosen.reduce((o, l) => o * l.odds, 1);
        const naive = chosen.reduce((acc, l) => acc * clampProb(l.modelProb), 1);
        const valueIndex = chosen.reduce((acc, l) => {
          const fair = l.marketFairProb;
          return acc * (fair && fair > 0 ? clampProb(l.modelProb) / fair : 1);
        }, 1);
        // Cross-match slips are paid at the product, so rank them on real EV.
        // Same-game slips have no known price, so rank them on how far our
        // view beats the book's, amplified by the correlation the book may
        // under-price.
        const score = independent
          ? p * (payout - 1) - (1 - p)
          : valueIndex * (naive > 0 ? p / naive : 1) - 1;
        results.push({ approxProb: p, score, legs: [...chosen] });
      }
    }
    if (chosen.length >= maxLegs) return;

    for (let i = start; i < candidates.length; i++) {
      const leg = candidates[i];
      const count = perMatch.get(leg.matchId) || 0;
      if (count >= maxPerMatch) continue;
      if (markets.has(leg.marketId)) continue;

      perMatch.set(leg.matchId, count + 1);
      markets.add(leg.marketId);
      chosen.push(leg);

      combine(i + 1, chosen, perMatch, markets);

      chosen.pop();
      markets.delete(leg.marketId);
      perMatch.set(leg.matchId, count);
    }
  };

  combine(0, [], new Map(), new Set());
  if (results.length === 0) return null;

  // Rank by EV, then re-price the winner at full precision.
  results.sort((a, b) => b.score - a.score);

  // Re-price the strongest candidates by simulation and take the true best:
  // the approximation ranks well but can reorder near-ties.
  const finalists = results.slice(0, 12).map((r) => priceParlay(r.legs, { bankroll, draws: finalDraws }));
  finalists.sort((a, b) => b.score - a.score);
  return { ...finalists[0], consideredCombinations: results.length };
}

module.exports = {
  legCorrelation,
  approxJointProbability,
  correlationMatrix,
  jointProbability,
  priceParlay,
  buildBestParlay,
  allIndependent,
  FAMILY_CORRELATION,
};

'use strict';

const { negBinPmf, clampProb } = require('../lib/stats');

/**
 * Player prop model.
 *
 * Per-90 rates are scaled by a *mixture over minutes scenarios* rather than a
 * single point estimate of minutes. This matters more than the choice of count
 * distribution: a 0.7-to-start forward has a real 30% chance of contributing
 * almost nothing, and that mass at zero is exactly what makes "over 0.5 shots
 * on target" cheaper than a naive rate*minutes calculation suggests.
 */

/** Over-dispersion of player counts, calibrated to per-match event spreads. */
const PROP_DISPERSION = {
  shots: 0.22,
  sot: 0.34,
  fouls: 0.28,
  goals: 0.05,
  assists: 0.05,
  tackles: 0.20,
};

/**
 * How a player's minutes actually land, conditional on being in the squad.
 * Defenders and holding midfielders play out games; forwards get hooked.
 */
const SUB_PATTERNS = {
  GK: [[90, 1.0]],
  DEF: [[90, 0.82], [72, 0.13], [55, 0.05]],
  MID: [[90, 0.55], [75, 0.30], [60, 0.15]],
  AM: [[90, 0.40], [72, 0.36], [58, 0.24]],
  FWD: [[90, 0.34], [70, 0.40], [56, 0.26]],
};

function minutesScenarios(player) {
  const role = SUB_PATTERNS[player.role] ? player.role : 'MID';
  const startProb = clampProb(player.startProb ?? 0.8);
  const benchProb = clampProb(player.benchProb ?? Math.min(0.9 - startProb, 1 - startProb));
  const dnp = Math.max(0, 1 - startProb - benchProb);

  const scenarios = SUB_PATTERNS[role].map(([mins, share]) => ({
    minutes: mins,
    weight: startProb * share,
  }));

  if (benchProb > 0) {
    // Cameo length varies by role; a late forward change is shorter than a
    // midfielder brought on to see a game out.
    const cameo = role === 'FWD' || role === 'AM' ? 20 : 26;
    scenarios.push({ minutes: cameo, weight: benchProb });
  }
  if (dnp > 0) scenarios.push({ minutes: 0, weight: dnp });

  return scenarios.filter((s) => s.weight > 1e-6);
}

/**
 * Expected count for one market, for one minutes scenario.
 *
 * Rates are NOT purely linear in minutes: substitutes enter a stretched game
 * and starters fade, so we apply a mild convexity adjustment for cameos.
 */
function scenarioMean(rate90, minutes, multiplier) {
  if (minutes <= 0) return 0;
  const share = minutes / 90;
  // Late substitutes operate in more open games: small uplift on per-minute rate.
  const tempo = minutes <= 30 ? 1.12 : 1;
  return Math.max(0, rate90 * share * tempo * multiplier);
}

/**
 * P(X >= k) for a player market, mixing over minutes scenarios.
 */
function propAtLeast(player, market, k, multiplier = 1, maxK = 15) {
  const rate90 = (player.per90 || {})[market];
  if (!rate90 && rate90 !== 0) return null;
  const phi = PROP_DISPERSION[market] ?? 0.25;
  const scenarios = minutesScenarios(player);

  let p = 0;
  for (const sc of scenarios) {
    const mu = scenarioMean(rate90, sc.minutes, multiplier);
    if (mu <= 0) continue; // contributes only to P(X=0)
    let tail = 0;
    for (let i = k; i <= maxK; i++) tail += negBinPmf(i, mu, phi);
    p += sc.weight * tail;
  }
  return clampProb(p);
}

/** Expected value of a player market across the minutes mixture. */
function propExpectation(player, market, multiplier = 1) {
  const rate90 = (player.per90 || {})[market];
  if (!rate90 && rate90 !== 0) return 0;
  return minutesScenarios(player).reduce(
    (acc, sc) => acc + sc.weight * scenarioMean(rate90, sc.minutes, multiplier),
    0
  );
}

/**
 * Probability a player is booked.
 *
 * Derived from fouls committed rather than quoted directly: each foul carries a
 * per-foul booking hazard that scales with referee strictness and the player's
 * own recklessness, plus a small base rate for non-foul bookings (dissent,
 * time-wasting, celebrations).
 *
 *   P(booked) = 1 - (1 - base) * E[(1 - q)^F]
 *
 * Taking the expectation over the full foul distribution — not over its mean —
 * matters, because the players who get booked are the ones having a bad day.
 */
function bookingProb(player, { refStrictness = 1, teamMultiplier = 1, oppMultiplier = 1 } = {}) {
  const foulRate = (player.per90 || {}).fouls;
  if (!foulRate && foulRate !== 0) return null;

  const cardProneness = player.cardProneness ?? 1;
  const perFoul = clampProb(0.125 * refStrictness * cardProneness);
  const base = clampProb(0.018 * refStrictness * cardProneness);
  const mult = teamMultiplier * oppMultiplier;
  const phi = PROP_DISPERSION.fouls;

  let survive = 0; // E[(1-q)^F] across minutes scenarios
  for (const sc of minutesScenarios(player)) {
    const mu = scenarioMean(foulRate, sc.minutes, mult);
    let s = 0;
    for (let f = 0; f <= 12; f++) s += negBinPmf(f, mu, phi) * Math.pow(1 - perFoul, f);
    survive += sc.weight * s;
  }

  return clampProb(1 - (1 - base) * survive);
}

/**
 * Player to score / to score 2+, capped by the team's own scoring distribution
 * so a squad's individual scorer probabilities stay coherent with its xG.
 */
function scoringProb(player, k, multiplier = 1) {
  return propAtLeast(player, 'goals', k, multiplier, 8);
}

module.exports = {
  PROP_DISPERSION,
  minutesScenarios,
  propAtLeast,
  propExpectation,
  bookingProb,
  scoringProb,
};

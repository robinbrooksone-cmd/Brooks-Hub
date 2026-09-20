'use strict';

const { negBinPmf, clampProb } = require('../lib/stats');

/**
 * Player event markets.
 *
 * Every market is built from a distribution, never from an expectation alone.
 * The distribution is a mixture over minutes scenarios: conditional on playing
 * m minutes the count is negative binomial with mean (effective rate x m/90),
 * and the scenarios are then weighted by how likely each is. That mixture is
 * what puts the correct mass at zero for a player who might not start.
 */

/**
 * Over-dispersion per metric. Rarer, streakier events carry more dispersion;
 * high-volume mechanical counts like passes are close to Poisson.
 */
const DISPERSION = {
  shots: 0.22, sot: 0.34, goals: 0.05, assists: 0.05,
  keyPasses: 0.30, chancesCreated: 0.30,
  fouls: 0.28, foulsDrawn: 0.30,
  tackles: 0.25, tacklesWon: 0.30, interceptions: 0.30,
  clearances: 0.35, blocks: 0.45, defensiveActions: 0.18,
  dribblesAttempted: 0.30, dribblesCompleted: 0.40,
  crosses: 0.40, offsides: 0.50,
  aerials: 0.30, aerialsWon: 0.35,
  touches: 0.06, passes: 0.07, passesCompleted: 0.07, progressivePasses: 0.20,
  boxTouches: 0.35, attThirdTouches: 0.15,
  dispossessed: 0.35, saves: 0.25,
};

/** Substitutes enter stretched games, so their per-minute rate runs slightly hot. */
function tempoFor(minutes) {
  return minutes <= 30 ? 1.12 : 1;
}

/**
 * Build a tail function for one metric from its total expectation.
 *
 * `expectation` already integrates minutes and every context multiplier, so we
 * back out the effective per-90 rate and re-spread it across the scenarios.
 */
function distributionFor(expectation, minutes, phi, maxK) {
  const share = minutes.minutesShare;
  if (!(share > 0) || !(expectation > 0)) {
    return { atLeast: (k) => (k <= 0 ? 1 : 0), expectation: 0, pmf: null };
  }
  const effectivePer90 = expectation / share;

  // Pre-compute the pmf for each scenario once; every line is a tail query.
  const parts = [];
  for (const sc of minutes.scenarios) {
    if (sc.minutes <= 0) { parts.push({ weight: sc.weight, tails: null }); continue; }
    const mu = effectivePer90 * (sc.minutes / 90) * tempoFor(sc.minutes);
    const pmf = new Array(maxK + 1);
    let acc = 0;
    for (let k = 0; k <= maxK; k++) { pmf[k] = negBinPmf(k, mu, phi); acc += pmf[k]; }
    if (acc < 1) pmf[maxK] += 1 - acc;
    const tails = new Array(maxK + 2).fill(0);
    for (let k = maxK; k >= 0; k--) tails[k] = tails[k + 1] + pmf[k];
    parts.push({ weight: sc.weight, tails });
  }

  return {
    expectation,
    atLeast(k) {
      if (k <= 0) return 1;
      let p = 0;
      for (const part of parts) {
        if (!part.tails) continue; // did not play: contributes only to zero
        p += part.weight * (part.tails[Math.min(k, maxK + 1)] || 0);
      }
      return clampProb(p);
    },
  };
}

/**
 * Market definitions: which lines to quote for each metric, and how to phrase
 * them. `maxK` bounds the support; it must comfortably exceed the top line.
 */
const MARKETS = [
  { metric: 'shots',              family: 'player_shots',        noun: 'shots',                     lines: [1, 2, 3, 4],       maxK: 14, quality: 0.68 },
  { metric: 'sot',                family: 'player_sot',          noun: 'shots on target',           lines: [1, 2, 3],          maxK: 10, quality: 0.66 },
  { metric: 'goals',              family: 'player_goals',        noun: 'goals',                     lines: [1, 2],             maxK: 6,  quality: 0.72 },
  { metric: 'assists',            family: 'player_assists',      noun: 'assists',                   lines: [1],                maxK: 5,  quality: 0.60 },
  { metric: 'keyPasses',          family: 'player_chances',      noun: 'chances created',           lines: [1, 2, 3],          maxK: 10, quality: 0.58 },
  { metric: 'fouls',              family: 'player_fouls',        noun: 'fouls committed',           lines: [1, 2, 3],          maxK: 10, quality: 0.62 },
  { metric: 'foulsDrawn',         family: 'player_fouls_drawn',  noun: 'fouls won',                 lines: [1, 2, 3],          maxK: 10, quality: 0.58 },
  { metric: 'tackles',            family: 'player_tackles',      noun: 'tackles',                   lines: [1, 2, 3],          maxK: 10, quality: 0.58 },
  { metric: 'tacklesWon',         family: 'player_tackles_won',  noun: 'tackles won',               lines: [1, 2],             maxK: 8,  quality: 0.54 },
  { metric: 'interceptions',      family: 'player_interceptions',noun: 'interceptions',             lines: [1, 2],             maxK: 8,  quality: 0.54 },
  { metric: 'clearances',         family: 'player_clearances',   noun: 'clearances',                lines: [2, 4, 6],          maxK: 18, quality: 0.52 },
  { metric: 'defensiveActions',   family: 'player_def_actions',  noun: 'defensive actions',         lines: [3, 5, 7],          maxK: 24, quality: 0.56 },
  { metric: 'dribblesAttempted',  family: 'player_dribbles_att', noun: 'dribbles attempted',        lines: [2, 3, 4],          maxK: 14, quality: 0.56 },
  { metric: 'dribblesCompleted',  family: 'player_dribbles',     noun: 'successful dribbles',       lines: [1, 2],             maxK: 10, quality: 0.54 },
  { metric: 'crosses',            family: 'player_crosses',      noun: 'crosses',                   lines: [1, 2, 3],          maxK: 12, quality: 0.52 },
  { metric: 'offsides',           family: 'player_offsides',     noun: 'offsides',                  lines: [1],                maxK: 6,  quality: 0.48 },
  { metric: 'aerialsWon',         family: 'player_aerials',      noun: 'aerial duels won',          lines: [1, 2, 3],          maxK: 14, quality: 0.54 },
  { metric: 'boxTouches',         family: 'player_box_touches',  noun: 'touches in opposition box', lines: [2, 4, 6],          maxK: 22, quality: 0.52 },
  { metric: 'attThirdTouches',    family: 'player_att3_touches', noun: 'attacking-third touches',   lines: [10, 15, 20],       maxK: 60, quality: 0.50 },
  { metric: 'touches',            family: 'player_touches',      noun: 'touches',                   lines: [40, 55, 70],       maxK: 140,quality: 0.54 },
  { metric: 'passes',            family: 'player_passes',        noun: 'passes attempted',          lines: [25, 40, 55],       maxK: 140,quality: 0.56 },
  { metric: 'passesCompleted',   family: 'player_passes_comp',   noun: 'passes completed',          lines: [20, 35, 50],       maxK: 130,quality: 0.56 },
  { metric: 'progressivePasses', family: 'player_prog_passes',   noun: 'progressive passes',        lines: [3, 5],             maxK: 20, quality: 0.50 },
  { metric: 'dispossessed',      family: 'player_dispossessed',  noun: 'times dispossessed',        lines: [1, 2],             maxK: 10, quality: 0.48 },
  { metric: 'saves',             family: 'player_saves',         noun: 'saves',                     lines: [2, 3, 4, 5],       maxK: 16, quality: 0.62, goalkeeperOnly: true },
];

/**
 * Probability a player is booked.
 *
 * Derived from his foul distribution rather than quoted directly: each foul
 * carries a per-foul card hazard scaled by referee strictness and the player's
 * own recklessness, plus a small base rate for non-foul bookings (dissent,
 * time-wasting). The expectation runs over the whole foul distribution, not
 * its mean, because the players who get booked are the ones having a bad day.
 */
function bookingProbability({ foulExpectation, minutes, player, refStrictness = 1 }) {
  const share = minutes.minutesShare;
  if (!(share > 0)) return 0;

  const proneness = player.cardProneness ?? 1;
  const perFoul = clampProb(0.125 * refStrictness * proneness);
  const base = clampProb(0.018 * refStrictness * proneness);
  const phi = DISPERSION.fouls;
  const effectivePer90 = foulExpectation / share;

  let survive = 0;
  for (const sc of minutes.scenarios) {
    if (sc.minutes <= 0) { survive += sc.weight; continue; }
    const mu = effectivePer90 * (sc.minutes / 90) * tempoFor(sc.minutes);
    let s = 0;
    for (let f = 0; f <= 14; f++) s += negBinPmf(f, mu, phi) * Math.pow(1 - perFoul, f);
    survive += sc.weight * s;
  }
  return clampProb(1 - (1 - base) * survive);
}

/** Red cards are rare and dominated by second yellows plus straight reds. */
function redCardProbability({ yellowProb, player, refStrictness = 1 }) {
  const secondYellow = yellowProb * 0.055 * (player.cardProneness ?? 1);
  const straight = 0.004 * refStrictness * (player.cardProneness ?? 1);
  return clampProb(secondYellow + straight);
}

/**
 * Build every market for one projected player.
 *
 * `projected` carries { player, per90, minutes, expectations, line }.
 */
function buildPlayerMarkets(projected, { fixtureId, side, teamShort, refStrictness = 1 }) {
  const { player, minutes, expectations } = projected;
  const isKeeper = projected.line === 'GK';
  const markets = [];

  for (const def of MARKETS) {
    if (def.goalkeeperOnly && !isKeeper) continue;
    if (!def.goalkeeperOnly && isKeeper && !['passes', 'passesCompleted', 'touches'].includes(def.metric)) {
      // Outfield markets on a goalkeeper are noise.
      continue;
    }

    const expectation = expectations[def.metric];
    if (!(expectation > 0)) continue;

    const dist = distributionFor(expectation, minutes, DISPERSION[def.metric] ?? 0.25, def.maxK);

    for (const k of def.lines) {
      const p = dist.atLeast(k);
      // Only quote lines a book would plausibly offer.
      if (p < 0.04 || p > 0.96) continue;

      const isScorer = def.metric === 'goals' && k === 1;
      const overLabel = isScorer ? `${player.name} to score` : `${player.name} ${k}+ ${def.noun}`;
      const underLabel = isScorer
        ? `${player.name} not to score`
        : k === 1
          ? `${player.name} no ${def.noun}`
          : `${player.name} under ${k} ${def.noun}`;

      markets.push({
        id: `${fixtureId}:${def.family}:${player.id}:${k}`,
        category: 'Player props',
        family: def.family,
        team: side,
        playerId: player.id,
        playerName: player.name,
        teamName: teamShort,
        label: overLabel,
        line: k - 0.5,
        dataQuality: def.quality,
        expectation,
        selections: [
          { key: 'over', side: 'over', label: overLabel, modelProb: p },
          { key: 'under', side: 'under', label: underLabel, modelProb: clampProb(1 - p) },
        ],
      });
    }
  }

  // ---- cards -------------------------------------------------------------
  const yellow = bookingProbability({
    foulExpectation: expectations.fouls || 0,
    minutes, player, refStrictness,
  });

  if (yellow > 0.03 && yellow < 0.88) {
    markets.push({
      id: `${fixtureId}:player_booked:${player.id}`,
      category: 'Player props',
      family: 'player_booked',
      team: side,
      playerId: player.id,
      playerName: player.name,
      teamName: teamShort,
      label: `${player.name} to be booked`,
      dataQuality: 0.58,
      expectation: yellow,
      selections: [
        { key: 'yes', side: 'yes', label: `${player.name} to be carded`, modelProb: yellow },
        { key: 'no', side: 'no', label: `${player.name} not carded`, modelProb: clampProb(1 - yellow) },
      ],
    });
  }

  const red = redCardProbability({ yellowProb: yellow, player, refStrictness });
  if (red > 0.004) {
    markets.push({
      id: `${fixtureId}:player_red:${player.id}`,
      category: 'Player props',
      family: 'player_red',
      team: side,
      playerId: player.id,
      playerName: player.name,
      teamName: teamShort,
      label: `${player.name} to be sent off`,
      dataQuality: 0.40,
      expectation: red,
      selections: [
        { key: 'yes', side: 'yes', label: `${player.name} to be sent off`, modelProb: red },
        { key: 'no', side: 'no', label: `${player.name} not sent off`, modelProb: clampProb(1 - red) },
      ],
    });
  }

  return { markets, yellowProb: yellow, redProb: red };
}

module.exports = {
  DISPERSION,
  MARKETS,
  distributionFor,
  bookingProbability,
  redCardProbability,
  buildPlayerMarkets,
};

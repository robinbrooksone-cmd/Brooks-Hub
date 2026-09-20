'use strict';

const { resolvePer90, onTargetRate, conversionRate } = require('./roles');
const { minutesModel } = require('./minutes');
const {
  possessionShare, contextMultipliers, rawExpectation, reconcileMetric,
} = require('./involvement');

/**
 * Builds the per-player projection for one team, running the full chain:
 *
 *   role archetype -> per-90 profile
 *   -> expected minutes
 *   -> matchup and game-state shading
 *   -> fixture context multipliers
 *   -> reconciliation against the team model
 *
 * Shots on target and goals are built as a CHAIN rather than as independent
 * rates, which is the structurally correct way round:
 *
 *   expected shots x P(on target)  =  expected shots on target
 *   expected SOT   x conversion    =  expected goals
 *
 * Each link is then reconciled against the team projection, so the chain stays
 * internally consistent and the squad still adds up to the team total.
 */

const ALL_METRICS = [
  'shots', 'sot', 'goals', 'assists', 'keyPasses', 'boxTouches', 'attThirdTouches',
  'dribblesAttempted', 'dribblesCompleted', 'crosses', 'offsides', 'foulsDrawn',
  'dispossessed', 'touches', 'passes', 'passesCompleted', 'progressivePasses',
  'tackles', 'tacklesWon', 'interceptions', 'clearances', 'blocks',
  'defensiveActions', 'fouls', 'aerials', 'aerialsWon', 'saves',
];

/** Which matchup multiplier applies to which metric. */
const MATCHUP_TARGET = {
  fouls: 'fouls',
  foulsDrawn: 'foulsDrawn',
  dribblesAttempted: 'dribblesAttempted',
  dribblesCompleted: 'dribbleSuccess',
  tackles: 'tackles',
  tacklesWon: 'tackles',
};

/** Which game-state factor applies to which metric. */
const STATE_TARGET = {
  shots: 'attack', sot: 'attack', goals: 'attack',
  boxTouches: 'attack', attThirdTouches: 'attack', keyPasses: 'attack',
  crosses: 'crosses', fouls: 'fouls', clearances: 'clearances',
};

/** Prepare a squad: resolve profiles and minutes before matchups are known. */
function prepareSquad(players, rolesData, context = {}) {
  return players.map((player) => {
    const resolved = resolvePer90(player, rolesData);
    return {
      player,
      per90: resolved.per90,
      role: resolved.role,
      line: resolved.line,
      zone: resolved.zone,
      flank: player.flank || resolved.zone === 'wide' ? player.flank || 'central' : 'central',
      minutes: minutesModel(player, resolved.role, context),
    };
  });
}

/**
 * Project one team's squad.
 * Returns per-player expectation tables plus reconciliation diagnostics.
 */
function projectSquad({
  squad, team, teamExpectations, opponentExpectations, opponent,
  possession, stateFactors, matchupMultipliers, league,
}) {
  const multipliers = contextMultipliers({
    team, teamExpectations, opponentExpectations, possession, baselines: league.baselines,
  });

  const minutesCovered = squad.reduce((s, p) => s + p.minutes.minutesShare, 0);

  // ---- 1. raw expectations for every metric -----------------------------
  const raw = squad.map((p) => {
    const out = {};
    const mm = matchupMultipliers[p.player.id] || {};
    for (const metric of ALL_METRICS) {
      let value = rawExpectation(p.per90, metric, p.minutes.minutesShare, multipliers);
      const matchupKey = MATCHUP_TARGET[metric];
      if (matchupKey && mm[matchupKey]) value *= mm[matchupKey];
      const stateKey = STATE_TARGET[metric];
      if (stateKey && stateFactors[stateKey]) value *= stateFactors[stateKey];
      out[metric] = value;
    }
    return out;
  });

  const diagnostics = {};
  const reconcile = (metric, teamExpected, blendWeight) => {
    const raws = raw.map((r, i) => ({ i, value: r[metric] }));
    const result = reconcileMetric({ metric, raws, teamExpected, blendWeight, minutesCovered });
    result.values.forEach((v, i) => { raw[i][metric] = v; });
    if (result.diagnostics.reconciled) diagnostics[metric] = result.diagnostics;
    return result;
  };

  // ---- 2. shots, reconciled against the team projection ------------------
  reconcile('shots', teamExpectations.shots, 0.70);

  // ---- 3. shots on target as a CHAIN from shots --------------------------
  // Opponent quality suppresses accuracy: a better defence forces worse looks,
  // and a better keeper is not part of THIS step (he affects goals, not SOT).
  const pressure = Math.min(1.12, Math.max(0.88, Math.pow(opponent.defence, -0.22)));
  squad.forEach((p, i) => {
    const accuracy = Math.min(0.62, Math.max(0.16, onTargetRate(p.per90) * pressure));
    raw[i].sot = raw[i].shots * accuracy;
    raw[i]._accuracy = accuracy;
  });
  reconcile('sot', teamExpectations.sot, 0.70);

  // ---- 4. goals as a chain from shots on target --------------------------
  squad.forEach((p, i) => {
    const conv = conversionRate(p.per90);
    raw[i].goals = raw[i].sot * conv;
    raw[i]._conversion = conv;
  });
  reconcile('goals', teamExpectations.goals, 0.80);

  // ---- 5. fouls, reconciled (drives the card chain) ----------------------
  reconcile('fouls', teamExpectations.fouls, 0.55);

  // Penalty takers get a goals bump proportional to the team's penalty rate.
  // Small, but it is the difference between a designated taker and his backup.
  const penRate = (teamExpectations.penaltyRate ?? 0.11);
  squad.forEach((p, i) => {
    const share = (p.player.setPieces && p.player.setPieces.penalties) || 0;
    if (share > 0) raw[i].goals += penRate * share * 0.79 * Math.min(1, p.minutes.minutesShare / 0.8);
  });

  return {
    players: squad.map((p, i) => ({
      ...p,
      expectations: raw[i],
      accuracy: raw[i]._accuracy,
      conversion: raw[i]._conversion,
    })),
    multipliers,
    diagnostics,
    minutesCovered,
    coverage: Math.min(1, minutesCovered / 11),
  };
}

/** Involvement shares across a projected squad, for the usage view. */
function involvementShares(projected, metrics) {
  const shares = {};
  for (const metric of metrics) {
    const total = projected.players.reduce((s, p) => s + (p.expectations[metric] || 0), 0);
    if (total <= 0) continue;
    shares[metric] = {};
    for (const p of projected.players) {
      shares[metric][p.player.id] = p.expectations[metric] / total;
    }
  }
  return shares;
}

module.exports = {
  ALL_METRICS, prepareSquad, projectSquad, involvementShares, possessionShare,
};

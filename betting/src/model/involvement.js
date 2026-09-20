'use strict';

/**
 * Involvement shares and two-way team/player reconciliation.
 *
 * The system has to work in both directions and agree with itself:
 *
 *   TOP-DOWN   team expected shots  x  player share  =  player expected shots
 *   BOTTOM-UP  sum of player fouls  ->  team fouls   ->  match cards
 *
 * Run naively these two disagree, and a board where the strikers' shot props
 * add up to more shots than the team total is quietly incoherent. So for every
 * metric the team model also projects, we compute both views, blend them, and
 * rescale the players onto the blend. The diagnostics are reported rather than
 * hidden, because a large reconciliation factor is a signal that the player
 * data or the team rating is wrong.
 */

const { clampProb } = require('../lib/stats');

/** Metrics that exist at team level too, and how much to trust each view. */
const RECONCILED = {
  // metric: weight on the TEAM (top-down) view vs the player aggregate
  shots: 0.70,
  sot: 0.70,
  goals: 0.80,
  fouls: 0.55,
  cards: 0.65,
};

/** Which context multiplier drives each metric. */
const DRIVER = {
  shots: 'attack', sot: 'attack', goals: 'attack', assists: 'attack',
  keyPasses: 'attack', boxTouches: 'attack', attThirdTouches: 'attack',
  dribblesAttempted: 'attack', dribblesCompleted: 'attack', crosses: 'attack',
  offsides: 'attack', foulsDrawn: 'attack', dispossessed: 'attack',

  touches: 'possession', passes: 'possession', passesCompleted: 'possession',
  progressivePasses: 'possession',

  tackles: 'defend', tacklesWon: 'defend', interceptions: 'defend',
  clearances: 'defend', blocks: 'defend', defensiveActions: 'defend',

  fouls: 'defend', aerials: 'aerial', aerialsWon: 'aerial', saves: 'keeper',
};

/**
 * Expected possession share. Derived from relative team strength rather than
 * stored, so it stays consistent when ratings are refreshed.
 */
function possessionShare(home, away, homeAdvantage = 1.05) {
  const strength = (t) => Math.max(0.2, t.attack) / Math.max(0.2, t.defence);
  const h = strength(home) * homeAdvantage;
  const a = strength(away);
  const ratio = h / (h + a);
  // Damped: even a dominant side rarely exceeds ~68% possession.
  return clampProb(0.5 + 0.65 * (ratio - 0.5));
}

/**
 * Fixture context multipliers for one team: how this match compares with that
 * team's own season baseline.
 */
function contextMultipliers({ team, teamExpectations, opponentExpectations, possession, baselines }) {
  const safe = (a, b) => (b > 0 ? a / b : 1);
  return {
    // Attacking output relative to the team's normal attacking output.
    attack: safe(teamExpectations.shots, team.shotsFor),
    // Ball-touching volume tracks possession, not shots.
    possession: safe(possession, 0.5),
    // Defensive actions scale with how much the OPPONENT will have the ball.
    defend: safe(opponentExpectations.shots, team.shotsAgainst),
    // Aerial duels track the crossing volume coming at you.
    aerial: safe(opponentExpectations.shots, team.shotsAgainst) * 0.5 + 0.5,
    keeper: safe(opponentExpectations.sot, team.shotsAgainst * 0.34),
  };
}

/**
 * Raw per-player expectation for a metric, before reconciliation.
 * rate/90 x minutes share x the relevant context multiplier.
 */
function rawExpectation(per90, metric, minutesShare, multipliers) {
  const driver = DRIVER[metric] || 'attack';
  const mult = multipliers[driver] ?? 1;
  return Math.max(0, (per90[metric] ?? 0) * minutesShare * mult);
}

/**
 * Reconcile a metric across a squad.
 *
 * `teamExpected` is the team model's projection for the whole XI. Our squad
 * list covers most but not all of it, so we infer coverage from the raw
 * aggregate, blend the two views, and rescale. Returns the scaled per-player
 * values plus diagnostics.
 */
function reconcileMetric({ metric, raws, teamExpected, blendWeight, minutesCovered }) {
  const playerSum = raws.reduce((s, r) => s + r.value, 0);

  // How much of a full XI our listed players represent. An eleven-a-side team
  // plays 11 x 90 minutes, so this is the fraction of that we have modelled.
  const coverage = clampProb(minutesCovered / 11);

  if (!Number.isFinite(teamExpected) || teamExpected <= 0 || playerSum <= 0 || coverage <= 0.05) {
    return {
      values: raws.map((r) => r.value),
      diagnostics: { metric, playerSum, teamExpected, coverage, factor: 1, reconciled: false },
    };
  }

  // What the players alone imply for the full team, grossing up for the
  // fringe players we have not listed.
  const bottomUpTeam = playerSum / coverage;
  const blended = blendWeight * teamExpected + (1 - blendWeight) * bottomUpTeam;

  // Rescale players so their aggregate is the blended team total x coverage,
  // leaving the remainder explicitly attributed to unlisted players.
  const target = blended * coverage;
  const factor = target / playerSum;

  return {
    values: raws.map((r) => r.value * factor),
    diagnostics: {
      metric,
      playerSum,
      teamExpected,
      bottomUpTeam,
      blendedTeam: blended,
      coverage,
      factor,
      unattributed: blended * (1 - coverage),
      reconciled: true,
    },
  };
}

/**
 * Build the full expectation table for one team's squad.
 *
 * Returns per-player expectations for every metric, involvement shares, and
 * the reconciliation diagnostics.
 */
function buildSquadProjection({ squad, teamExpectations, multipliers, metrics }) {
  const minutesCovered = squad.reduce((s, p) => s + p.minutes.minutesShare, 0);

  const byPlayer = squad.map((p) => ({ id: p.player.id, expectations: {} }));
  const diagnostics = {};

  for (const metric of metrics) {
    const raws = squad.map((p, i) => ({
      i,
      value: rawExpectation(p.per90, metric, p.minutes.minutesShare, multipliers),
    }));

    const teamExpected = teamExpectations[metric];
    const blendWeight = RECONCILED[metric];

    if (blendWeight === undefined || teamExpected === undefined) {
      // No team-level counterpart: use the raw value as-is.
      raws.forEach((r, i) => { byPlayer[i].expectations[metric] = r.value; });
      continue;
    }

    const { values, diagnostics: diag } = reconcileMetric({
      metric, raws, teamExpected, blendWeight, minutesCovered,
    });
    values.forEach((v, i) => { byPlayer[i].expectations[metric] = v; });
    diagnostics[metric] = diag;
  }

  // Involvement shares: what fraction of the team's projected output each
  // player accounts for. This is the "striker takes 26% of the shots" view.
  const shares = {};
  for (const metric of metrics) {
    const total = byPlayer.reduce((s, p) => s + (p.expectations[metric] || 0), 0);
    if (total <= 0) continue;
    shares[metric] = {};
    byPlayer.forEach((p) => {
      shares[metric][p.id] = p.expectations[metric] / total;
    });
  }

  return {
    players: byPlayer,
    shares,
    diagnostics,
    minutesCovered,
    coverage: clampProb(minutesCovered / 11),
  };
}

module.exports = {
  RECONCILED,
  DRIVER,
  possessionShare,
  contextMultipliers,
  rawExpectation,
  reconcileMetric,
  buildSquadProjection,
};

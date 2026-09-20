'use strict';

/**
 * Resolves a player's complete per-90 profile.
 *
 * Only a handful of stats are known explicitly for each player (shots, shots on
 * target, goals, assists, fouls). The other twenty-odd metrics come from their
 * functional role archetype, scaled by a quality multiplier inferred from the
 * stats we do have.
 *
 * The inference is damped: a forward who shoots 25% more than his archetype is
 * a better forward, but he does not touch the ball 25% more often. Applying the
 * raw ratio across the board would compound a single strong number into a
 * wholly fictional player.
 */

const DAMPING = 0.5;

/**
 * Metrics that must not exceed a parent metric, and the ratio ceiling to apply.
 * Resolution mixes explicit values with scaled baselines, so these invariants
 * can otherwise be violated - a player with an explicit high shot count and a
 * baseline SOT count could end up with more shots on target than shots.
 */
const CONTAINMENT = [
  ['sot', 'shots', 0.62],
  ['goals', 'sot', 0.55],
  ['dribblesCompleted', 'dribblesAttempted', 0.75],
  ['tacklesWon', 'tackles', 0.80],
  ['aerialsWon', 'aerials', 0.75],
  ['passesCompleted', 'passes', 0.97],
  ['boxTouches', 'attThirdTouches', 0.60],
  ['attThirdTouches', 'touches', 0.70],
];

/** Geometric mean, which is the right average for a set of ratios. */
function geometricMean(values) {
  if (values.length === 0) return 1;
  const logSum = values.reduce((s, v) => s + Math.log(Math.max(v, 1e-6)), 0);
  return Math.exp(logSum / values.length);
}

/**
 * Infer a per-group quality multiplier from whichever explicit stats exist.
 * Returns 1 for groups with nothing to learn from.
 */
function inferMultipliers(player, roleProfile, groups) {
  const out = {};
  for (const [group, metrics] of Object.entries(groups)) {
    const ratios = [];
    for (const metric of metrics) {
      const explicit = player.per90 ? player.per90[metric] : undefined;
      const base = roleProfile[metric];
      // Ignore near-zero baselines: dividing by them produces absurd ratios.
      if (explicit !== undefined && base > 0.05) ratios.push(explicit / base);
    }
    out[group] = ratios.length === 0 ? 1 : 1 + DAMPING * (geometricMean(ratios) - 1);
  }
  return out;
}

/**
 * Full per-90 vector for a player.
 *
 * Explicit values always win. Everything else is the role baseline scaled by
 * the group multiplier (explicit `player.multipliers` overrides the inferred one).
 */
function resolvePer90(player, rolesData) {
  const roleProfile = rolesData.roles[player.roleType];
  if (!roleProfile) throw new Error(`Unknown roleType "${player.roleType}" for ${player.id}`);

  const groups = rolesData.groups;
  const inferred = inferMultipliers(player, roleProfile, groups);

  const out = {};
  for (const [group, metrics] of Object.entries(groups)) {
    const mult = (player.multipliers && player.multipliers[group] !== undefined)
      ? player.multipliers[group]
      : inferred[group];
    for (const metric of metrics) {
      const explicit = player.per90 ? player.per90[metric] : undefined;
      out[metric] = explicit !== undefined ? explicit : Math.max(0, roleProfile[metric] * mult);
    }
  }

  out.saves = (player.per90 && player.per90.saves !== undefined)
    ? player.per90.saves
    : roleProfile.saves;

  // Derived aggregate: everything a defender does to break up play.
  out.defensiveActions = out.tackles + out.interceptions + out.clearances + out.blocks;

  applyContainment(out);

  return {
    per90: out,
    role: roleProfile,
    multipliers: inferred,
    zone: roleProfile.zone,
    line: roleProfile.line,
  };
}

function applyContainment(vec) {
  for (const [child, parent, ceiling] of CONTAINMENT) {
    const cap = vec[parent] * ceiling;
    if (vec[child] > cap) vec[child] = cap;
  }
  // Recompute after any clamping above touched a component.
  vec.defensiveActions = vec.tackles + vec.interceptions + vec.clearances + vec.blocks;
}

/** Shot accuracy implied by the resolved profile, used by the SOT model. */
function onTargetRate(per90) {
  if (!per90.shots) return 0.33;
  return Math.min(0.65, Math.max(0.15, per90.sot / per90.shots));
}

/** Conversion rate of shots on target into goals. */
function conversionRate(per90) {
  if (!per90.sot) return 0.30;
  return Math.min(0.60, Math.max(0.08, per90.goals / per90.sot));
}

module.exports = { resolvePer90, onTargetRate, conversionRate, DAMPING, CONTAINMENT };

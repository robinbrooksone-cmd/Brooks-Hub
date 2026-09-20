'use strict';

const { clampProb } = require('../lib/stats');

/**
 * Expected minutes model.
 *
 * This is the single highest-leverage input in the player layer. Every per-90
 * rate has to be scaled by playing time, and treating minutes as a point
 * estimate throws away the thing that matters most: a 0.7-to-start forward has
 * a real chance of contributing nothing at all, and that mass at zero is what
 * makes low player lines cheaper than rate x minutes suggests.
 *
 * The model returns a full scenario mixture, not just an expectation, so
 * downstream markets integrate over playing time properly.
 */

/**
 * Probability a starter lasts the full 90, and the substitution profile if not,
 * by role line. Centre-backs finish games; forwards get hooked.
 */
const START_PROFILE = {
  GK:   { full: 0.985, subs: [[80, 0.010], [60, 0.005]] },
  DEF:  { full: 0.840, subs: [[80, 0.070], [70, 0.055], [58, 0.035]] },
  MID:  { full: 0.560, subs: [[80, 0.170], [70, 0.160], [58, 0.110]] },
  WIDE: { full: 0.360, subs: [[78, 0.230], [68, 0.230], [57, 0.180]] },
  FWD:  { full: 0.330, subs: [[78, 0.230], [68, 0.240], [56, 0.200]] },
};

/** Finer adjustment within a line: a holding midfielder outlasts a No.10. */
const ROLE_STAMINA = {
  'holding-mid': 1.22,
  'deep-playmaker': 1.12,
  'box-to-box': 1.00,
  'attacking-mid': 0.80,
  'defensive-fullback': 1.10,
  'inverted-fullback': 1.05,
  'attacking-fullback': 0.98,
  'wingback': 0.92,
  'aggressive-stopper': 1.05,
  'cover-defender': 1.05,
  'ball-playing-defender': 1.05,
  'target-forward': 0.95,
  'poacher': 0.98,
  'false-9': 0.92,
  'pressing-forward': 0.82,
  'traditional-winger': 0.88,
  'inverted-winger': 0.92,
  'inside-forward': 1.02,
  'wide-playmaker': 0.98,
  'goalkeeper': 1.00,
};

/** Minutes a substitute actually gets, by how attacking the role is. */
const CAMEO = {
  FWD:  [[32, 0.22], [24, 0.34], [16, 0.30], [8, 0.14]],
  WIDE: [[32, 0.24], [24, 0.34], [16, 0.28], [8, 0.14]],
  MID:  [[35, 0.26], [26, 0.34], [17, 0.26], [9, 0.14]],
  DEF:  [[30, 0.22], [22, 0.30], [14, 0.28], [7, 0.20]],
  GK:   [[20, 0.10], [10, 0.90]],
};

/**
 * Full minutes distribution for a player.
 *
 * `context` allows fixture-specific shading:
 *   - daysRest: short turnarounds pull starters off earlier
 *   - blowoutProb: a game likely to be decided early frees the manager to rotate
 */
function minutesModel(player, roleProfile, context = {}) {
  const line = roleProfile.line || 'MID';
  const profile = START_PROFILE[line] || START_PROFILE.MID;
  const stamina = ROLE_STAMINA[player.roleType] ?? 1;

  const pStart = clampProb(player.startProb ?? 0.8);
  const pBench = clampProb(player.benchProb ?? Math.max(0, Math.min(0.9 - pStart, 1 - pStart)));
  const pDNP = Math.max(0, 1 - pStart - pBench);

  // Fatigue: under four days' rest raises the chance of an early change.
  const daysRest = context.daysRest ?? player.daysRest ?? 6;
  const fatigue = daysRest >= 5 ? 1 : 1 + (5 - daysRest) * 0.10;

  // A match likely to be settled early means more rotation off the pitch.
  const blowout = 1 + (context.blowoutProb ?? 0) * 0.35;

  // Convert the "full 90" probability using stamina, fatigue and game state.
  // Odds-space scaling keeps the result a probability without clipping.
  const fullOdds = (profile.full / (1 - profile.full)) * stamina / (fatigue * blowout);
  const pFullGivenStart = clampProb(fullOdds / (1 + fullOdds));

  const subWeightTotal = profile.subs.reduce((s, [, w]) => s + w, 0);
  const scenarios = [{ minutes: 90, weight: pStart * pFullGivenStart, kind: 'start' }];

  for (const [mins, w] of profile.subs) {
    // Redistribute the non-full mass across the substitution profile, shifting
    // earlier when the player is tired or the game is gone.
    const shifted = Math.max(35, Math.min(89, mins - (fatigue - 1) * 40 - (blowout - 1) * 30));
    scenarios.push({
      minutes: Math.round(shifted),
      weight: pStart * (1 - pFullGivenStart) * (w / subWeightTotal),
      kind: 'start',
    });
  }

  const cameo = CAMEO[line] || CAMEO.MID;
  const cameoTotal = cameo.reduce((s, [, w]) => s + w, 0);
  for (const [mins, w] of cameo) {
    scenarios.push({ minutes: mins, weight: pBench * (w / cameoTotal), kind: 'bench' });
  }

  if (pDNP > 0) scenarios.push({ minutes: 0, weight: pDNP, kind: 'unused' });

  const live = scenarios.filter((s) => s.weight > 1e-6);
  const expectedMinutes = live.reduce((s, x) => s + x.weight * x.minutes, 0);
  const atLeast = (m) => clampProb(live.reduce((s, x) => s + (x.minutes >= m ? x.weight : 0), 0));

  // Expected substitution minute, conditional on actually being withdrawn.
  const subbed = live.filter((x) => x.kind === 'start' && x.minutes < 90);
  const subMass = subbed.reduce((s, x) => s + x.weight, 0);
  const expectedSubMinute = subMass > 0
    ? subbed.reduce((s, x) => s + x.weight * x.minutes, 0) / subMass
    : null;

  return {
    scenarios: live,
    pStart,
    pBench,
    pDNP,
    pAppear: clampProb(pStart + pBench),
    pFullGivenStart,
    pPlay60Plus: atLeast(60),
    pPlay75Plus: atLeast(75),
    pPlay90: atLeast(90),
    expectedMinutes,
    expectedSubMinute,
    // Share of a full match, the scalar most per-90 rates get multiplied by.
    minutesShare: expectedMinutes / 90,
  };
}

module.exports = { minutesModel, START_PROFILE, ROLE_STAMINA, CAMEO };

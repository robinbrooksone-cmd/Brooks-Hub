'use strict';

const { clampProb } = require('../lib/stats');

/**
 * Direct player-versus-player matchups, and match game state.
 *
 * The chain this exists to model:
 *
 *   low possession -> more time defending -> right-back faces a high-volume
 *   winger -> more defensive duels -> more fouls -> higher card probability
 *   -> more team cards -> more match cards
 *
 * A right-back's foul rate is not a property of the right-back alone. Facing
 * a 4.5-dribble winger is a materially different afternoon from facing a
 * wide playmaker who keeps the ball moving, and that difference is worth more
 * than a decimal place on his season average.
 */

/** League reference points used to normalise matchup pressure. */
const LEAGUE = {
  // Dribble volume faced depends heavily on WHERE a defender plays: a full-back
  // is the one taken on, a centre-back mostly faces a striker's back. Using a
  // single league-wide reference made every centre-back look unusually calm and
  // every full-back unusually harassed.
  dribblesFaced: { wide: 2.80, central: 1.00 },
  foulsPerDefender: 1.35,
  tacklesPerDefender: 2.1,
};

/** Sensitivities. Deliberately modest: matchups shade rates, they do not rewrite them. */
const BETA = {
  defenderFoulsFromDribbles: 0.34,
  defenderFoulsFromPace: 0.22,
  attackerFoulsDrawnFromDefender: 0.30,
  attackerDribbleSuccessFromDefender: 0.22,
  attackerDribbleVolumeFromDefender: 0.14,
};

const OPPOSITE = { left: 'right', right: 'left', central: 'central' };

const ATTACKING_LINES = new Set(['FWD', 'WIDE']);
const DEFENDING_LINES = new Set(['DEF']);

/**
 * Pair attackers with the defenders they will actually face.
 *
 * A left-sided attacker meets the opposing right-back; a central forward is
 * shared across the centre-backs. Weights are scaled by expected minutes, so
 * a defender who plays 60 minutes absorbs proportionally less of the duel.
 */
function pairings(attackers, defenders) {
  const out = [];
  for (const att of attackers) {
    const wantZone = att.zone === 'wide' ? OPPOSITE[att.flank] : 'central';

    // Prefer defenders on the mirrored flank; fall back to central cover.
    let pool = defenders.filter((d) => d.flank === wantZone);
    if (pool.length === 0) pool = defenders.filter((d) => d.zone === 'central');
    if (pool.length === 0) pool = defenders;
    if (pool.length === 0) continue;

    const totalMinutes = pool.reduce((s, d) => s + d.minutes.minutesShare, 0) || 1;
    for (const def of pool) {
      out.push({
        attacker: att,
        defender: def,
        // Share of this attacker's duels that this defender absorbs.
        weight: def.minutes.minutesShare / totalMinutes,
      });
    }
  }
  return out;
}

/**
 * Compute per-player matchup multipliers for both teams.
 *
 * Returns { [playerId]: { fouls, foulsDrawn, dribblesAttempted,
 *                         dribbleSuccess, tackles } }
 */
function buildMatchups(homeSquad, awaySquad) {
  const multipliers = {};
  const detail = [];

  const ensure = (id) => {
    if (!multipliers[id]) {
      multipliers[id] = {
        fouls: 1, foulsDrawn: 1, dribblesAttempted: 1, dribbleSuccess: 1, tackles: 1,
      };
    }
    return multipliers[id];
  };

  const sides = [[homeSquad, awaySquad], [awaySquad, homeSquad]];

  for (const [attackSide, defendSide] of sides) {
    const attackers = attackSide.filter((p) => ATTACKING_LINES.has(p.line));
    const defenders = defendSide.filter((p) => DEFENDING_LINES.has(p.line));
    if (attackers.length === 0 || defenders.length === 0) continue;

    const duels = pairings(attackers, defenders);

    // ---- pass 1: how much dribbling each defender faces -------------------
    // Gathered here rather than by re-pairing later: re-running the pairing for
    // a single defender would match him against every attacker, including ones
    // on the far flank he will never meet.
    const pressure = new Map();
    const paceWeight = new Map();

    for (const { attacker, defender, weight } of duels) {
      const dribbleVolume = attacker.per90.dribblesAttempted * attacker.minutes.minutesShare;
      const id = defender.player.id;
      pressure.set(id, (pressure.get(id) || 0) + dribbleVolume * weight);

      // Weight pace by duel volume: being quick matters in proportion to how
      // often the duel actually happens.
      const pw = paceWeight.get(id) || { sum: 0, weight: 0 };
      pw.sum += (attacker.player.pace ?? 78) * weight * Math.max(dribbleVolume, 0.2);
      pw.weight += weight * Math.max(dribbleVolume, 0.2);
      paceWeight.set(id, pw);
    }

    // ---- pass 2: defender adjustments ------------------------------------
    // Resolved before the attacker side, because a foul in a duel is a single
    // event seen from two ends: if this matchup makes the defender foul more,
    // the attacker he is marking must draw correspondingly more. Using the
    // defender's raw season rate for the attacker's side would break that.
    const adjustedDefenderFouls = new Map();

    for (const defender of defenders) {
      const faced = pressure.get(defender.player.id) || 0;
      const def = ensure(defender.player.id);
      if (faced <= 0) {
        adjustedDefenderFouls.set(defender.player.id, defender.per90.fouls);
        continue;
      }

      // Compare against the reference for THIS defender's position.
      const reference = LEAGUE.dribblesFaced[defender.zone === 'wide' ? 'wide' : 'central'];
      const relative = faced / reference - 1;

      def.fouls *= 1 + BETA.defenderFoulsFromDribbles * relative;
      def.tackles *= 1 + 0.30 * relative;

      // Being outpaced is what turns a duel into a foul.
      const pw = paceWeight.get(defender.player.id);
      if (pw && pw.weight > 0) {
        const gap = pw.sum / pw.weight - (defender.player.pace ?? 76);
        def.fouls *= 1 + BETA.defenderFoulsFromPace * (gap / 20);
      }

      def.fouls = Math.min(1.6, Math.max(0.6, def.fouls));
      adjustedDefenderFouls.set(defender.player.id, defender.per90.fouls * def.fouls);
    }

    // ---- pass 3: attacker adjustments ------------------------------------
    for (const { attacker, defender, weight } of duels) {
      const att = ensure(attacker.player.id);
      const defFoulRate = adjustedDefenderFouls.get(defender.player.id) ?? defender.per90.fouls;

      att.foulsDrawn *= 1 + BETA.attackerFoulsDrawnFromDefender * weight * (defFoulRate / LEAGUE.foulsPerDefender - 1);

      // A strong tackler suppresses dribble success; a slow one gets run at more.
      att.dribbleSuccess *= 1 - BETA.attackerDribbleSuccessFromDefender * weight * (defender.per90.tacklesWon / LEAGUE.tacklesPerDefender - 1);

      const paceGap = (attacker.player.pace ?? 78) - (defender.player.pace ?? 76);
      att.dribblesAttempted *= 1 + BETA.attackerDribbleVolumeFromDefender * weight * (paceGap / 20);

      detail.push({
        attacker: attacker.player.name,
        defender: defender.player.name,
        weight: Math.round(weight * 100) / 100,
        dribbleVolume: Math.round(attacker.per90.dribblesAttempted * attacker.minutes.minutesShare * 100) / 100,
        defenderFoulRate: Math.round(defFoulRate * 100) / 100,
        paceGap,
      });
    }
  }

  // Keep multipliers inside sane bounds - this layer shades, it does not dominate.
  for (const m of Object.values(multipliers)) {
    for (const key of Object.keys(m)) {
      m[key] = Math.min(1.6, Math.max(0.6, m[key]));
    }
  }

  return { multipliers, detail };
}

/**
 * Game state derived from the score matrix.
 *
 * A side expected to chase shoots more and crosses more; a side expected to
 * protect a lead fouls more and clears more. `blowoutProb` feeds the minutes
 * model, because a settled game means earlier substitutions.
 */
function gameState(grid) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let blowout = 0;

  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a];
      if (p <= 0) continue;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (Math.abs(h - a) >= 3) blowout += p;
    }
  }

  // Chase index: how much of the match a side expects to spend needing a goal.
  const homeChase = clampProb(awayWin + 0.5 * draw);
  const awayChase = clampProb(homeWin + 0.5 * draw);

  const factors = (chase) => ({
    // Chasing sides shoot and cross more.
    attack: 1 + 0.18 * (chase - 0.5) * 2,
    crosses: 1 + 0.30 * (chase - 0.5) * 2,
    // Leading sides foul more (game management) and clear more.
    fouls: 1 - 0.12 * (chase - 0.5) * 2,
    clearances: 1 - 0.25 * (chase - 0.5) * 2,
  });

  return {
    homeWin, draw, awayWin, blowoutProb: blowout,
    home: { chaseIndex: homeChase, ...factors(homeChase) },
    away: { chaseIndex: awayChase, ...factors(awayChase) },
  };
}

module.exports = { buildMatchups, gameState, pairings, LEAGUE, BETA };

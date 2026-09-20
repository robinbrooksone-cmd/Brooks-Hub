#!/usr/bin/env node
'use strict';

/**
 * Rebuild squads and team ratings from the FotMob data in
 * data/fotmob-lineups.json.
 *
 * Two separate jobs:
 *
 *  1. SQUADS. The starting XI is authoritative for who plays and how likely
 *     they are to. Per-90 rates do NOT come from this payload, so each player
 *     falls back to his role archetype - which is what the role layer is for.
 *     The result is real players with archetype rates, rather than archetype
 *     players with real rates, and that is the right way round: being wrong
 *     about Casemiro's shot rate is survivable, pricing a player who is not
 *     at the club is not.
 *
 *  2. TEAM RATINGS. Four matches is a small sample, so observed form is blended
 *     with the existing prior rather than replacing it. Shrinkage is set so a
 *     four-game run moves a rating meaningfully but cannot invent a title
 *     challenger out of two good weekends.
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const LINEUPS = JSON.parse(fs.readFileSync(path.join(DATA, 'fotmob-lineups.json'), 'utf8'));
const PLAYERS_FILE = path.join(DATA, 'players.json');
const TEAMS_FILE = path.join(DATA, 'teams.json');
const roles = JSON.parse(fs.readFileSync(path.join(DATA, 'roles.json'), 'utf8')).roles;

const POSITION_TO_ROLE = {
  GK: 'goalkeeper',
  CB: 'cover-defender',
  LB: 'defensive-fullback', RB: 'defensive-fullback',
  LWB: 'wingback', RWB: 'wingback',
  DM: 'holding-mid', CM: 'box-to-box', AM: 'attacking-mid',
  LM: 'wide-playmaker', RM: 'wide-playmaker',
  LW: 'inverted-winger', RW: 'inverted-winger',
  ST: 'pressing-forward',
};

const FLANK = {
  LB: 'left', LWB: 'left', LM: 'left', LW: 'left',
  RB: 'right', RWB: 'right', RM: 'right', RW: 'right',
};

const slug = (s) => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Match a full name against an existing record.
 *
 * FotMob gives "Erling Haaland"; the prior file held "haaland". Matching on
 * slug equality alone therefore misses, and a miss here is not harmless: the
 * starter is added under a new id while the prior survives as bench cover, so
 * the same footballer appears twice and is counted twice in the team
 * reconciliation. Worse, an injured player whose id does not match the
 * ruled-out list stays in the squad and gets priced.
 */
function normaliseName(name) {
  const parts = slug(name).split('-').filter(Boolean);
  return { full: parts.join('-'), parts, surname: parts[parts.length - 1] || '' };
}

/**
 * Do these two names plausibly denote the same player?
 *
 * Surname agreement alone is far too loose: it matched Leeds' "Daniel James"
 * to "James Justin", because one man's forename is another's surname. So the
 * surnames must agree AND either one of the names is a bare surname (the prior
 * file holds "haaland" for "Erling Haaland") or the forename initials agree.
 */
function sameName(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (x.full && x.full === y.full) return true;
  if (!x.surname || x.surname !== y.surname) return false;
  if (x.parts.length === 1 || y.parts.length === 1) return true;
  return x.parts[0][0] === y.parts[0][0];
}

/**
 * A named starter in a predicted XI is very likely to start, but "predicted"
 * is not "confirmed", so this stops short of certainty. Everyone else at the
 * club who is not ruled out becomes bench cover.
 */
const STARTER = { startProb: 0.88, benchProb: 0.06 };
const BENCH = { startProb: 0.14, benchProb: 0.46 };

function buildSquads() {
  const existing = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
  const byId = new Map(existing.players.map((p) => [p.id, p]));
  const stamp = today();

  const players = [];
  const report = [];

  for (const [fixtureId, fixture] of Object.entries(LINEUPS.fixtures)) {
    for (const side of ['home', 'away']) {
      const { team, xi, out = [] } = fixture[side];
      const outNames = out.map((o) => o.replace(/\s*\(.*$/, '').trim());
      const priorsForTeam = existing.players.filter((p) => p.team === team);

      const findPrior = (name) =>
        priorsForTeam.find((p) => sameName(p.name, name))
        || priorsForTeam.find((p) => sameName(p.id.replace(/-/g, ' '), name));

      const built = [];
      const usedPriorIds = new Set();

      for (const [name, position] of xi) {
        const prior = findPrior(name);
        if (prior) usedPriorIds.add(prior.id);

        const roleType = POSITION_TO_ROLE[position] || 'box-to-box';
        if (!roles[roleType]) throw new Error(`Unknown archetype ${roleType} for ${name}`);

        built.push({
          // Keep the prior's id when we recognise him, so he cannot be added
          // twice and anything referencing him still resolves.
          id: prior ? prior.id : slug(name),
          name,
          team,
          position,
          roleType,
          flank: FLANK[position] || 'central',
          ...STARTER,
          cardProneness: prior ? prior.cardProneness : 1,
          pace: prior && prior.pace ? prior.pace : undefined,
          setPieces: prior ? prior.setPieces : { penalties: 0, freeKicks: 0, corners: 0 },
          per90: prior && prior.per90 ? prior.per90 : undefined,
          ratesFrom: prior && prior.per90 ? 'prior' : 'role-archetype',
          lineup: 'predicted-xi',
          verifiedAt: stamp,
          source: 'fotmob',
        });
      }

      // Anyone previously at this club, not in the XI and not ruled out, is
      // plausible bench cover. Ruled-out players are dropped entirely.
      let benched = 0;
      const dropped = [];
      for (const prior of priorsForTeam) {
        if (usedPriorIds.has(prior.id)) continue;
        if (outNames.some((n) => sameName(prior.name, n))) { dropped.push(prior.name); continue; }
        built.push({
          ...prior, ...BENCH,
          lineup: 'bench-cover',
          verifiedAt: stamp,
          source: 'fotmob+prior',
          ratesFrom: prior.per90 ? 'prior' : 'role-archetype',
        });
        benched++;
      }

      // Nothing downstream tolerates the same player twice.
      const seen = new Set();
      for (const p of built) {
        if (seen.has(p.id)) throw new Error(`Duplicate player id ${p.id} in ${team}`);
        seen.add(p.id);
      }

      players.push(...built);
      report.push({
        fixtureId, side, team,
        starters: xi.length, bench: benched, dropped,
        unmatchedOut: outNames.filter((n) => !dropped.some((d) => sameName(d, n))),
      });
    }
  }

  const file = {
    ...existing,
    _squadVerification: {
      verifiedAt: stamp,
      source: 'FotMob predicted XIs and availability lists',
      note:
        'Players and availability come from FotMob. Per-90 RATES do not: FotMob\'s per-player stat tables did ' +
        'not come through the retrieval path, so rates are role-archetype baselines except where a prior value ' +
        'was already held (ratesFrom records which). Re-import with real per-90 data to improve the rates; the ' +
        'roster itself is sound.',
      lineupsAre: 'predicted, not confirmed - re-import about an hour before kick-off',
    },
    players,
  };
  delete file._knownGaps;

  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(file, null, 2) + '\n');

  const ids = players.map((p) => p.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) throw new Error(`Duplicate ids across teams: ${dupes.join(', ')}`);

  console.log('Squads rebuilt from FotMob:');
  for (const r of report) {
    console.log(`  ${r.team.padEnd(16)} ${String(r.starters).padStart(2)} starters + ${String(r.bench).padStart(2)} bench cover` +
      (r.dropped.length ? `, dropped ${r.dropped.join(', ')}` : ''));
    // A ruled-out name we could not match is a silent hole: say so.
    if (r.unmatchedOut.length) {
      console.log(`    (ruled out but not in the squad file anyway: ${r.unmatchedOut.join(', ')})`);
    }
  }
  console.log(`  total ${players.length} players, verified ${stamp}`);

  const archetypeOnly = players.filter((p) => p.ratesFrom === 'role-archetype').length;
  console.log(`  ${archetypeOnly}/${players.length} using role-archetype rates (no per-90 held for them)`);
  return players;
}

/**
 * Re-rate teams from observed form.
 *
 * Points per game maps to a strength index, which nudges attack and defence.
 * The weight is deliberately modest: four matches is roughly a fifth of the
 * information needed to move a rating with confidence, and a side that has
 * drawn three times is not thereby a bad side.
 */
function rateTeams() {
  const file = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
  const played = LINEUPS.seasonMatchesPlayed || 4;

  // Shrinkage: observed form gets weight n/(n+k). k=9 means four games carry
  // about 31% - enough to matter, not enough to overwrite a season's prior.
  const K = 9;
  const formWeight = played / (played + K);

  const changes = [];
  for (const [teamId, row] of Object.entries(LINEUPS.table)) {
    const team = file.teams.find((t) => t.id === teamId);
    if (!team) { console.log(`  (no rating row for ${teamId})`); continue; }

    const ppg = row.points / played;
    // 1.35 ppg is roughly mid-table. Map deviation onto a multiplicative factor.
    const strength = ppg / 1.35;
    // Split the signal: a strong side is both better at scoring and at stopping.
    const attackTarget = team.attack * Math.pow(strength, 0.45);
    const defenceTarget = team.defence * Math.pow(strength, -0.35);

    const before = { attack: team.attack, defence: team.defence };
    team.attack = Math.round((team.attack * (1 - formWeight) + attackTarget * formWeight) * 1000) / 1000;
    team.defence = Math.round((team.defence * (1 - formWeight) + defenceTarget * formWeight) * 1000) / 1000;

    changes.push({ teamId, position: row.position, ppg, before, after: { attack: team.attack, defence: team.defence } });
  }

  // Fulham have not scored in ten league games; that is a stronger statement
  // about their attack than four games of points can carry on its own.
  const fulham = file.teams.find((t) => t.id === 'fulham');
  if (fulham && LINEUPS.table.fulham && /failed to score/.test(LINEUPS.table.fulham.note || '')) {
    const before = fulham.attack;
    fulham.attack = Math.round(fulham.attack * 0.86 * 1000) / 1000;
    console.log(`  fulham attack cut a further ${before} -> ${fulham.attack} (ten league games without scoring)`);
  }

  file._ratingUpdate = {
    at: today(),
    source: 'FotMob league table after ' + played + ' matches',
    formWeight: Math.round(formWeight * 1000) / 1000,
    note: `Observed form blended with the prior at ${(formWeight * 100).toFixed(0)}% weight (shrinkage k=${K}). Four matches cannot carry a rating on its own.`,
  };

  fs.writeFileSync(TEAMS_FILE, JSON.stringify(file, null, 2) + '\n');

  console.log(`\nTeam ratings re-based on form (weight ${(formWeight * 100).toFixed(0)}%):`);
  changes.sort((a, b) => a.position - b.position);
  for (const c of changes) {
    console.log(`  ${String(c.position).padStart(2)}. ${c.teamId.padEnd(16)} ${c.ppg.toFixed(2)} ppg  ` +
      `attack ${c.before.attack.toFixed(2)} -> ${c.after.attack.toFixed(2)}   ` +
      `defence ${c.before.defence.toFixed(2)} -> ${c.after.defence.toFixed(2)}`);
  }
}

buildSquads();
rateTeams();

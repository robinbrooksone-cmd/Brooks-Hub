#!/usr/bin/env node
'use strict';

/**
 * Import a confirmed squad and lift the player-market gate.
 *
 * Usage:
 *   node betting/scripts/import-squad.js <team-id> <roster-file>
 *   node betting/scripts/import-squad.js --verify            (mark all as confirmed)
 *   node betting/scripts/import-squad.js --status            (what is gated and why)
 *
 * Roster file format - one player per line, fields separated by | :
 *
 *   id | Name | roleType | flank | startProb | benchProb | shots,sot,goals,assists,fouls
 *   barcola | Bradley Barcola | inside-forward | left | 0.85 | 0.10 | 2.9,1.05,0.42,0.22,0.9
 *
 * Only the first three fields are required; the rest fall back to role defaults.
 * Anyone on the sheet who is not in the file is removed, so the roster is
 * authoritative - which is the point of verifying it.
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'players.json');
const { assessSquad } = require('../src/model/squadStatus');

const PER90_KEYS = ['shots', 'sot', 'goals', 'assists', 'fouls'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseRoster(text, teamId) {
  const players = [];
  const errors = [];

  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const parts = trimmed.split('|').map((x) => x.trim());
    if (parts.length < 3) {
      errors.push({ line: i + 1, text: trimmed, reason: 'need at least: id | Name | roleType' });
      return;
    }

    const [id, name, roleType, flank, startProb, benchProb, per90] = parts;
    const player = {
      id,
      name,
      team: teamId,
      roleType,
      flank: flank || 'central',
      startProb: startProb ? Number(startProb) : 0.7,
      benchProb: benchProb ? Number(benchProb) : 0.2,
      cardProneness: 1,
      pace: 78,
      setPieces: { penalties: 0, freeKicks: 0, corners: 0 },
      verifiedAt: today(),
    };

    if (per90) {
      const nums = per90.split(',').map((x) => Number(x.trim()));
      player.per90 = {};
      PER90_KEYS.forEach((k, idx) => {
        if (Number.isFinite(nums[idx])) player.per90[k] = nums[idx];
      });
    }

    if (!Number.isFinite(player.startProb) || player.startProb < 0 || player.startProb > 1) {
      errors.push({ line: i + 1, text: trimmed, reason: `unusable startProb "${startProb}"` });
      return;
    }
    players.push(player);
  });

  return { players, errors };
}

function main() {
  const [arg1, arg2] = process.argv.slice(2);
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const roles = JSON.parse(fs.readFileSync(path.join(DATA, 'roles.json'), 'utf8')).roles;

  if (arg1 === '--status' || !arg1) {
    const status = assessSquad(data, today());
    console.log(`Squad verified: ${status.verified}`);
    if (status.reason) console.log(`Reason: ${status.reason}`);
    console.log(`Players: ${status.playerCount} | unverified: ${status.unverifiedCount}`);
    console.log(`Last window close: ${status.lastWindowClose}`);
    if (data._knownGaps) {
      console.log('\nKnown arrivals with no data:');
      for (const [team, list] of Object.entries(data._knownGaps.arrivals)) {
        if (list.length) console.log(`  ${team}: ${list.join(', ')}`);
      }
    }
    console.log('\nTo lift the gate once the roster is right: --verify');
    return;
  }

  if (arg1 === '--verify') {
    const stamp = today();
    data.players.forEach((p) => { p.verifiedAt = stamp; });
    data._squadVerification = {
      ...(data._squadVerification || {}),
      verifiedAt: stamp,
      note: `Roster confirmed on ${stamp}. Re-verify after every transfer window.`,
    };
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
    console.log(`Marked ${data.players.length} players verified as of ${stamp}. Player markets are live again.`);
    return;
  }

  const teamId = arg1;
  const rosterPath = arg2;
  if (!rosterPath) {
    console.error('Usage: import-squad.js <team-id> <roster-file>');
    process.exit(1);
  }

  const { players, errors } = parseRoster(fs.readFileSync(rosterPath, 'utf8'), teamId);
  const bad = players.filter((p) => !roles[p.roleType]);
  if (bad.length) {
    console.error(`Unknown roleType for: ${bad.map((p) => `${p.id} (${p.roleType})`).join(', ')}`);
    console.error(`Valid roles: ${Object.keys(roles).join(', ')}`);
    process.exit(1);
  }
  if (players.length === 0) {
    console.error('No usable players parsed.');
    errors.forEach((e) => console.error(`  line ${e.line}: ${e.reason}`));
    process.exit(1);
  }

  // The imported roster is authoritative for this team.
  const removed = data.players.filter((p) => p.team === teamId && !players.some((n) => n.id === p.id));
  data.players = data.players.filter((p) => p.team !== teamId).concat(players);

  if (data._knownGaps && data._knownGaps.arrivals) delete data._knownGaps.arrivals[teamId];

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');

  console.log(`Imported ${players.length} players for ${teamId}.`);
  if (removed.length) console.log(`Removed ${removed.length} no longer on the roster: ${removed.map((p) => p.name).join(', ')}`);
  if (errors.length) {
    console.log(`${errors.length} lines skipped:`);
    errors.forEach((e) => console.log(`  line ${e.line}: ${e.reason} -- ${e.text}`));
  }

  const status = assessSquad(data, today());
  console.log(`\nSquad still ${status.verified ? 'VERIFIED' : 'UNVERIFIED'} (${status.unverifiedCount} players not confirmed).`);
  if (!status.verified) console.log('Run --verify once every team is right, to lift the gate.');
}

main();

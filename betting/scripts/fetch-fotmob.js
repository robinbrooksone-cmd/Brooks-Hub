#!/usr/bin/env node
'use strict';

/**
 * Pull squads, player stats, line-ups and referees from FotMob into the model.
 *
 *   node betting/scripts/fetch-fotmob.js --date=2026-09-20
 *   node betting/scripts/fetch-fotmob.js --date=2026-09-20 --lineups
 *   node betting/scripts/fetch-fotmob.js --from-file=squad.json --team=liverpool
 *   node betting/scripts/fetch-fotmob.js --probe
 *
 * Must run on a machine that can reach www.fotmob.com. Where it cannot, save
 * the JSON from a browser (devtools → Network → the /api/ request → Copy
 * response) and feed it in with --from-file; every mapper is pure, so the
 * offline path produces identical output.
 *
 * Responses are cached under data/fotmob-cache so repeated runs do not hammer
 * the API. Pass --fresh to bypass the cache.
 */

const fs = require('fs');
const path = require('path');
const fotmob = require('../src/adapters/fotmob');

const DATA = path.join(__dirname, '..', 'data');
const CACHE = path.join(DATA, 'fotmob-cache');
const PLAYERS_FILE = path.join(DATA, 'players.json');
const FIXTURES_FILE = path.join(DATA, 'fixtures.json');

function args() {
  const out = { lineups: false, fresh: false, dump: false, probe: false };
  for (const raw of process.argv.slice(2)) {
    const [flag, value] = raw.split('=');
    switch (flag) {
      case '--date': out.date = value; break;
      case '--match': out.match = value; break;
      case '--team': out.team = value; break;
      case '--from-file': out.fromFile = value; break;
      case '--lineups': out.lineups = true; break;
      case '--fresh': out.fresh = true; break;
      case '--dump': out.dump = true; break;
      case '--probe': out.probe = true; break;
      case '--min-minutes': out.minMinutes = Number(value); break;
      default: break;
    }
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
const compact = (d) => String(d).replace(/-/g, '');

function cachePath(key) {
  return path.join(CACHE, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`);
}

async function get(url, key, opts) {
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
  const file = cachePath(key);
  if (!opts.fresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const json = await fotmob.fetchJson(url);
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

/** Report whether FotMob is reachable, before doing anything slow. */
async function probe() {
  const url = fotmob.endpoints.matchesByDate(compact(today()));
  process.stdout.write(`Probing ${url}\n`);
  try {
    const json = await fotmob.fetchJson(url, { timeoutMs: 10000 });
    console.log(`Reachable. Top-level keys: ${fotmob.describe(json)}`);
    try {
      const fixtures = fotmob.mapFixtures(json);
      console.log(`Premier League fixtures found today: ${fixtures.length}`);
      fixtures.forEach((f) => console.log(`  ${f.home} v ${f.away}  (match ${f.fotmobMatchId})`));
    } catch (err) {
      console.log(`Fixtures mapping did not match: ${err.message}`);
    }
  } catch (err) {
    console.error(`NOT reachable: ${err.message}`);
    if (err.code === 'FOTMOB_UNREACHABLE' || err.code === 'FOTMOB_EGRESS_BLOCKED') {
      console.error('\nUse the offline path instead:');
      console.error('  1. Open fotmob.com in a browser, devtools -> Network');
      console.error('  2. Find the /api/ request you need, Copy Response, save as JSON');
      console.error('  3. node betting/scripts/fetch-fotmob.js --from-file=that.json --team=<team-id>');
    }
    process.exitCode = 1;
  }
}

/** Merge mapped players into players.json for one team. */
function writeTeam(teamId, mapped, { minMinutes }) {
  const file = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
  const stamp = today();

  // The imported roster is authoritative for this team: anyone absent has gone.
  const previous = file.players.filter((p) => p.team === teamId);
  const removed = previous.filter((p) => !mapped.some((m) => m.id === p.id));

  // Preserve hand-tuned fields the feed does not carry.
  const merged = mapped.map((m) => {
    const old = previous.find((p) => p.id === m.id);
    const out = { ...m, verifiedAt: stamp };
    if (old) {
      if (m.pace == null && old.pace != null) out.pace = old.pace;
      if (old.setPieces) out.setPieces = old.setPieces;
    }
    if (out.pace == null) delete out.pace;
    if (out.startProb == null) { out.startProb = 0.7; out.startProbEstimated = true; }
    if (out.benchProb == null) out.benchProb = 0.2;
    return out;
  });

  file.players = file.players.filter((p) => p.team !== teamId).concat(merged);
  if (file._knownGaps && file._knownGaps.arrivals) delete file._knownGaps.arrivals[teamId];

  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(file, null, 2) + '\n');

  const thin = merged.filter((p) => !p.statsReliable);
  console.log(`  ${teamId}: wrote ${merged.length} players` +
    (removed.length ? `, removed ${removed.length} (${removed.map((p) => p.name).join(', ')})` : ''));
  if (thin.length) {
    console.log(`    ${thin.length} below ${minMinutes ?? 270} minutes - role baseline used instead of their own rates: ` +
      thin.map((p) => p.name).join(', '));
  }
  return merged.length;
}

async function fromFile(opts) {
  const json = JSON.parse(fs.readFileSync(opts.fromFile, 'utf8'));
  console.log(`Loaded ${opts.fromFile}: ${fotmob.describe(json)}`);

  // Work out what kind of payload this is.
  const attempts = [
    ['fixtures', () => fotmob.mapFixtures(json)],
    ['matchDetails', () => {
      const m = fotmob.mapMatchDetails(json);
      if (!m.sides.length && !m.referee) throw new Error('no line-up or referee');
      return m;
    }],
    ['squad', () => {
      if (!opts.team) throw new Error('--team is required for a squad payload');
      return fotmob.mapSquad(json, { teamId: opts.team });
    }],
    ['player', () => fotmob.mapPlayer(json, { teamId: opts.team || 'unknown', verifiedAt: today() })],
  ];

  for (const [kind, fn] of attempts) {
    try {
      const result = fn();
      console.log(`\nRecognised as: ${kind}`);
      console.log(JSON.stringify(result, null, 2).slice(0, 2400));
      if (kind === 'squad') {
        console.log(`\n${result.length} squad members parsed. Player stats need a separate ` +
          '/api/playerData call each - fetch those and re-run with --from-file per player, ' +
          'or run the online path.');
      }
      return;
    } catch (err) {
      if (kind === 'squad' && /--team is required/.test(err.message)) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
    }
  }
  console.error('Could not recognise this payload as fixtures, match details, a squad or a player.');
  console.error(`Shape: ${fotmob.describe(json, 3)}`);
  process.exitCode = 1;
}

async function main() {
  const opts = args();

  if (opts.probe) return probe();
  if (opts.fromFile) return fromFile(opts);

  if (!opts.date) {
    console.error('Give a date: --date=2026-09-20   (or --probe, or --from-file=…)');
    process.exitCode = 1;
    return;
  }

  try {
    const matches = await get(
      fotmob.endpoints.matchesByDate(compact(opts.date)),
      `matches-${opts.date}`, opts
    );
    const fixtures = fotmob.mapFixtures(matches);
    console.log(`Premier League fixtures on ${opts.date}: ${fixtures.length}`);
    fixtures.forEach((f) => console.log(`  ${f.home} v ${f.away}  (match ${f.fotmobMatchId})`));

    if (opts.lineups) {
      console.log('\nLine-ups and referees:');
      for (const f of fixtures) {
        const details = await get(
          fotmob.endpoints.matchDetails(f.fotmobMatchId),
          `match-${f.fotmobMatchId}`, opts
        );
        const mapped = fotmob.mapMatchDetails(details);
        console.log(`  ${f.home} v ${f.away}: referee ${mapped.referee || 'not listed'}, ` +
          `line-ups ${mapped.lineupsConfirmed ? 'CONFIRMED' : 'not yet posted'}`);
        if (opts.dump) {
          fs.writeFileSync(cachePath(`dump-match-${f.fotmobMatchId}`), JSON.stringify(details, null, 2));
        }
      }
    }

    console.log('\nNext: squads and player stats need team ids. Run with --team=<fotmob-team-id> ' +
      'or extend this script once the fixture payload carries them in your region.');
  } catch (err) {
    console.error(`\n${err.message}`);
    if (err.code === 'FOTMOB_UNREACHABLE' || err.code === 'FOTMOB_AUTH' || err.code === 'FOTMOB_EGRESS_BLOCKED') {
      console.error('\nRun --probe first to confirm reachability, or use --from-file with saved JSON.');
    }
    process.exitCode = 1;
  }
}

main();

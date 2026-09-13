#!/usr/bin/env node
'use strict';

/**
 * End-to-end test with a stubbed ESPN, so the parser and the scoring rules
 * can be checked without a live slate. Fixtures reproduce the real response
 * shape: positional `stats` strings resolved through parallel `keys`/`labels`
 * arrays. The CIN receiving block deliberately omits `keys` so the label
 * fallback gets exercised too.
 */

const assert = require('assert');
const http = require('http');

const { RUSHING, RECEIVING_NO_KEYS, installStub, state: stub } = require('./fixtures');

installStub();

/* -------------------------------- run -------------------------------- */

const PORT = 3199;
process.env.PORT = String(PORT);
process.env.POLL_MS = '30000';

const get = (path) =>
  new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

const pass = (msg) => console.log(`  ok  ${msg}`);

async function main() {
  require('../server.js');
  await new Promise((r) => setTimeout(r, 400));

  console.log('\nParsing + scoring');
  const state = await get('/api/state');

  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.stale, false);
  assert.strictEqual(state.week, 2);
  assert.strictEqual(state.season, 2026);
  assert.strictEqual(state.games.length, 3);
  assert.strictEqual(state.boxScoresLoaded, 2, 'pre-game events must not be fetched');
  pass('scoreboard parsed; only the 2 games with box scores were fetched');

  const slip = state.slips[0];
  const byName = (n) => slip.legs.find((l) => l.configuredPlayer === n);

  const allen = byName('Josh Allen');
  assert.strictEqual(allen.value, 42, 'rushing YDS is column 1, not CAR');
  assert.strictEqual(allen.status, 'hit');
  pass('Josh Allen 42 rush yds vs 30 -> hit (merged across passing + rushing blocks)');

  const henry = byName('Derrick Henry');
  assert.strictEqual(henry.value, 65);
  assert.strictEqual(henry.status, 'live');
  assert.strictEqual(henry.toGo, 15);
  pass('Derrick Henry 65/80 in a live game -> live, 15 to go');

  const chase = byName("Ja'Marr Chase");
  assert.strictEqual(chase.value, 95, 'receiving YDS resolved without a keys[] array');
  assert.strictEqual(chase.status, 'hit');
  pass("Ja'Marr Chase 95 rec yds via the labels[] fallback -> hit");

  const burrow = byName('Joe Burrow');
  assert.strictEqual(burrow.value, 240);
  assert.strictEqual(burrow.status, 'miss', 'final game under the line is a miss');
  pass('Joe Burrow 240/250 at Final -> miss');

  const arsb = byName('Amon-Ra St. Brown');
  assert.strictEqual(arsb.value, 70);
  assert.strictEqual(arsb.status, 'hit', 'a prop of 70+ hits exactly at 70');
  pass('Amon-Ra St. Brown 70/70 -> hit (>= boundary, punctuated name matched)');

  const gibbs = byName('Jahmyr Gibbs');
  assert.strictEqual(gibbs.status, 'miss');
  pass('Jahmyr Gibbs 55/70 at Final -> miss');

  const mcmillan = byName('Tetairoa McMillan');
  assert.strictEqual(mcmillan.value, null);
  assert.strictEqual(mcmillan.status, 'pending');
  assert.ok(mcmillan.game && mcmillan.game.state === 'pre', 'team hint links a pre-game leg to its game');
  pass('Tetairoa McMillan -> pending, linked to CAR @ TEN via the team hint');

  const achane = byName("De'Von Achane");
  assert.strictEqual(achane.status, 'pending');
  assert.strictEqual(achane.game, null);
  pass("De'Von Achane -> pending, no game on this slate (never scored as a miss)");

  const placeholder = slip.legs.find((l) => l.placeholder);
  assert.strictEqual(placeholder.status, 'unset');
  pass('the unsupplied 12th leg is carried as unset, never scored');

  assert.strictEqual(slip.total, 12);
  assert.strictEqual(slip.hits, 3);
  assert.strictEqual(slip.misses, 2);
  assert.strictEqual(slip.status, 'dead');
  pass('slip tally 3 hit / 2 missed of 12 -> dead');

  console.log('\nStat isolation');
  const { fetchLiveData } = require('../espn');
  const live = await fetchLiveData({});
  const burrowRec = [...live.index.byId.values()].find((r) => r.name === 'Joe Burrow');
  assert.strictEqual(burrowRec.stats.pass_yds, 240);
  assert.strictEqual(burrowRec.stats.pass_td, 1);
  assert.strictEqual(burrowRec.stats.rush_yds, undefined, 'no rushing block means no rushing value');
  const allenRec = [...live.index.byId.values()].find((r) => r.name === 'Josh Allen');
  assert.strictEqual(allenRec.stats.pass_yds, 210);
  assert.strictEqual(allenRec.stats.pass_td, 2);
  assert.strictEqual(allenRec.stats.rush_yds, 42);
  pass('pass yds / pass TD / rush yds read from the right columns per athlete');

  const { buildPlayerIndex } = require('../espn');
  const split = buildPlayerIndex([
    {
      event: { id: 'x1' },
      data: { boxscore: { players: [{ team: { abbreviation: 'BUF' }, statistics: [
        { ...RUSHING, athletes: [{ athlete: { id: '1', displayName: 'Split Guy' }, stats: ['5', '33', '6.6', '0', '9'] }] },
        { ...RECEIVING_NO_KEYS, athletes: [{ athlete: { id: '2', displayName: 'Split Guy' }, stats: ['4', '51', '12.8', '0', '20', '5'] }] },
      ] }] } },
    },
  ]);
  const splitRec = split.byFullName.get('split guy')[0];
  assert.strictEqual(split.byId.size, 1, 'one player, not two records');
  assert.strictEqual(splitRec.stats.rush_yds, 33);
  assert.strictEqual(splitRec.stats.rec_yds, 51);
  pass('a player split across categories under mismatched ids merges into one line');

  const { shapeReport } = require('../espn');
  assert.match(shapeReport.categories.passing.resolved.pass_yds, /^keys\[1\]$/);
  assert.match(shapeReport.categories.receiving.resolved.rec_yds, /^labels\[1\]$/);
  pass('shape report records keys[] vs labels[] resolution per stat');

  console.log('\nFailure handling');
  const finalsBefore = stub.upstreamCalls;
  await get('/api/state');
  assert.ok(stub.upstreamCalls - finalsBefore < 3, 'final games are cached, not refetched');
  pass('completed games are not refetched');

  stub.failUpstream = true;
  const stale = await get('/api/state');
  assert.strictEqual(stale.ok, true);
  assert.strictEqual(stale.stale, true);
  assert.match(stale.error, /simulated ESPN outage/);
  assert.strictEqual(stale.slips[0].hits, 3, 'stale response still carries the last good slip data');
  assert.ok(stale.fetchedAt, 'stale response carries the timestamp of the data it is showing');
  pass('a failed poll serves last-good data with stale:true and its own timestamp');

  stub.failUpstream = false;
  const recovered = await get('/api/state');
  assert.strictEqual(recovered.stale, false);
  pass('recovers to fresh on the next successful poll');

  console.log('\nAll checks passed.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED:', err && err.message);
  console.error(err);
  process.exit(1);
});

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

const fs = require('fs');
const path = require('path');

const { RUSHING, RECEIVING_NO_KEYS, BETSLIP_TEXT, installStub, state: stub } = require('./fixtures');

const SLIPS_PATH = path.join(__dirname, '..', 'slips.json');
const SLIPS_BACKUP = fs.readFileSync(SLIPS_PATH, 'utf8');
const restoreSlips = () => fs.writeFileSync(SLIPS_PATH, SLIPS_BACKUP);

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

const send = (method, path, body) =>
  new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const post = (path, body) => send('POST', path, body);
const del = (path) => send('DELETE', path);

const pass = (msg) => console.log(`  ok  ${msg}`);


/**
 * Auth is read from the environment at startup, so it needs its own process.
 * No ESPN stub here — a 401 is returned before any upstream call.
 */
function testPassword() {
  const { spawn } = require('child_process');
  const PW_PORT = 3198;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PW_PORT), HOST: '127.0.0.1', ACCESS_PASSWORD: 'hunter2' },
    stdio: 'ignore',
  });

  const status = (auth) =>
    new Promise((resolve, reject) => {
      const headers = auth
        ? { authorization: `Basic ${Buffer.from(`x:${auth}`).toString('base64')}` }
        : {};
      const req = http.request(
        { host: '127.0.0.1', port: PW_PORT, path: '/', method: 'GET', headers },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
      req.on('error', reject);
      req.end();
    });

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        assert.strictEqual(await status(null), 401, 'no credentials must be refused');
        assert.strictEqual(await status('wrong'), 401, 'a wrong password must be refused');
        assert.strictEqual(await status('hunter2'), 200, 'the right password gets in');
        pass('ACCESS_PASSWORD refuses missing and wrong passwords, admits the right one');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        child.kill();
      }
    }, 700);
  });
}

async function main() {
  require('../server.js');
  await new Promise((r) => setTimeout(r, 400));

  console.log('\nParsing + scoring');
  const state = await get('/api/state');

  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.stale, false);
  assert.strictEqual(state.week, 2);
  assert.strictEqual(state.games.length, 5);
  assert.strictEqual(state.boxScoresLoaded, 4, 'pre-game events must not be fetched');
  assert.strictEqual(state.slips.length, 3);
  assert.deepStrictEqual(state.slips.map((s) => s.legs.length), [13, 8, 18]);
  pass('3 slips parsed (13 / 8 / 18 legs); only games with box scores were fetched');

  const slip = state.slips[0];
  const leg = (name, stat) =>
    slip.legs.find((l) => l.configuredPlayer === name && (!stat || l.stat === stat));

  assert.strictEqual(leg('Josh Allen').value, 42, 'rushing YDS is column 1, not CAR');
  assert.strictEqual(leg('Josh Allen').status, 'hit');
  pass('Josh Allen 42 rush yds vs 30 -> hit (merged across passing + rushing blocks)');

  assert.strictEqual(leg('Derrick Henry').status, 'live');
  assert.strictEqual(leg('Derrick Henry').toGo, 15);
  pass('Derrick Henry 65/80 in a live game -> live, 15 to go');

  assert.strictEqual(leg("Ja'Marr Chase").value, 95, 'receiving YDS resolved without a keys[] array');
  assert.strictEqual(leg("Ja'Marr Chase").status, 'hit');
  pass("Ja'Marr Chase 95 rec yds via the labels[] fallback -> hit");

  assert.strictEqual(leg('Joe Burrow').status, 'miss');
  pass('Joe Burrow 240/250 at Final -> miss');

  assert.strictEqual(leg('Amon-Ra St. Brown').value, 70);
  assert.strictEqual(leg('Amon-Ra St. Brown').status, 'hit', 'a 70+ prop hits exactly at 70');
  pass('Amon-Ra St. Brown 70/70 -> hit (>= boundary, punctuated name matched)');

  assert.strictEqual(leg('Jahmyr Gibbs').status, 'miss');
  pass('Jahmyr Gibbs 55/70 at Final -> miss');

  const smith = leg('DeVonta Smith');
  assert.strictEqual(smith.value, 5);
  assert.strictEqual(smith.status, 'hit');
  pass('DeVonta Smith 5 receptions vs 4+ -> hit (REC is column 0, not YDS)');

  const saquon = leg('Saquon Barkley');
  assert.strictEqual(saquon.value, 1, 'anytime TD derived from the rushing TD column');
  assert.strictEqual(saquon.status, 'hit');
  assert.strictEqual(saquon.prop, 'anytime TD', 'label override replaces the "N+ stat" phrasing');
  pass('Saquon Barkley rushing TD -> anytime TD hit');

  assert.strictEqual(leg('Tetairoa McMillan').status, 'pending');
  assert.ok(leg('Tetairoa McMillan').game.state === 'pre', 'team hint links a pre-game leg to its game');
  pass('Tetairoa McMillan -> pending, linked to CAR @ TEN via the team hint');

  assert.strictEqual(leg("De'Von Achane").status, 'pending');
  assert.strictEqual(leg("De'Von Achane").game, null);
  pass("De'Von Achane -> pending, no game on this slate (never scored as a miss)");

  assert.strictEqual(slip.total, 13);
  assert.strictEqual(slip.hits, 5);
  assert.strictEqual(slip.misses, 2);
  assert.strictEqual(slip.status, 'dead');
  pass('Thirteenfold tally 5 hit / 2 missed of 13 -> dead');

  const eight = state.slips[1];
  const eleg = (name) => eight.legs.find((l) => l.configuredPlayer === name);

  const stroud = eleg('C.J. Stroud');
  assert.strictEqual(stroud.value, 12);
  assert.strictEqual(stroud.line, 9.5);
  assert.strictEqual(stroud.status, 'hit', 'Over 9.5 clears at 12');
  pass('C.J. Stroud 12 rush yds vs Over 9.5 -> hit (decimal line, periods in name)');

  assert.strictEqual(eleg('Jerry Jeudy').status, 'miss');
  pass('Jerry Jeudy 2 receptions vs 3+ at Final -> miss');

  const laporta = eleg('Sam LaPorta');
  assert.strictEqual(laporta.value, 0, 'never appearing in a finished game really is zero');
  assert.strictEqual(laporta.status, 'miss');
  assert.strictEqual(laporta.noLine, true);
  assert.strictEqual(laporta.finished, true);
  pass('Sam LaPorta absent from a completed game -> 0, miss, flagged as having no line');

  const cook = eleg('James Cook');
  assert.strictEqual(cook.value, null, 'a live game with no line yet has no value, not a zero');
  assert.strictEqual(cook.status, 'live', 'absent from a live box score is not yet a miss');
  assert.strictEqual(cook.noLine, true);
  assert.strictEqual(cook.finished, false);
  pass('James Cook no line yet in a live game -> live, not miss, value still unknown');

  const eighteen = state.slips[2];

  {
    // A leg can name both sides of a matchup when you know the game but not
    // which side the player is on. Either side playing resolves it.
    const { evaluateLeg } = require('../evaluate');
    const live = { index: { byFullName: new Map(), byInitialLast: new Map() }, games: state.games, rosters: null };
    const byId = new Map(state.games.map((g) => [g.id, g]));

    const either = evaluateLeg({ player: 'Nobody At All', team: ['IND', 'BAL'], stat: 'rec', line: 2 }, 1, live, byId);
    assert.ok(either.game, 'BAL is playing, so the matchup hint resolves');
    assert.strictEqual(either.game.shortName, 'BUF @ BAL');
    assert.strictEqual(either.status, 'live');

    const neither = evaluateLeg({ player: 'Nobody At All', team: ['SEA', 'SF'], stat: 'rec', line: 2 }, 1, live, byId);
    assert.strictEqual(neither.game, null);
    assert.strictEqual(neither.status, 'pending');
    pass('a matchup hint resolves if either side is playing, and stays pending if neither is');
  }

  const diggs = eighteen.legs.filter((l) => l.configuredPlayer === 'Stefon Diggs');
  assert.strictEqual(diggs.length, 2, 'the same player can carry two different props');
  assert.deepStrictEqual(diggs.map((l) => l.stat), ['rec', 'rec_yds']);
  assert.strictEqual(diggs[0].rosterTeam, 'WAS');
  pass('one player can carry two separate props, both resolving to the same roster team');

  console.log('\nRoster resolution');
  assert.ok(state.rosters, 'payload reports roster index status');
  assert.strictEqual(state.rosters.error, null);
  assert.strictEqual(state.rosters.teams, 20);
  pass(`roster index built from ${state.rosters.teams} teams, ${state.rosters.players} players`);

  // Not on this slate at all, so only the roster can say who he plays for.
  const murray = eighteen.legs.find((l) => l.configuredPlayer === 'Kyler Murray');
  assert.strictEqual(murray.rosterTeam, 'MIN');
  assert.strictEqual(murray.teamSource, 'roster');
  assert.strictEqual(murray.hintConflict, false, 'hint and roster agree after the correction');
  pass('Kyler Murray resolves to MIN from the roster, not from the hint');

  // The box score outranks both, for a player who has actually played.
  assert.strictEqual(leg('Josh Allen').teamSource, 'boxscore');
  pass('a player in a box score takes his team from the box score');

  {
    // A hint left over from before an off-season move must be overridden and
    // flagged, not silently trusted.
    const { evaluateLeg } = require('../evaluate');
    const rosters = await require('../rosters').getRosterIndex();
    const stale = evaluateLeg(
      { player: 'Kyler Murray', team: 'ARI', stat: 'rush_yds', line: 20 },
      1,
      { index: { byFullName: new Map(), byInitialLast: new Map() }, games: [], rosters },
      new Map()
    );
    assert.strictEqual(stale.rosterTeam, 'MIN');
    assert.strictEqual(stale.team, 'MIN', 'roster beats a stale hint');
    assert.strictEqual(stale.teamSource, 'roster');
    assert.strictEqual(stale.hintConflict, true, 'the disagreement is surfaced');
    pass('a stale "ARI" hint for Kyler Murray is overridden by the roster and flagged');
  }

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
  const liveGames = state.games.filter((g) => g.state === 'in').length;
  await get('/api/state'); // warm the cache first so the count isn't timing-dependent
  const before = stub.upstreamCalls;
  await get('/api/state');
  const calls = stub.upstreamCalls - before;
  // One scoreboard call plus one per in-progress game. Finals are cached and
  // pre-game events have no box score, so neither costs a request.
  assert.strictEqual(calls, 1 + liveGames, `expected ${1 + liveGames} upstream calls, got ${calls}`);
  pass(`a poll costs 1 scoreboard + ${liveGames} live games; finals and pre-game cost nothing`);

  stub.failUpstream = true;
  const stale = await get('/api/state');
  assert.strictEqual(stale.ok, true);
  assert.strictEqual(stale.stale, true);
  assert.match(stale.error, /simulated ESPN outage/);
  assert.strictEqual(stale.slips[0].hits, slip.hits, 'stale response still carries the last good slip data');
  assert.ok(stale.fetchedAt, 'stale response carries the timestamp of the data it is showing');
  pass('a failed poll serves last-good data with stale:true and its own timestamp');

  stub.failUpstream = false;
  const recovered = await get('/api/state');
  assert.strictEqual(recovered.stale, false);
  pass('recovers to fresh on the next successful poll');

  console.log('\nStat lines and the players view');
  const withLines = await get('/api/state');

  const allen = withLines.players.find((p) => p.name === 'Josh Allen');
  assert.deepStrictEqual(
    allen.statLines.map((l) => `${l.category}: ${l.text}`),
    ['passing: 18/25, 210 yds, 2 TD', 'rushing: 6 car, 42 yds, 1 TD'],
    'both category lines, in broadcast order, with zeroes suppressed'
  );
  pass('Josh Allen reads as "18/25, 210 yds, 2 TD" and "6 car, 42 yds, 1 TD"');

  const burrow = withLines.players.find((p) => p.name === 'Joe Burrow');
  assert.strictEqual(burrow.statLines[0].text, '24/38, 240 yds, 1 TD, 1 INT', 'a real INT is shown');
  const gibbs = withLines.players.find((p) => p.name === 'Jahmyr Gibbs');
  assert.strictEqual(gibbs.statLines[0].text, '12 car, 55 yds, 1 TD');
  const arsb = withLines.players.find((p) => p.name === 'Amon-Ra St. Brown');
  assert.strictEqual(arsb.statLines[0].text, '7 rec, 70 yds, 9 tgt', '0 TD is suppressed, targets are not');
  pass('zero TDs are suppressed; a real INT and targets are kept');

  const cookPlayer = withLines.players.find((p) => p.name === 'James Cook');
  assert.deepStrictEqual(cookPlayer.statLines, [], 'no line yet means no line, not a row of zeroes');
  assert.strictEqual(cookPlayer.props.length, 2, 'both slips riding on him are listed under one player');
  assert.deepStrictEqual(cookPlayer.props.map((p) => p.slip).sort(), ['Eighteenfold', 'Eightfold']);
  pass('a player carrying props on two slips appears once, with both listed');

  const liveFirst = withLines.players.findIndex((p) => !p.game || p.game.state !== 'in');
  const withStats = withLines.players.findIndex((p) => !p.statLines.length);
  assert.ok(withStats > 0, 'players with a stat line sort above those without');
  assert.ok(liveFirst === -1 || withStats < liveFirst + 1, 'live games lead the list');
  assert.strictEqual(withLines.players[0].name, 'Derrick Henry');
  pass('live games lead, and within them the players who have actually done something');

  console.log('\nBetslip parsing');
  const { parseSlipText, parseLegLine } = require('../slip-parser');

  const eightParsed = parseSlipText(BETSLIP_TEXT.eight);
  assert.strictEqual(eightParsed.problems.length, 0);
  assert.strictEqual(eightParsed.legs.length, 8);
  const eighteenParsed = parseSlipText(BETSLIP_TEXT.eighteen);
  assert.strictEqual(eighteenParsed.problems.length, 0);
  assert.strictEqual(eighteenParsed.legs.length, 18);
  pass('the Eightfold and Eighteenfold slips parse verbatim, 26 legs, no problems');

  const stroudLeg = eightParsed.legs.find((l) => l.player === 'C.J. Stroud');
  assert.deepStrictEqual(
    { stat: stroudLeg.stat, line: stroudLeg.line, label: stroudLeg.label },
    { stat: 'rush_yds', line: 9.5, label: 'over 9.5 rush yds' }
  );
  pass('"Total Rushing Yards ... - Over 9.5" -> rush_yds, line 9.5');

  const goffLeg = eighteenParsed.legs.find((l) => l.player === 'Jared Goff');
  assert.strictEqual(goffLeg.stat, 'pass_td', '"Touchdown Passes" must not match "passing yards"');
  assert.strictEqual(goffLeg.line, 2);
  pass('"2+ Touchdown Passes" -> pass_td 2, not pass_yds');

  const scorer = parseLegLine('Touchdown Scorer: Saquon Barkley - Yes').leg;
  assert.deepStrictEqual(scorer, { player: 'Saquon Barkley', stat: 'any_td', line: 1, label: 'anytime TD' });
  pass('"Touchdown Scorer" with no number -> any_td, line 1');

  const fannin = eighteenParsed.legs.find((l) => l.player === 'Harold Fannin Jr.');
  assert.ok(fannin, 'a name ending in a suffix survives the player/selection split');
  assert.deepStrictEqual(fannin.team, ['JAX', 'CLE'], 'game line becomes a matchup hint');
  pass('"Harold Fannin Jr. - Yes" splits correctly and picks up its matchup');

  assert.strictEqual(
    parseSlipText('14-17   2nd Quarter 4:04\nLive HOU Texans - Buffalo Bills').legs.length,
    0,
    'score and game lines alone produce no legs'
  );
  pass('score lines are ignored and a game line alone creates no leg');

  const junk = parseSlipText([
    '80+ Receiving Yards By The Player: Real Player - Yes',
    'Under 40.5 Receiving Yards By The Player: Someone - Under 40.5',
    'First Basket Scorer: Wrong Sport - Yes',
    'total nonsense with no colon',
  ].join('\n'));
  assert.strictEqual(junk.legs.length, 1, 'the good leg still parses');
  assert.strictEqual(junk.problems.length, 3, 'every bad line is reported, not dropped');
  assert.match(junk.problems[0].error, /Under/);
  assert.match(junk.problems[1].error, /unrecognised market/);
  pass('unsupported and malformed lines are reported individually, never silently dropped');

  console.log('\nPlain-language legs');
  const { parsePlainLine } = require('../slip-parser');

  const plain = (text) => parsePlainLine(text).leg;

  assert.deepStrictEqual(plain('Josh Allen 35 rush yards'), { player: 'Josh Allen', stat: 'rush_yds', line: 35 });
  assert.deepStrictEqual(plain("Ja'Marr Chase 80+ receiving yds"), { player: "Ja'Marr Chase", stat: 'rec_yds', line: 80 });
  assert.deepStrictEqual(plain('Joe Burrow 250 passing yards'), { player: 'Joe Burrow', stat: 'pass_yds', line: 250 });
  assert.deepStrictEqual(plain('DeVonta Smith 4 catches'), { player: 'DeVonta Smith', stat: 'rec', line: 4 });
  assert.deepStrictEqual(plain('Derrick Henry 80 rush'), { player: 'Derrick Henry', stat: 'rush_yds', line: 80 });
  pass('typed shorthand reads as you would say it, with or without "+" or a unit');

  assert.deepStrictEqual(plain('Saquon Barkley anytime td'), { player: 'Saquon Barkley', stat: 'any_td', line: 1, label: 'anytime TD' });
  assert.deepStrictEqual(plain('Saquon Barkley to score'), { player: 'Saquon Barkley', stat: 'any_td', line: 1, label: 'anytime TD' });
  pass('"anytime td" and "to score" both mean an anytime scorer');

  assert.strictEqual(plain('Jared Goff 2 passing tds').stat, 'pass_td', 'must not fall through to pass_yds or any_td');
  assert.strictEqual(plain('C.J. Stroud over 9.5 rushing yards').line, 9.5);
  assert.strictEqual(plain('C.J. Stroud over 9.5 rushing yards').label, 'over 9.5 rush yds');
  pass('"2 passing tds" and "over 9.5 rushing yards" read correctly');

  // A bare "rec" is genuinely ambiguous; the number decides, and the preview shows it.
  assert.strictEqual(plain('Sam LaPorta 4 rec').stat, 'rec');
  assert.strictEqual(plain('Tetairoa McMillan 60 rec').stat, 'rec_yds');
  pass('a bare "rec" resolves to catches at 4 and to yards at 60');

  assert.match(parsePlainLine('Tony Pollard 50 yards').error, /doesn.t say which yards/);
  assert.match(parsePlainLine('Nobody 12 blocks').error, /couldn.t tell which stat/);
  assert.match(parsePlainLine('just some words').error, /no number found/);
  pass('genuinely ambiguous or unreadable shorthand asks rather than guessing');

  // Both formats can sit in the same paste.
  const mixed = parseSlipText([
    'Josh Allen 35 rush yards',
    "80+ Receiving Yards By The Player - Including Overtime: Ja'Marr Chase - Yes",
    'Live Cincinnati Bengals - Tampa Bay Buccaneers',
    'Saquon Barkley anytime td',
  ].join('\n'));
  assert.strictEqual(mixed.problems.length, 0);
  assert.deepStrictEqual(mixed.legs.map((l) => l.stat), ['rush_yds', 'rec_yds', 'any_td']);
  assert.deepStrictEqual(mixed.legs[1].team, ['CIN', 'TB']);
  pass('typed and pasted legs can be mixed in one paste');

  console.log('\nAdding and removing slips');
  const added = await post('/api/slips', {
    text: BETSLIP_TEXT.eight,
    name: 'Test Eightfold',
    stake: '100',
    odds: '42.5',
    payout: '4250',
  });
  assert.strictEqual(added.slip.id, 'test-eightfold');
  assert.strictEqual(added.slip.legs.length, 8);
  assert.strictEqual(added.slip.odds, 42.5);
  pass('POST /api/slips parses pasted text and appends a slip');

  const withNew = await get('/api/state');
  assert.strictEqual(withNew.slips.length, 4);
  const testSlip = withNew.slips.find((s) => s.id === 'test-eightfold');
  assert.strictEqual(testSlip.legs.length, 8);
  assert.strictEqual(testSlip.legs.find((l) => l.configuredPlayer === 'C.J. Stroud').status, 'hit');
  pass('the new slip is scored on the very next poll');

  const rejected = await post('/api/slips', { text: 'nothing parseable here', name: 'Bad' });
  assert.ok(rejected.error, 'a slip with no readable legs is refused');
  assert.strictEqual((await get('/api/state')).slips.length, 4, 'and nothing was written');
  pass('a slip with no readable legs is refused rather than saved empty');

  await del('/api/slips/test-eightfold');
  assert.strictEqual((await get('/api/state')).slips.length, 3);
  pass('DELETE /api/slips/:id removes it again');

  console.log('\nPassword protection');
  await testPassword();

  restoreSlips();
  console.log('\nAll checks passed.\n');
  process.exit(0);
}

main().catch((err) => {
  restoreSlips(); // never leave a test slip behind
  console.error('\nFAILED:', err && err.message);
  console.error(err);
  process.exit(1);
});

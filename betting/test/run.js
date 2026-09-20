#!/usr/bin/env node
'use strict';

/* Dependency-free test runner for the pricing model. `npm test` from the repo root. */

const stats = require('../src/lib/stats');
const goals = require('../src/model/goals');
const counts = require('../src/model/counts');
const playersModel = require('../src/model/players');
const devig = require('../src/pricing/devig');
const edge = require('../src/pricing/edge');
const parlay = require('../src/pricing/parlay');
const adapter = require('../src/adapters/sportingbet');
const { runSlate, buildParlays, fairSheet: fairSheetFn } = require('../src/engine');
const rolesModel = require('../src/model/roles');
const minutesModel = require('../src/model/minutes');
const involvement = require('../src/model/involvement');
const matchups = require('../src/model/matchups');
const playerEvents = require('../src/model/playerEvents');
const squad = require('../src/model/squad');
const squadStatus = require('../src/model/squadStatus');
const fotmob = require('../src/adapters/fotmob');
const samples = require('./fixtures/fotmob-samples');
const rolesData = require('../data/roles.json');
const playersData = require('../data/players.json').players;
const teamsData = require('../data/teams.json').teams;

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    process.stdout.write('.');
  } catch (err) {
    fail++;
    failures.push({ name, message: err.message });
    process.stdout.write('F');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function close(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg || 'not close'}: ${a} vs ${b} (tol ${tol})`);
  }
}

/* ------------------------------------------------------- distributions */

test('negative binomial recovers its target mean and variance', () => {
  const mu = 10.3;
  const phi = 0.075;
  const v = stats.countVector(mu, phi, 80);
  let m = 0;
  let m2 = 0;
  v.forEach((p, k) => { m += p * k; m2 += p * k * k; });
  close(m, mu, 1e-6, 'mean');
  close(m2 - m * m, mu + phi * mu * mu, 1e-4, 'variance');
});

test('negative binomial collapses to Poisson when phi is zero', () => {
  for (const k of [0, 1, 3, 7]) {
    close(stats.negBinPmf(k, 2.4, 0), stats.poissonPmf(k, 2.4), 1e-12, `k=${k}`);
  }
});

test('count vectors are proper probability distributions', () => {
  for (const [mu, phi] of [[1.2, 0], [5.2, 0.08], [12.6, 0.055]]) {
    const v = stats.countVector(mu, phi, 60);
    close(v.reduce((a, b) => a + b, 0), 1, 1e-12, `mu=${mu}`);
    assert(v.every((p) => p >= 0), 'negative probability');
  }
});

test('gamma frailty nodes have unit mean and unit total weight', () => {
  for (const phi of [0.01, 0.03, 0.09, 0.25]) {
    const { nodes, weights } = stats.gammaFrailtyNodes(phi);
    close(weights.reduce((a, b) => a + b, 0), 1, 1e-10, `weights phi=${phi}`);
    close(weights.reduce((s, w, i) => s + w * nodes[i], 0), 1, 1e-10, `mean phi=${phi}`);
  }
});

test('residual dispersion composes back to the total', () => {
  const total = 0.095;
  const shared = 0.058;
  const resid = stats.residualDispersion(total, shared);
  close((1 + shared) * (1 + resid) - 1, total, 1e-12);
});

test('normal cdf and its inverse round-trip', () => {
  for (const p of [0.01, 0.1, 0.5, 0.83, 0.99]) {
    close(stats.normalCdf(stats.normalInv(p)), p, 1e-6, `p=${p}`);
  }
});

test('bivariate normal reduces to the product when uncorrelated', () => {
  const h = stats.normalInv(0.7);
  const k = stats.normalInv(0.45);
  close(stats.bivariateNormalUpper(h, k, 0), 0.3 * 0.55, 1e-6);
});

test('bivariate normal matches simulation at a real correlation', () => {
  const p1 = 0.6;
  const p2 = 0.5;
  const legs = [
    { matchId: 'm', family: 'match_goals', side: 'over', team: 'match', marketId: 'a', modelProb: p1, odds: 2 },
    { matchId: 'm', family: 'player_sot', side: 'over', team: 'home', playerId: 'x', marketId: 'b', modelProb: p2, odds: 2 },
  ];
  const analytic = parlay.approxJointProbability(legs);
  const mc = parlay.jointProbability(legs, { draws: 400000 }).probability;
  close(analytic, mc, 0.004, 'analytic vs MC');
});

/* --------------------------------------------------------------- goals */

test('Dixon-Coles score matrix is a probability distribution', () => {
  const grid = goals.scoreMatrix(1.6, 1.1, -0.045, 10);
  const total = grid.flat().reduce((a, b) => a + b, 0);
  close(total, 1, 1e-12);
});

test('Dixon-Coles with rho=0 is independent Poisson', () => {
  const grid = goals.scoreMatrix(1.5, 1.2, 0, 12);
  close(grid[2][1], stats.poissonPmf(2, 1.5) * stats.poissonPmf(1, 1.2), 1e-6);
});

test('the low-score correction actually moves the low-score cells', () => {
  const flat = goals.scoreMatrix(1.4, 1.2, 0, 10);
  const corrected = goals.scoreMatrix(1.4, 1.2, -0.08, 10);
  assert(Math.abs(corrected[0][0] - flat[0][0]) > 1e-4, '0-0 unchanged');
  assert(Math.abs(corrected[1][1] - flat[1][1]) > 1e-4, '1-1 unchanged');
  close(corrected[3][2], flat[3][2], 1e-9, 'high scores should be untouched');
});

test('goal markets are internally consistent', () => {
  const g = goals.goalMarkets(goals.scoreMatrix(1.7, 1.3, -0.045, 10));
  close(g.bttsYes + g.bttsNo, 1, 1e-12, 'BTTS');
  close(g.homeWin + g.draw + g.awayWin, 1, 1e-12, '1X2');
  close(g.totalGoals.reduce((a, b) => a + b, 0), 1, 1e-12, 'totals');
});

/* --------------------------------------------------------- joint counts */

test('joint count model preserves both marginals exactly', () => {
  const m = counts.jointCountModel({ muHome: 5.8, muAway: 4.6, phiTotal: 0.075, phiShared: 0.03 });
  const moments = (v) => {
    let a = 0;
    let b = 0;
    v.forEach((p, k) => { a += p * k; b += p * k * k; });
    return { mean: a, variance: b - a * a };
  };
  const h = moments(m.marginalHome);
  close(h.mean, 5.8, 1e-4, 'home mean');
  close(h.variance, 5.8 + 0.075 * 5.8 * 5.8, 1e-3, 'home variance');
  const a = moments(m.marginalAway);
  close(a.mean, 4.6, 1e-4, 'away mean');
});

test('match total mean equals the sum of the two team means', () => {
  const m = counts.jointCountModel({ muHome: 5.8, muAway: 4.6, phiTotal: 0.075, phiShared: 0.03 });
  let mean = 0;
  m.total.forEach((p, k) => { mean += p * k; });
  close(mean, 10.4, 1e-4);
});

test('both-teams lines exceed the independent product', () => {
  const m = counts.jointCountModel({ muHome: 5.2, muAway: 5.0, phiTotal: 0.075, phiShared: 0.03 });
  for (const k of [3, 4, 5]) {
    const joint = m.bothAtLeast(k, k);
    const naive = counts.atLeast(m.marginalHome, k) * counts.atLeast(m.marginalAway, k);
    assert(joint > naive, `k=${k}: joint ${joint} should exceed naive ${naive}`);
    assert(joint <= Math.min(counts.atLeast(m.marginalHome, k), counts.atLeast(m.marginalAway, k)) + 1e-9,
      `k=${k}: joint cannot exceed either marginal`);
  }
});

test('shared frailty produces a positive, plausible correlation', () => {
  const corners = counts.jointCountModel({ muHome: 5.2, muAway: 5.0, phiTotal: 0.075, phiShared: 0.03 });
  const r = corners.correlation();
  assert(r > 0.05 && r < 0.30, `corner correlation out of range: ${r}`);
});

test('zero shared dispersion gives independence', () => {
  const m = counts.jointCountModel({ muHome: 5, muAway: 5, phiTotal: 0.06, phiShared: 0 });
  close(m.correlation(), 0, 1e-9);
  const joint = m.bothAtLeast(4, 4);
  const naive = counts.atLeast(m.marginalHome, 4) * counts.atLeast(m.marginalAway, 4);
  close(joint, naive, 1e-9);
});

/* -------------------------------------------------------- player props */

test('minutes scenario weights sum to one', () => {
  const p = { role: 'FWD', startProb: 0.72, benchProb: 0.22, per90: { shots: 3 } };
  close(playersModel.minutesScenarios(p).reduce((s, x) => s + x.weight, 0), 1, 1e-12);
});

test('player prop tails are monotone decreasing in the line', () => {
  const p = { role: 'FWD', startProb: 0.8, benchProb: 0.15, per90: { shots: 3.4 } };
  const tails = [1, 2, 3, 4].map((k) => playersModel.propAtLeast(p, 'shots', k));
  for (let i = 1; i < tails.length; i++) {
    assert(tails[i] <= tails[i - 1], `not monotone at ${i}`);
  }
  assert(tails[0] > 0 && tails[0] < 1, 'degenerate');
});

test('rotation risk lowers prop probability', () => {
  const base = { role: 'FWD', benchProb: 0.1, per90: { shots: 3.4 } };
  const nailed = playersModel.propAtLeast({ ...base, startProb: 0.95 }, 'shots', 2);
  const doubtful = playersModel.propAtLeast({ ...base, startProb: 0.45 }, 'shots', 2);
  assert(doubtful < nailed, 'a rotation doubt must reduce the probability');
});

test('booking probability rises with referee strictness and foul rate', () => {
  const p = { role: 'MID', startProb: 0.9, benchProb: 0.05, cardProneness: 1.3, per90: { fouls: 2.4 } };
  const lenient = playersModel.bookingProb(p, { refStrictness: 0.9 });
  const strict = playersModel.bookingProb(p, { refStrictness: 1.2 });
  assert(strict > lenient, 'stricter referee must raise the booking probability');
  assert(lenient > 0 && strict < 1, 'out of range');

  const calm = playersModel.bookingProb({ ...p, per90: { fouls: 0.6 } }, { refStrictness: 1 });
  assert(calm < lenient, 'a low-foul player must be less likely to be booked');
});

/* --------------------------------------------------------------- devig */

test('every de-vig method returns probabilities summing to one', () => {
  for (const odds of [[1.9, 1.9], [1.25, 3.75], [2.1, 1.75], [1.4, 3.2]]) {
    for (const method of ['multiplicative', 'power', 'shin']) {
      const probs = devig[method](odds);
      close(probs.reduce((a, b) => a + b, 0), 1, 1e-9, `${method} on ${odds}`);
    }
  }
});

test('power and Shin give the favourite more than proportional does', () => {
  const odds = [1.25, 3.75];
  const mult = devig.multiplicative(odds)[0];
  assert(devig.power(odds)[0] > mult, 'power should exceed proportional on the favourite');
  assert(devig.shin(odds)[0] > mult, 'shin should exceed proportional on the favourite');
});

test('overround is computed correctly', () => {
  close(devig.overround([2, 2]), 1, 1e-12);
  close(devig.overround([1.9, 1.9]), 2 / 1.9, 1e-12);
});

test('a fair book is left untouched', () => {
  const probs = devig.devig([2, 2]).probs;
  close(probs[0], 0.5, 1e-9);
});

/* ---------------------------------------------------------------- edge */

test('Kelly is zero at fair odds and positive above them', () => {
  close(edge.kellyFraction(0.5, 2), 0, 1e-12);
  assert(edge.kellyFraction(0.55, 2) > 0, 'should be positive');
  assert(edge.kellyFraction(0.45, 2) < 0, 'should be negative');
});

test('expected value agrees with Kelly on sign', () => {
  for (const [p, o] of [[0.55, 2], [0.45, 2], [0.3, 4], [0.2, 4]]) {
    const ev = edge.expectedValue(p, o);
    const k = edge.kellyFraction(p, o);
    assert(Math.sign(ev) === Math.sign(k), `sign mismatch at p=${p} o=${o}`);
  }
});

test('stake never exceeds the Kelly cap', () => {
  const r = edge.priceSelection({ modelProb: 0.9, marketOdds: [1.9, 1.9], index: 0, bankroll: 100, kellyFractionCap: 0.25 });
  assert(r.stakeFraction <= 0.25 + 1e-12, 'cap breached');
  assert(r.stake <= 25 + 1e-9, 'stake breached');
});

/* -------------------------------------------------------------- parlay */

test('cross-match parlays are exactly the product of their legs', () => {
  const legs = [
    { matchId: 'a', family: 'match_goals', side: 'over', team: 'match', marketId: '1', modelProb: 0.6, odds: 1.8 },
    { matchId: 'b', family: 'match_corners', side: 'over', team: 'match', marketId: '2', modelProb: 0.55, odds: 1.9 },
    { matchId: 'c', family: 'match_cards', side: 'over', team: 'match', marketId: '3', modelProb: 0.5, odds: 2.0 },
  ];
  const r = parlay.priceParlay(legs);
  close(r.probability, 0.6 * 0.55 * 0.5, 1e-12);
  assert(r.method === 'independent', 'should not simulate independent legs');
  assert(r.priceKnown, 'cross-match price is the product and is known');
});

test('positively correlated same-game legs beat the naive product', () => {
  const legs = [
    { matchId: 'm', family: 'match_goals', side: 'over', team: 'match', marketId: '1', modelProb: 0.6, odds: 1.8 },
    { matchId: 'm', family: 'player_sot', side: 'over', team: 'home', playerId: 'x', marketId: '2', modelProb: 0.5, odds: 2.0 },
  ];
  const r = parlay.priceParlay(legs, { draws: 300000 });
  assert(r.probability > r.independentProbability, 'correlation should lift the joint probability');
  assert(!r.priceKnown, 'same-game price must not be assumed');
  assert(r.evPct === null, 'must not quote EV without a real price');
  assert(Number.isFinite(r.breakEvenOdds), 'break-even price must be reported');
});

test('opposing directions fall below the naive product', () => {
  const legs = [
    { matchId: 'm', family: 'match_goals', side: 'over', team: 'match', marketId: '1', modelProb: 0.6, odds: 1.8 },
    { matchId: 'm', family: 'match_shots', side: 'under', team: 'match', marketId: '2', modelProb: 0.5, odds: 2.0 },
  ];
  const r = parlay.priceParlay(legs, { draws: 300000 });
  assert(r.probability < r.independentProbability, 'opposing legs should reduce the joint probability');
});

test('supplying a real price restores a true expected value', () => {
  const legs = [
    { matchId: 'm', family: 'match_goals', side: 'over', team: 'match', marketId: '1', modelProb: 0.6, marketFairProb: 0.55, odds: 1.8 },
    { matchId: 'm', family: 'player_sot', side: 'over', team: 'home', playerId: 'x', marketId: '2', modelProb: 0.5, marketFairProb: 0.46, odds: 2.0 },
  ];
  const r = parlay.priceParlay(legs, { payoutOdds: 4.0, draws: 200000 });
  assert(r.priceKnown && r.evPct !== null, 'EV should be quoted against a real price');
  close(r.ev, r.probability * 3 - (1 - r.probability), 1e-9);
});

test('different players are not correlated like the same player', () => {
  const leg = (family, playerId) => ({ matchId: 'm', family, side: 'over', team: 'home', playerId, marketId: family + playerId });
  const same = parlay.legCorrelation(leg('player_shots', 'x'), leg('player_sot', 'x'));
  const diff = parlay.legCorrelation(leg('player_shots', 'x'), leg('player_sot', 'y'));
  assert(same > 0.5, `same player should be strongly correlated, got ${same}`);
  assert(diff < 0.2, `different players should be weakly correlated, got ${diff}`);
});

test('every correlation table entry resolves', () => {
  for (const key of Object.keys(parlay.FAMILY_CORRELATION)) {
    const [f1, f2] = key.split('|');
    const a = { matchId: 'm', family: f1, side: 'over', team: 'match', playerId: 'x', marketId: '1' };
    const b = { matchId: 'm', family: f2, side: 'over', team: 'match', playerId: 'x', marketId: '2' };
    const r = parlay.legCorrelation(a, b);
    close(r, parlay.FAMILY_CORRELATION[key], 1e-9, `unresolved key ${key}`);
  }
});

test('legs in different matches are never correlated', () => {
  const a = { matchId: 'm1', family: 'player_shots', side: 'over', team: 'home', playerId: 'x', marketId: '1' };
  const b = { matchId: 'm2', family: 'player_shots', side: 'over', team: 'home', playerId: 'x', marketId: '2' };
  close(parlay.legCorrelation(a, b), 0, 1e-12);
});

/* -------------------------------------------------------------- adapter */

test('odds ladder rounds to plausible bookmaker prices', () => {
  close(adapter.roundToLadder(1.904), 1.9, 1e-9);
  close(adapter.roundToLadder(2.63), 2.65, 1e-9);
  close(adapter.roundToLadder(4.44), 4.4, 1e-9);
  assert(adapter.roundToLadder(0.5) >= 1.01, 'must never return an impossible price');
});

test('pasted odds parse and report bad lines', () => {
  const { board, errors } = adapter.parsePastedOdds(
    '# comment\nbou-liv:total_corners:10.5 | over | 1.91\nful-mun:both_cards:1 @ yes @ 1.44\nrubbish line\n',
    { date: '2026-09-20' }
  );
  assert(board.prices.length === 2, `expected 2 prices, got ${board.prices.length}`);
  assert(errors.length === 1, `expected 1 error, got ${errors.length}`);
  assert(board.prices[0].selection === 'over', 'selection not normalised');
});

/* --------------------------------------------------------------- engine */

test('the slate prices every fixture and respects its filters', () => {
  const slate = runSlate({ minEdge: 0.03, bankroll: 200 });
  assert(slate.fixtures.length === 4, `expected 4 fixtures, got ${slate.fixtures.length}`);
  assert(slate.picks.length > 0, 'no picks produced');
  for (const p of slate.picks) {
    assert(p.edge >= 0.03 - 1e-9, `pick below the edge threshold: ${p.edgePct}`);
    assert(p.odds > 1, 'impossible price');
    assert(p.modelProb > 0 && p.modelProb < 1, 'degenerate probability');
    assert(p.ev > 0, 'a pick must be positive expectation');
  }
});

test('every two-way market sums to one', () => {
  const slate = runSlate({ minEdge: 0.02 });
  let checked = 0;
  for (const f of slate.fixtures) {
    for (const m of f.markets) {
      const total = m.selections.reduce((s, x) => s + x.modelProb, 0);
      close(total, 1, 1e-9, `${m.id} sums to ${total}`);
      checked++;
    }
  }
  assert(checked > 1000, `expected a full board, only checked ${checked}`);
});

test('the board covers every market family we advertise', () => {
  const slate = runSlate({ minEdge: 0 });
  const families = new Set();
  for (const f of slate.fixtures) for (const m of f.markets) families.add(m.family);
  for (const want of [
    'match_goals', 'btts', 'team_goals', 'match_corners', 'team_corners',
    'match_cards', 'team_cards', 'match_shots', 'team_shots',
    'player_shots', 'player_sot', 'player_fouls', 'player_goals', 'player_booked',
  ]) {
    assert(families.has(want), `missing market family: ${want}`);
  }
});

test('both-teams corner and card lines are present and sane', () => {
  const slate = runSlate({ minEdge: 0 });
  const both = [];
  for (const f of slate.fixtures) {
    for (const m of f.markets) if (/both_(corners|cards)/.test(m.id)) both.push(m);
  }
  assert(both.length >= 20, `expected both-teams lines on every fixture, got ${both.length}`);
  for (const m of both) {
    const yes = m.selections.find((s) => s.key === 'yes').modelProb;
    assert(yes > 0 && yes < 1, `${m.id} degenerate`);
  }
});

test('the parlay builder returns usable slips', () => {
  const slate = runSlate({ minEdge: 0.03, bankroll: 100 });
  const built = buildParlays(slate, { bankroll: 100, minLegs: 3, maxLegs: 4 });
  assert(built.accumulator, 'no accumulator built');
  const acc = built.accumulator;
  assert(acc.legCount >= 3 && acc.legCount <= 4, 'leg count out of bounds');
  const matches = new Set(acc.legs.map((l) => l.matchId));
  assert(matches.size === acc.legCount, 'accumulator legs must be in different matches');
  assert(acc.priceKnown && acc.ev > 0, 'accumulator should be positive expectation');
  close(acc.probability, acc.legs.reduce((p, l) => p * l.modelProb, 1), 1e-9, 'independence');
});


/* ---------------------------------------------------------- role layer */

test('every player resolves to a complete per-90 profile', () => {
  const required = Object.values(rolesData.groups).flat();
  for (const player of playersData) {
    const { per90 } = rolesModel.resolvePer90(player, rolesData);
    for (const metric of required) {
      assert(Number.isFinite(per90[metric]) && per90[metric] >= 0,
        `${player.id} has no usable ${metric}`);
    }
  }
});

test('resolved profiles never violate their containment invariants', () => {
  for (const player of playersData) {
    const { per90 } = rolesModel.resolvePer90(player, rolesData);
    for (const [child, parent] of rolesModel.CONTAINMENT) {
      assert(per90[child] <= per90[parent] + 1e-9,
        `${player.id}: ${child} (${per90[child]}) exceeds ${parent} (${per90[parent]})`);
    }
  }
});

test('explicit per-90 values always beat the role baseline', () => {
  // Pick by property, never by name: players move clubs, and a test pinned to
  // one breaks the moment the roster is refreshed - which is the whole reason
  // the squad gate exists.
  const player = playersData.find((p) => p.per90 && p.per90.fouls !== undefined && p.per90.shots !== undefined);
  assert(player, 'no player carries explicit shots and fouls');
  const { per90 } = rolesModel.resolvePer90(player, rolesData);
  close(per90.fouls, player.per90.fouls, 1e-12, 'explicit fouls overridden');
  close(per90.shots, player.per90.shots, 1e-12, 'explicit shots overridden');
});

test('quality inference is damped, not applied raw', () => {
  const base = rolesData.roles['poacher'];
  // A player who shoots far more than his archetype.
  const hot = { id: 'x', roleType: 'poacher', per90: { shots: base.shots * 2 } };
  const { per90 } = rolesModel.resolvePer90(hot, rolesData);
  const boxRatio = per90.boxTouches / base.boxTouches;
  assert(boxRatio > 1.2 && boxRatio < 1.8,
    `doubling shots should raise box touches, but damped (got x${boxRatio.toFixed(2)})`);
  close(boxRatio, 1 + rolesModel.DAMPING, 1e-9, 'damping factor');
});

test('quality inference does not leak across unrelated groups', () => {
  // Shooting more says nothing about passing volume or tackling, and letting
  // one strong attacking number inflate every metric is how a partially-known
  // player turns into a wholly fictional one.
  const base = rolesData.roles['poacher'];
  const hot = { id: 'x', roleType: 'poacher', per90: { shots: base.shots * 2 } };
  const { per90 } = rolesModel.resolvePer90(hot, rolesData);
  close(per90.touches, base.touches, 1e-9, 'touches should be untouched');
  close(per90.tackles, base.tackles, 1e-9, 'tackles should be untouched');
});

/* ------------------------------------------------------- minutes model */

test('minutes scenario weights sum to one for every player', () => {
  for (const player of playersData) {
    const resolved = rolesModel.resolvePer90(player, rolesData);
    const m = minutesModel.minutesModel(player, resolved.role);
    const total = m.scenarios.reduce((s, x) => s + x.weight, 0);
    close(total, 1, 1e-9, `${player.id} scenario weights`);
  }
});

test('playing-time thresholds are monotone', () => {
  for (const player of playersData) {
    const resolved = rolesModel.resolvePer90(player, rolesData);
    const m = minutesModel.minutesModel(player, resolved.role);
    assert(m.pPlay90 <= m.pPlay75Plus + 1e-12, `${player.id}: P(90) exceeds P(75+)`);
    assert(m.pPlay75Plus <= m.pPlay60Plus + 1e-12, `${player.id}: P(75+) exceeds P(60+)`);
    assert(m.pPlay60Plus <= m.pAppear + 1e-12, `${player.id}: P(60+) exceeds P(appear)`);
  }
});

test('defenders outlast forwards', () => {
  const pick = (id) => {
    const p = playersData.find((x) => x.id === id);
    return minutesModel.minutesModel(p, rolesModel.resolvePer90(p, rolesData).role);
  };
  // Compared at equal start probability, the role profile must do the work.
  const cb = { ...playersData.find((p) => p.id === 'van-dijk'), startProb: 0.85, benchProb: 0.1 };
  const fw = { ...playersData.find((p) => p.id === 'ekitike'), startProb: 0.85, benchProb: 0.1 };
  const cbM = minutesModel.minutesModel(cb, rolesModel.resolvePer90(cb, rolesData).role);
  const fwM = minutesModel.minutesModel(fw, rolesModel.resolvePer90(fw, rolesData).role);
  assert(cbM.pPlay90 > fwM.pPlay90, 'a centre-back should be likelier to finish than a forward');
  assert(pick('van-dijk').expectedMinutes > pick('marmoush').expectedMinutes, 'expected minutes ordering');
});

test('fatigue and a settled game pull minutes down', () => {
  // A midfielder with real rotation risk, chosen by profile rather than name.
  const p = playersData.find((x) => x.roleType === 'holding-mid' && x.startProb < 0.9)
    || playersData.find((x) => x.roleType === 'holding-mid');
  assert(p, 'no holding midfielder in the squad file');
  const role = rolesModel.resolvePer90(p, rolesData).role;
  const rested = minutesModel.minutesModel(p, role, { daysRest: 7 }).expectedMinutes;
  const tired = minutesModel.minutesModel(p, role, { daysRest: 2 }).expectedMinutes;
  const blowout = minutesModel.minutesModel(p, role, { blowoutProb: 0.9 }).expectedMinutes;
  assert(tired < rested, 'a short turnaround should reduce expected minutes');
  assert(blowout < rested, 'a game likely settled early should reduce expected minutes');
});

/* --------------------------------------------------- involvement layer */

test('possession shares are complementary and bounded', () => {
  const t = (id) => teamsData.find((x) => x.id === id);
  for (const [h, a] of [['man-city', 'hull'], ['hull', 'man-city'], ['fulham', 'man-utd']]) {
    const p = involvement.possessionShare(t(h), t(a));
    assert(p > 0.25 && p < 0.75, `possession out of plausible range: ${p}`);
  }
  const strong = involvement.possessionShare(t('man-city'), t('hull'));
  const weak = involvement.possessionShare(t('hull'), t('man-city'));
  assert(strong > weak, 'the stronger side should see more of the ball');
});

test('reconciliation moves the player aggregate toward the team total', () => {
  const raws = [{ i: 0, value: 3 }, { i: 1, value: 2 }, { i: 2, value: 1 }];
  const r = involvement.reconcileMetric({
    metric: 'shots', raws, teamExpected: 14, blendWeight: 0.7, minutesCovered: 9,
  });
  assert(r.diagnostics.reconciled, 'should have reconciled');
  const after = r.values.reduce((s, v) => s + v, 0);
  assert(after > 6, 'aggregate should rise toward the larger team projection');
  // The blend must sit between the two views, never outside them.
  const d = r.diagnostics;
  const lo = Math.min(d.teamExpected, d.bottomUpTeam);
  const hi = Math.max(d.teamExpected, d.bottomUpTeam);
  assert(d.blendedTeam >= lo - 1e-9 && d.blendedTeam <= hi + 1e-9, 'blend outside its inputs');
});

test('reconciliation is skipped rather than guessed when inputs are unusable', () => {
  const raws = [{ i: 0, value: 0 }];
  const r = involvement.reconcileMetric({
    metric: 'shots', raws, teamExpected: 12, blendWeight: 0.7, minutesCovered: 9,
  });
  assert(!r.diagnostics.reconciled, 'must not scale a zero aggregate');
  close(r.values[0], 0, 1e-12);
});

/* ------------------------------------------------------ matchup layer */

test('game state splits into proper probabilities', () => {
  const grid = goals.scoreMatrix(2.2, 0.9, -0.045, 10);
  const st = matchups.gameState(grid);
  close(st.homeWin + st.draw + st.awayWin, 1, 1e-9, '1X2');
  assert(st.home.chaseIndex < st.away.chaseIndex, 'the weaker side should expect to chase more');
  assert(st.away.attack > st.home.attack, 'the chasing side should shoot more');
  assert(st.home.fouls > st.away.fouls, 'the side protecting a lead should foul more');
});

test('a duel raises the defender fouls and the attacker fouls won together', () => {
  const slate = runSlate({ minEdge: 0 });
  const fixture = slate.fixtures.find((f) => f.id === 'mci-sun');
  const sunDefs = fixture.players.filter((p) => p.side === 'away' && p.line === 'DEF' && p.matchup);
  const cityAtt = fixture.players.filter((p) => p.side === 'home' && p.line !== 'DEF' && p.line !== 'GK' && p.matchup);

  const pressured = sunDefs.filter((p) => p.matchup.fouls > 1.05);
  assert(pressured.length > 0, 'a side defending this much should have pressured defenders');
  const drawing = cityAtt.filter((p) => p.matchup.foulsDrawn > 1.02);
  assert(drawing.length > 0, 'the attackers they foul must draw more fouls in return');
});

test('matchup multipliers stay within their declared bounds', () => {
  const slate = runSlate({ minEdge: 0 });
  for (const f of slate.fixtures) {
    for (const p of f.players) {
      if (!p.matchup) continue;
      for (const [key, v] of Object.entries(p.matchup)) {
        assert(v >= 0.6 - 1e-9 && v <= 1.6 + 1e-9, `${p.name} ${key} = ${v} out of bounds`);
      }
    }
  }
});

/* -------------------------------------------------- player event layer */

test('player market tails are monotone in the line', () => {
  const slate = runSlate({ minEdge: 0 });
  const byKey = new Map();
  for (const f of slate.fixtures) {
    for (const m of f.markets) {
      if (!m.playerId) continue;
      const key = `${m.matchId}|${m.family}|${m.playerId}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(m);
    }
  }
  let checked = 0;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.line - b.line);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].selections.find((s) => s.key === 'over').modelProb;
      const curr = sorted[i].selections.find((s) => s.key === 'over').modelProb;
      assert(curr <= prev + 1e-9, `${sorted[i].id}: P rises with the line`);
      checked++;
    }
  }
  assert(checked > 200, `expected a lot of player lines, only checked ${checked}`);
});

test('the shots -> SOT -> goals chain is ordered correctly', () => {
  const slate = runSlate({ minEdge: 0 });
  for (const f of slate.fixtures) {
    for (const p of f.players) {
      const x = p.expectations;
      assert(x.sot <= x.shots + 1e-6, `${p.name}: SOT (${x.sot}) exceeds shots (${x.shots})`);
      assert(x.goals <= x.sot + 0.15, `${p.name}: goals (${x.goals}) far exceed SOT (${x.sot})`);
    }
  }
});

test('every requested player market family is quoted somewhere', () => {
  const slate = runSlate({ minEdge: 0 });
  const families = new Set();
  for (const f of slate.fixtures) for (const m of f.markets) families.add(m.family);
  const wanted = [
    'player_shots', 'player_sot', 'player_goals', 'player_assists', 'player_chances',
    'player_fouls', 'player_fouls_drawn', 'player_booked',
    'player_tackles', 'player_tackles_won', 'player_interceptions', 'player_clearances',
    'player_def_actions', 'player_dribbles_att', 'player_dribbles', 'player_crosses',
    'player_offsides', 'player_aerials', 'player_box_touches', 'player_att3_touches',
    'player_touches', 'player_passes', 'player_passes_comp', 'player_prog_passes',
    'player_dispossessed', 'player_saves',
  ];
  for (const w of wanted) assert(families.has(w), `missing player market family: ${w}`);
});

test('goalkeepers get save markets and outfielders do not', () => {
  const slate = runSlate({ minEdge: 0 });
  const saveMarkets = [];
  for (const f of slate.fixtures) {
    for (const m of f.markets) if (m.family === 'player_saves') saveMarkets.push({ m, f });
  }
  assert(saveMarkets.length > 0, 'no save markets produced');
  for (const { m, f } of saveMarkets) {
    const player = f.players.find((p) => p.id === m.playerId);
    assert(player && player.line === 'GK', `${m.playerId} is not a goalkeeper`);
  }
});

test('booking probability responds to fouls and referee', () => {
  const player = { id: 't', cardProneness: 1.3 };
  const minutes = { minutesShare: 1, scenarios: [{ minutes: 90, weight: 1 }] };
  const low = playerEvents.bookingProbability({ foulExpectation: 0.6, minutes, player, refStrictness: 1 });
  const high = playerEvents.bookingProbability({ foulExpectation: 2.6, minutes, player, refStrictness: 1 });
  const strict = playerEvents.bookingProbability({ foulExpectation: 2.6, minutes, player, refStrictness: 1.2 });
  assert(high > low, 'more fouls must mean more cards');
  assert(strict > high, 'a stricter referee must mean more cards');
  assert(high > 0 && strict < 1, 'out of range');
});

test('red card probability stays rare and tracks the yellow', () => {
  const player = { cardProneness: 1.4 };
  const r = playerEvents.redCardProbability({ yellowProb: 0.3, player, refStrictness: 1.1 });
  assert(r > 0 && r < 0.05, `red card probability implausible: ${r}`);
});

test('a player who cannot play carries no expectation', () => {
  const dist = playerEvents.distributionFor(0, { minutesShare: 0, scenarios: [] }, 0.25, 10);
  close(dist.atLeast(1), 0, 1e-12);
  close(dist.atLeast(0), 1, 1e-12);
});

/* ------------------------------------------- two-way team/player chain */

test('team cards blend the top-down rating with the player aggregate', () => {
  const slate = runSlate({ minEdge: 0 });
  for (const f of slate.fixtures) {
    const c = f.expectations.cards;
    const top = c.topDown.home + c.topDown.away;
    const bottom = c.bottomUp.home + c.bottomUp.away;
    assert(bottom > 0, 'player aggregate produced no cards');
    const lo = Math.min(top, bottom) - 1e-6;
    const hi = Math.max(top, bottom) + 1e-6;
    assert(c.total >= lo && c.total <= hi,
      `${f.id}: blended ${c.total} outside [${lo}, ${hi}]`);
  }
});

test('the player aggregate is in the same ballpark as the team rating', () => {
  // A large divergence means the player data or the team rating is wrong; this
  // is the check that would catch it.
  const slate = runSlate({ minEdge: 0 });
  for (const f of slate.fixtures) {
    const c = f.expectations.cards;
    const top = c.topDown.home + c.topDown.away;
    const bottom = c.bottomUp.home + c.bottomUp.away;
    const ratio = bottom / top;
    assert(ratio > 0.6 && ratio < 1.6,
      `${f.id}: player card aggregate ${bottom.toFixed(2)} vs team rating ${top.toFixed(2)}`);
  }
});

test('involvement shares sum to one and are led by the right players', () => {
  const slate = runSlate({ minEdge: 0 });
  const f = slate.fixtures.find((x) => x.id === 'mci-sun');
  for (const side of ['home', 'away']) {
    for (const [metric, table] of Object.entries(f.shares[side])) {
      const total = Object.values(table).reduce((s, v) => s + v, 0);
      close(total, 1, 1e-9, `${side} ${metric} shares`);
    }
  }
  // Structural check rather than a named player: the leading shot share must
  // belong to a forward, and must be a plausible share of the team's output.
  const [topId, topShare] = Object.entries(f.shares.home.shots).sort((a, b) => b[1] - a[1])[0];
  const leader = f.players.find((p) => p.id === topId);
  assert(leader && ['FWD', 'WIDE'].includes(leader.line),
    `expected a forward to lead the shot share, got ${topId} (${leader && leader.line})`);
  assert(topShare > 0.12 && topShare < 0.45, `implausible leading shot share: ${topShare}`);
});

test('squad coverage is reported and plausible', () => {
  const slate = runSlate({ minEdge: 0 });
  for (const f of slate.fixtures) {
    for (const side of ['home', 'away']) {
      const c = f.projections[side].coverage;
      assert(c > 0.6 && c <= 1, `${f.id} ${side}: coverage ${c} implausible`);
    }
  }
});


/* -------------------------------------------------- squad verification */

test('the last transfer window close is identified correctly', () => {
  close(squadStatus.lastWindowClose('2026-09-20') === '2026-09-01' ? 1 : 0, 1, 0, 'Sept 2026');
  assert(squadStatus.lastWindowClose('2026-08-15') === '2026-02-02', 'mid-window should look back to February');
});

test('a squad verified before the window closed is rejected', () => {
  const file = { _squadVerification: { verifiedAt: '2026-05-01' }, players: [{ id: 'a', verifiedAt: '2026-05-01' }] };
  const a = squadStatus.assessSquad(file, '2026-09-20');
  assert(!a.verified, 'pre-window verification must not count');
  assert(/before the transfer window/.test(a.reason), `unhelpful reason: ${a.reason}`);
});

test('a squad verified after the window closed is accepted', () => {
  const file = { _squadVerification: { verifiedAt: '2026-09-05' }, players: [{ id: 'a', verifiedAt: '2026-09-05' }] };
  assert(squadStatus.assessSquad(file, '2026-09-20').verified, 'post-window verification should count');
});

test('an unverified squad suppresses player picks entirely', () => {
  const slate = runSlate({ minEdge: 0.02 });
  if (slate.squad.verified) return; // nothing to prove once verified
  assert(slate.playerPicksSuppressed, 'gate should be closed');
  const leaked = slate.picks.filter((p) => p.playerId);
  assert(leaked.length === 0,
    `${leaked.length} player picks leaked past the gate, e.g. ${leaked[0] && leaked[0].selection}`);
  assert(slate.warnings.some((w) => w.startsWith('SQUADS UNVERIFIED')), 'must warn loudly');
});

test('team and match markets are unaffected by the squad gate', () => {
  const slate = runSlate({ minEdge: 0.02 });
  assert(slate.picks.length > 0, 'team markets should still produce picks');
  const categories = new Set(slate.picks.map((p) => p.category));
  assert(!categories.has('Player props'), 'player props must not appear while gated');
  assert(categories.size >= 2, 'team-level categories should survive');
});

test('the fair sheet honours the same gate', () => {
  const sheet = fairSheetFn({ requiredEdge: 0.06 });
  if (sheet.squad.verified) return;
  assert(sheet.playerRowsSuppressed, 'fair sheet gate should be closed');
  for (const f of sheet.fixtures) {
    const leaked = f.all.filter((r) => r.playerId);
    assert(leaked.length === 0, `${f.id}: player rows leaked into the fair sheet`);
  }
});

test('overriding the gate is possible but must be explicit', () => {
  const slate = runSlate({ minEdge: 0.02, allowUnverifiedSquads: true });
  assert(!slate.playerPicksSuppressed, 'explicit override should open the gate');
  assert(slate.picks.some((p) => p.playerId), 'player picks should return when overridden');
});

test('players removed in a transfer window are gone from the squad', () => {
  const gone = ['salah', 'casemiro', 'ugarte', 'savinho', 'bernardo', 'semenyo', 'jimenez', 'harry-wilson', 'lacroix', 'konate'];
  for (const id of gone) {
    assert(!playersData.some((p) => p.id === id), `${id} has left his club but is still in the squad file`);
  }
});


/* ------------------------------------------------------- FotMob adapter */

test('FotMob fixtures map to the right league', () => {
  const fx = fotmob.mapFixtures(samples.fixturesByDate);
  assert(fx.length === 2, `expected 2 Premier League fixtures, got ${fx.length}`);
  assert(fx[0].home === 'Bournemouth' && fx[0].away === 'Liverpool', 'wrong fixture mapped');
  assert(fx[0].fotmobMatchId === 4321, 'match id lost');
});

test('FotMob fixtures fail loudly when the league is absent', () => {
  let threw = false;
  try {
    fotmob.mapFixtures({ leagues: [{ primaryId: 55, name: 'Serie A', matches: [] }] });
  } catch (err) {
    threw = true;
    assert(/no Premier League/.test(err.message), `unhelpful error: ${err.message}`);
    assert(/Serie A/.test(err.message), 'error should name what it did see');
  }
  assert(threw, 'must not silently return nothing');
});

test('flattenStats handles both flat and grouped containers', () => {
  const flat = fotmob.flattenStats(samples.playerFlat.mainLeague.stats);
  close(fotmob.statValue(flat, 'goals'), 8, 1e-9, 'flat goals');
  close(fotmob.statValue(flat, 'minutes'), 1800, 1e-9, 'flat minutes');

  const grouped = fotmob.flattenStats(samples.playerGrouped.stats);
  close(fotmob.statValue(grouped, 'fouls'), 61, 1e-9, 'grouped fouls through a nested object value');
  close(fotmob.statValue(grouped, 'interceptions'), 40, 1e-9, 'second group not reached');
});

test('season totals convert to correct per-90 rates', () => {
  const flat = fotmob.flattenStats(samples.playerFlat.mainLeague.stats);
  const { per90, reliable } = fotmob.toPer90(flat);
  assert(reliable, '1800 minutes should be a usable sample');
  // 62 shots in 1800 minutes = 3.1 per 90.
  close(per90.shots, 3.1, 1e-6, 'shots per 90');
  close(per90.goals, 0.4, 1e-6, 'goals per 90');
  close(per90.fouls, 0.7, 1e-6, 'fouls per 90');
  close(per90.foulsDrawn, 1.65, 1e-6, 'fouls won per 90');
});

test('a thin minutes sample is rejected rather than extrapolated', () => {
  const flat = fotmob.flattenStats(samples.playerThin.mainLeague.stats);
  const { per90, reliable } = fotmob.toPer90(flat);
  assert(!reliable, '95 minutes must not be treated as a usable sample');
  assert(per90 === null, 'must return nothing rather than a 1.9-goals-per-90 fantasy');
});

test('card proneness is derived from cards per foul and stays bounded', () => {
  const calm = fotmob.cardProneness({ 'yellow cards': 1, 'fouls committed': 40 });
  const reckless = fotmob.cardProneness({ 'yellow cards': 9, 'fouls committed': 61 });
  assert(reckless > calm, 'a higher card-per-foul rate must raise proneness');
  assert(calm >= 0.5 && reckless <= 1.8, `out of bounds: ${calm}, ${reckless}`);
  // Too small a sample to judge: fall back to neutral.
  close(fotmob.cardProneness({ 'yellow cards': 2, 'fouls committed': 6 }), 1, 1e-9, 'small sample');
});

test('a mapped player carries real rates and a sensible role', () => {
  const p = fotmob.mapPlayer(samples.playerFlat, { teamId: 'sample', verifiedAt: '2026-09-20' });
  assert(p.id === 'flat-statline', `bad slug: ${p.id}`);
  assert(p.team === 'sample' && p.verifiedAt === '2026-09-20', 'provenance lost');
  // RW with 3.1 shots per 90 is an inside forward, not a crosser.
  assert(p.roleType === 'inside-forward', `wrong role: ${p.roleType}`);
  assert(p.flank === 'right', `wrong flank: ${p.flank}`);
  assert(p.statsReliable && p.per90.shots > 3, 'rates missing');
  assert(p.source === 'fotmob', 'source not recorded');
});

test('a mapped defensive midfielder is classified from his output', () => {
  const p = fotmob.mapPlayer(samples.playerGrouped, { teamId: 'sample', verifiedAt: '2026-09-20' });
  assert(p.roleType === 'holding-mid', `wrong role: ${p.roleType}`);
  close(p.per90.fouls, (61 / 2250) * 90, 1e-6, 'fouls per 90');
  assert(p.cardProneness > 1, 'nine yellows in 61 fouls should read as card-prone');
});

test('a thin-sample player is mapped without inventing rates', () => {
  const p = fotmob.mapPlayer(samples.playerThin, { teamId: 'sample', verifiedAt: '2026-09-20' });
  assert(!p.statsReliable, 'should be flagged unreliable');
  assert(p.per90 === undefined, 'must not carry fabricated per-90 numbers');
});

test('squad mapping skips staff and keeps every player', () => {
  const squadList = fotmob.mapSquad(samples.squadPayload, { teamId: 'sample' });
  assert(squadList.length === 4, `expected 4 players, got ${squadList.length}`);
  assert(!squadList.some((p) => p.name === 'A Manager'), 'the coach must not be in the squad');
  assert(squadList.every((p) => p.team === 'sample'), 'team not stamped');
});

test('squad mapping fails loudly on an unknown shape', () => {
  let threw = false;
  try { fotmob.mapSquad({ nothing: true }, { teamId: 'x' }); } catch (err) {
    threw = true;
    assert(err.code === 'FOTMOB_SHAPE', 'should be a shape error');
    assert(/nothing/.test(err.message), 'error should describe what it saw');
  }
  assert(threw, 'must not return an empty squad silently');
});

test('line-ups unpack from the formation grid, and the referee is found', () => {
  const m = fotmob.mapMatchDetails(samples.matchDetails);
  assert(m.referee === 'Sample Referee', `referee missed: ${m.referee}`);
  assert(m.sides.length === 2, 'both sides expected');
  assert(m.sides[0].starters.length === 11, `home XI wrong: ${m.sides[0].starters.length}`);
  assert(m.sides[1].starters.length === 11, `away XI wrong: ${m.sides[1].starters.length}`);
  assert(m.sides[0].bench.length === 2, 'bench lost');
  assert(m.lineupsConfirmed, 'two full XIs should count as confirmed');
  assert(m.sides[0].formation === '4-3-3', 'formation lost');
});

test('start probability from history is shrunk toward the mean', () => {
  const nailed = fotmob.startProbFromHistory({ starts: 5, appearances: 5, teamMatches: 5 });
  assert(nailed.startProb < 0.95, 'five from five must not read as certainty');
  assert(nailed.startProb > 0.7, 'but should still be high');
  const rotated = fotmob.startProbFromHistory({ starts: 1, appearances: 4, teamMatches: 5 });
  assert(rotated.startProb < nailed.startProb, 'ordering wrong');
  assert(rotated.benchProb > nailed.benchProb, 'a rotation player has more bench mass');
});

test('every FotMob role maps to a real archetype', () => {
  const archetypes = new Set(Object.keys(rolesData.roles));
  for (const [pos, role] of Object.entries(fotmob.POSITION_TO_ROLE)) {
    assert(archetypes.has(role), `position ${pos} maps to unknown archetype ${role}`);
  }
  // And the refinements must land somewhere real too.
  for (const pos of Object.keys(fotmob.POSITION_TO_ROLE)) {
    for (const stats of [{}, { shots: 4, aerials: 7, keyPasses: 3, passes: 75, tackles: 3, crosses: 4 }]) {
      const r = fotmob.inferRoleType(pos, stats);
      assert(archetypes.has(r), `inferRoleType(${pos}) produced unknown archetype ${r}`);
    }
  }
});

/* --------------------------------------------------------------- report */

console.log(`\n\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.message}`);
  process.exit(1);
}

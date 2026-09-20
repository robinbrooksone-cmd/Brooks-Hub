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
const { runSlate, buildParlays } = require('../src/engine');

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

/* --------------------------------------------------------------- report */

console.log(`\n\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.message}`);
  process.exit(1);
}

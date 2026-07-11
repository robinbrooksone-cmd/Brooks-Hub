#!/usr/bin/env node
/**
 * Lightweight sanity checks for the core math, run with `npm run selfcheck`.
 * Not a full test suite — just enough to catch a broken devig/Elo/Kelly formula
 * before it silently produces bad "value" recommendations.
 */
const assert = require('assert');
const { devigMultiplicative, devigShin, overroundPct } = require('./analysis/devig');
const { buildConsensus, buildSingleSidedConsensus } = require('./analysis/consensus');
const { updateRatings, matchProbabilities, expectedScore } = require('./analysis/elo');
const { blendProbabilities } = require('./analysis/fairValue');
const { kellyFraction, median } = require('./analysis/valueFinder');
const { fairTryScorerProb } = require('./analysis/propsModel');

function approxEqual(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `expected ${a} ~= ${b}`);
}

function checkDevig() {
  const odds = [1.83, 2.0]; // 1/1.83 + 1/2.0 = 1.0464 -> ~4.6% overround two-way market
  const multi = devigMultiplicative(odds);
  approxEqual(multi[0] + multi[1], 1);
  assert(multi[0] > 0 && multi[0] < 1);

  const shin = devigShin(odds);
  approxEqual(shin[0] + shin[1], 1);

  assert(overroundPct(odds) > 4 && overroundPct(odds) < 6);

  // A three-way market (home/draw/away) should also normalize correctly.
  const threeWay = devigShin([2.5, 4.5, 3.0]);
  approxEqual(threeWay.reduce((a, b) => a + b, 0), 1);

  console.log('devig: OK');
}

function checkConsensus() {
  const rows = [
    { bookmaker: 'BookA', selection: 'Home', price: 1.9 },
    { bookmaker: 'BookA', selection: 'Away', price: 2.1 },
    { bookmaker: 'BookB', selection: 'Home', price: 1.95 },
    { bookmaker: 'BookB', selection: 'Away', price: 2.05 },
  ];
  const consensus = buildConsensus(rows, 2);
  assert(consensus, 'consensus should be built with 2 books');
  approxEqual(consensus.probs.Home + consensus.probs.Away, 1);
  assert.strictEqual(consensus.bookCount, 2);

  const notEnough = buildConsensus(rows.slice(0, 2), 2);
  assert.strictEqual(notEnough, null, 'should refuse consensus with only 1 book when min=2');

  console.log('consensus: OK');
}

function checkElo() {
  approxEqual(expectedScore(1500, 1500), 0.5);

  const { homeRating, awayRating } = updateRatings(1500, 1500, 30, 10, { kFactor: 32, homeAdvantage: 0 });
  assert(homeRating > 1500, 'winner rating should increase');
  assert(awayRating < 1500, 'loser rating should decrease');

  const bigWin = updateRatings(1500, 1500, 50, 0, { kFactor: 32, homeAdvantage: 0 });
  const closeWin = updateRatings(1500, 1500, 21, 20, { kFactor: 32, homeAdvantage: 0 });
  assert(
    bigWin.homeRating - 1500 > closeWin.homeRating - 1500,
    'bigger margin of victory should move rating more'
  );

  const probs = matchProbabilities(1600, 1500);
  approxEqual(probs.home + probs.draw + probs.away, 1);
  assert(probs.home > probs.away, 'higher-rated home team should be favored');

  console.log('elo: OK');
}

function checkBlend() {
  const blended = blendProbabilities({ A: 0.6, B: 0.4 }, { A: 0.5, B: 0.5 }, { consensusWeight: 0.65, eloWeight: 0.35 });
  approxEqual(blended.A + blended.B, 1);
  approxEqual(blended.A, 0.6 * 0.65 + 0.5 * 0.35);

  console.log('blend: OK');
}

function checkKelly() {
  // Fair coin, price implies exactly fair odds -> zero edge -> zero stake.
  approxEqual(kellyFraction(2.0, 0.5, 1), 0);
  // Priced generously above fair value -> positive but capped stake.
  const k = kellyFraction(2.5, 0.5, 0.25);
  assert(k > 0 && k <= 0.25);
  // Bad price below fair value -> no stake (never negative).
  approxEqual(kellyFraction(1.5, 0.5, 1), 0);

  assert.strictEqual(median([1, 2, 3]), 2);
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);

  console.log('kelly/median: OK');
}

function checkPropsModel() {
  // Poisson tail: P(>=1) = 1 - e^-lambda. Zero expected tries -> zero chance.
  approxEqual(fairTryScorerProb(0), 0);
  // Higher expected tries should give a monotonically higher scoring probability.
  assert(fairTryScorerProb(2) > fairTryScorerProb(1));
  assert(fairTryScorerProb(1) > 0 && fairTryScorerProb(1) < 1);
  approxEqual(fairTryScorerProb(1), 1 - Math.exp(-1));

  console.log('propsModel: OK');
}

function checkSingleSidedConsensus() {
  const rows = [
    { bookmaker: 'BookA', price: 3.0 },
    { bookmaker: 'BookB', price: 3.1 },
    { bookmaker: 'BookA', price: 999 }, // duplicate bookmaker should not double-count
  ];
  const consensus = buildSingleSidedConsensus(rows, 1);
  assert(consensus, 'should build consensus from single-sided prop prices');
  assert.strictEqual(consensus.bookCount, 2, 'duplicate bookmaker entries should collapse to one');
  approxEqual(consensus.avgProb, (1 / 3.0 + 1 / 3.1) / 2);

  const notEnough = buildSingleSidedConsensus(rows, 5);
  assert.strictEqual(notEnough, null);

  console.log('buildSingleSidedConsensus: OK');
}

checkDevig();
checkConsensus();
checkElo();
checkBlend();
checkKelly();
checkPropsModel();
checkSingleSidedConsensus();
console.log('\nAll self-checks passed.');

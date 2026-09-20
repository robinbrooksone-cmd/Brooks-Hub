#!/usr/bin/env node
'use strict';

/**
 * Generates a SAMPLE Sportingbet-shaped price board so the site is fully
 * functional without live odds access.
 *
 * It is deliberately NOT the model's own prices with a margin bolted on - that
 * would show zero edge everywhere and teach you nothing. Instead each line is
 * perturbed in logit space to simulate a bookmaker holding a genuinely
 * different opinion, then margin is applied with a favourite-longshot tilt so
 * the shape matches how a real book prices a coupon.
 *
 * The board is stamped source:"sample". The UI and CLI both surface that, and
 * every edge computed against it is illustrative only. Replace it with real
 * prices via `npm run odds:import` before betting anything.
 */

const path = require('path');
const { buildFixtureModel } = require('../src/model/markets');
const { makeRng, normalInv } = require('../src/lib/stats');
const { saveBoard, roundToLadder } = require('../src/adapters/sportingbet');

const DATA = path.join(__dirname, '..', 'data');
const league = require(path.join(DATA, 'league.json'));
const teams = require(path.join(DATA, 'teams.json')).teams;
const players = require(path.join(DATA, 'players.json')).players;
const referees = require(path.join(DATA, 'referees.json')).referees;
const fixturesFile = require(path.join(DATA, 'fixtures.json'));

/** Bookmaker margin by market family, matching typical Entain coupon shapes. */
const MARGIN = {
  match_goals: 0.045,
  btts: 0.050,
  team_goals: 0.060,
  match_corners: 0.062,
  team_corners: 0.072,
  match_cards: 0.075,
  team_cards: 0.082,
  match_shots: 0.070,
  team_shots: 0.075,
  player_shots: 0.135,
  player_sot: 0.145,
  player_fouls: 0.160,
  player_goals: 0.125,
  player_booked: 0.155,
};

/** How far the book's opinion drifts from ours, in logit units. */
const DISAGREEMENT = {
  match_goals: 0.09,
  btts: 0.09,
  team_goals: 0.11,
  match_corners: 0.13,
  team_corners: 0.16,
  match_cards: 0.16,
  team_cards: 0.18,
  match_shots: 0.15,
  team_shots: 0.17,
  player_shots: 0.22,
  player_sot: 0.24,
  player_fouls: 0.26,
  player_goals: 0.20,
  player_booked: 0.25,
};

const logit = (p) => Math.log(p / (1 - p));
const expit = (x) => 1 / (1 + Math.exp(-x));

/**
 * Apply margin with a favourite-longshot tilt: q_i proportional to p_i^(1/k),
 * with k solved so the book sums to 1 + margin. This is the inverse of the
 * power de-vig, so a power de-vig recovers the underlying prices cleanly.
 */
function applyMargin(probs, margin) {
  const target = 1 + margin;
  let lo = 0.5;
  let hi = 1.0;
  const total = (k) => probs.reduce((s, p) => s + Math.pow(p, k), 0);
  for (let i = 0; i < 200; i++) {
    const k = 0.5 * (lo + hi);
    if (total(k) > target) lo = k;
    else hi = k;
  }
  const k = 0.5 * (lo + hi);
  return probs.map((p) => Math.pow(p, k));
}

function main() {
  const date = process.argv[2] || fixturesFile.date;
  const rng = makeRng(88_206_041);
  const prices = [];
  let dropped = 0;

  for (const fixture of fixturesFile.fixtures) {
    const model = buildFixtureModel(fixture, { teams, league, players, referees });

    for (const market of model.markets) {
      const margin = MARGIN[market.family] ?? 0.08;
      const drift = DISAGREEMENT[market.family] ?? 0.15;

      // Books do not quote every conceivable line; thin ones get left off.
      const extreme = market.selections.some((s) => s.modelProb < 0.035 || s.modelProb > 0.965);
      if (extreme || rng() < 0.06) {
        dropped++;
        continue;
      }

      // One shared shock per market keeps the two sides of a line coherent.
      const shock = normalInv(Math.min(0.999, Math.max(0.001, rng()))) * drift;
      const perturbed = market.selections.map((s, i) => {
        const signed = i === 0 ? shock : -shock;
        return Math.min(0.985, Math.max(0.015, expit(logit(s.modelProb) + signed)));
      });

      const sum = perturbed.reduce((a, b) => a + b, 0);
      const normalised = perturbed.map((p) => p / sum);
      const withMargin = applyMargin(normalised, margin);

      market.selections.forEach((s, i) => {
        prices.push({
          marketId: market.id,
          selection: s.key,
          odds: roundToLadder(1 / withMargin[i]),
        });
      });
    }
  }

  const board = {
    bookmaker: 'Sportingbet',
    date,
    capturedAt: new Date().toISOString(),
    source: 'sample',
    notes:
      'SAMPLE BOARD - not real Sportingbet prices. Generated to exercise the full pricing pipeline. Any edge shown against it is illustrative. Import real prices before staking.',
    prices,
  };

  const file = saveBoard(date, board);
  console.log(`Wrote ${prices.length} prices (${dropped} lines not quoted) to ${file}`);
}

main();

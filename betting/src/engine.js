'use strict';

const path = require('path');
const fs = require('fs');

const { buildFixtureModel } = require('./model/markets');
const { priceSelection, grade } = require('./pricing/edge');
const { buildBestParlay, priceParlay } = require('./pricing/parlay');
const sportingbet = require('./adapters/sportingbet');

const DATA = path.join(__dirname, '..', 'data');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function loadContext() {
  return {
    league: readJson('league.json'),
    teams: readJson('teams.json').teams,
    players: readJson('players.json').players,
    referees: readJson('referees.json').referees,
    roles: readJson('roles.json'),
    fixturesFile: readJson('fixtures.json'),
  };
}

/**
 * Price every selection on the board and return the ones worth betting.
 *
 * A selection only becomes a "pick" when the book actually quotes it AND the
 * model's probability beats the de-vigged fair probability by more than the
 * threshold. Everything else is reported but not recommended.
 */
function runSlate(options = {}) {
  const {
    date,
    minEdge = 0.02,
    minOdds = 1.2,
    maxOdds = 15,
    bankroll = 100,
    kellyCap = 0.25,
    board: providedBoard,
  } = options;

  const ctx = loadContext();
  const slateDate = date || ctx.fixturesFile.date;
  const board = providedBoard || sportingbet.loadBoard(slateDate);

  const fixtures = [];
  const allPicks = [];

  for (const fixture of ctx.fixturesFile.fixtures) {
    const model = buildFixtureModel(fixture, ctx);
    const fixturePicks = [];
    const markets = [];

    for (const market of model.markets) {
      const quoted = market.selections.map((s) => sportingbet.priceFor(board, market.id, s.key));
      const hasBoth = quoted.every((o) => o && o > 1);

      const enriched = market.selections.map((s, i) => {
        const base = {
          ...s,
          marketId: market.id,
          odds: quoted[i],
          quoted: Boolean(quoted[i]),
        };
        if (!hasBoth) return base;

        const priced = priceSelection({
          modelProb: s.modelProb,
          marketOdds: quoted,
          index: i,
          dataQuality: market.dataQuality,
          kellyFractionCap: kellyCap,
          bankroll,
        });
        return { ...base, ...priced, grade: grade(priced.evPct) };
      });

      markets.push({ ...market, selections: enriched });

      if (!hasBoth) continue;

      for (const sel of enriched) {
        if (sel.edge === undefined) continue;
        if (sel.edge < minEdge) continue;
        // Edge is measured against the de-vigged fair price, but you are paid
        // at the offered price. A selection can beat the fair price and still
        // lose money once the margin is handed over, so both must clear.
        if (sel.ev <= 0) continue;
        if (sel.odds < minOdds || sel.odds > maxOdds) continue;

        const pick = {
          // Identity used by the parlay correlation model.
          matchId: fixture.id,
          marketId: market.id,
          family: market.family,
          team: market.team,
          playerId: market.playerId || null,
          side: sel.side,

          // Display
          fixtureLabel: `${model.home.short} v ${model.away.short}`,
          kickoff: fixture.localTime,
          category: market.category,
          market: market.label,
          selection: sel.label,
          playerName: market.playerName || null,
          note: market.note || null,

          // Numbers
          modelProb: sel.modelProb,
          marketFairProb: sel.marketFairProb,
          odds: sel.odds,
          modelFairOdds: sel.modelFairOdds,
          edge: sel.edge,
          edgePct: sel.edgePct,
          ev: sel.ev,
          evPct: sel.evPct,
          kelly: sel.kelly,
          stake: sel.stake,
          confidence: sel.confidence,
          grade: sel.grade,
          overround: sel.overround,
          devigMethod: sel.devigMethod,
        };
        fixturePicks.push(pick);
        allPicks.push(pick);
      }
    }

    fixturePicks.sort((a, b) => b.ev - a.ev);

    fixtures.push({
      id: fixture.id,
      kickoff: fixture.kickoff,
      localTime: fixture.localTime,
      venue: fixture.venue,
      home: { id: model.home.id, name: model.home.name, short: model.home.short },
      away: { id: model.away.id, name: model.away.name, short: model.away.short },
      referee: model.referee.name,
      refereeConfirmed: Boolean(fixture.referee),
      expectations: model.expectations,
      markets,
      picks: fixturePicks,
      // Player layer: the projection chain behind every player market.
      players: model.players,
      shares: model.shares,
      projections: model.projections,
      matchups: model.matchups,
    });
  }

  allPicks.sort((a, b) => b.ev - a.ev);

  return {
    date: slateDate,
    competition: ctx.fixturesFile.competition,
    matchweek: ctx.fixturesFile.matchweek,
    board: board ? board.meta : null,
    dataWarning: !board
      ? 'No price board found for this date - model probabilities only, no edges computed.'
      : board.meta.isLiveData
        ? null
        : 'Running on SAMPLE prices, not live Sportingbet odds. Edges shown are illustrative until you import a real board.',
    fixtures,
    picks: allPicks,
    summary: {
      fixtureCount: fixtures.length,
      marketsPriced: fixtures.reduce((s, f) => s + f.markets.length, 0),
      pickCount: allPicks.length,
      byCategory: allPicks.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

/**
 * Build suggested parlays.
 *
 * Two flavours, because they are genuinely different products:
 *  - "accumulator": one leg per match, so the legs are independent and
 *    multiplying the odds is mathematically correct.
 *  - "sameGame": legs concentrated in one match, priced through the copula,
 *    with the caveat that the real SGP price will be shaded by the book.
 */
function buildParlays(slate, options = {}) {
  const { bankroll = 100, maxLegs = 4, minLegs = 3 } = options;
  const pool = slate.picks.filter((p) => p.ev > 0);
  if (pool.length === 0) return { accumulator: null, sameGame: null, singles: [] };

  const accumulator = buildBestParlay(pool, {
    minLegs,
    maxLegs,
    maxPerMatch: 1, // forces genuine independence
    minJointProb: 0.10,
    bankroll,
  });

  // Best same-game combination: search each match separately, keep the best.
  let sameGame = null;
  const byMatch = pool.reduce((acc, p) => {
    (acc[p.matchId] = acc[p.matchId] || []).push(p);
    return acc;
  }, {});
  for (const legs of Object.values(byMatch)) {
    if (legs.length < minLegs) continue;
    const candidate = buildBestParlay(legs, {
      minLegs,
      maxLegs,
      maxPerMatch: maxLegs,
      minJointProb: 0.08,
      bankroll,
    });
    if (candidate && (!sameGame || candidate.score > sameGame.score)) sameGame = candidate;
  }

  return {
    accumulator,
    sameGame,
    singles: slate.picks.slice(0, 10),
  };
}

module.exports = { loadContext, runSlate, buildParlays, priceParlay };

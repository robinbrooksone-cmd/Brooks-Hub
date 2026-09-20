'use strict';

const path = require('path');
const fs = require('fs');

const { buildFixtureModel } = require('./model/markets');
const { priceSelection, grade } = require('./pricing/edge');
const { buildBestParlay, priceParlay } = require('./pricing/parlay');
const sportingbet = require('./adapters/sportingbet');
const { assessSquad, isPlayerMarket } = require('./model/squadStatus');

const DATA = path.join(__dirname, '..', 'data');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function loadContext() {
  const playersFile = readJson('players.json');
  return {
    league: readJson('league.json'),
    teams: readJson('teams.json').teams,
    playersFile,
    players: playersFile.players,
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
    allowUnverifiedSquads = false,
  } = options;

  const ctx = loadContext();
  const slateDate = date || ctx.fixturesFile.date;

  // Fail closed on stale squads. Player markets are still priced - they become
  // useful the moment the roster is refreshed - but they cannot become
  // recommendations until someone has confirmed who is actually at the club.
  const squad = assessSquad(ctx.playersFile, slateDate);
  const suppressPlayerPicks = !squad.verified && !allowUnverifiedSquads;
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

      markets.push({
        ...market,
        selections: enriched,
        squadUnverified: isPlayerMarket(market) && !squad.verified,
      });

      if (!hasBoth) continue;

      const playerMarket = isPlayerMarket(market);
      if (playerMarket && suppressPlayerPicks) continue;

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

  const warnings = [];
  if (!squad.verified) {
    warnings.push(
      `SQUADS UNVERIFIED - ${squad.reason} Player markets are priced but withheld from picks; ` +
      'a pick on a player who has left the club is worse than no pick at all. ' +
      'Run scripts/import-squad.js with a confirmed roster to re-enable them.'
    );
  }
  if (!board) {
    warnings.push('No price board found for this date - model probabilities only, no edges computed.');
  } else if (!board.meta.isLiveData) {
    warnings.push('Running on SAMPLE prices, not live Sportingbet odds. Edges shown are illustrative until you import a real board.');
  }

  return {
    date: slateDate,
    competition: ctx.fixturesFile.competition,
    matchweek: ctx.fixturesFile.matchweek,
    board: board ? board.meta : null,
    squad,
    playerPicksSuppressed: suppressPlayerPicks,
    warnings,
    dataWarning: warnings.length ? warnings[0] : null,
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

/**
 * Fair-price sheet: the model's own prices, with no bookmaker board involved.
 *
 * This is what you need when you have a coupon in front of you but no machine
 * -readable odds. For every selection it gives the model probability, the fair
 * (zero-margin) price, and the minimum price worth taking once a margin of
 * safety is demanded. Compare each against the screen by hand.
 *
 * Selections are ranked by CONVICTION rather than edge, because without a board
 * there is no edge to measure. Conviction rewards a market where the model has
 * a real opinion and the inputs behind it are trustworthy, and it penalises the
 * extremes where a small modelling error moves the price a long way.
 */
function fairSheet(options = {}) {
  const {
    date,
    requiredEdge = 0.06,
    minProb = 0.15,
    maxProb = 0.85,
    perCategory = 14,
  } = options;

  const ctx = loadContext();
  const slateDate = date || ctx.fixturesFile.date;
  const squad = assessSquad(ctx.playersFile, slateDate);
  const fixtures = [];

  for (const fixture of ctx.fixturesFile.fixtures) {
    const model = buildFixtureModel(fixture, ctx);
    const rows = [];

    for (const market of model.markets) {
      // Stale squads cannot produce trustworthy player rows.
      if (market.playerId && !squad.verified && !options.allowUnverifiedSquads) continue;

      // One row per MARKET, carrying both sides. A coupon quotes both, and the
      // value can sit on either, so collapsing to a single "preferred" side
      // would throw away half of what the sheet is for.
      const primary = market.selections.find((s) => s.key === 'over' || s.key === 'yes');
      const secondary = market.selections.find((s) => s.key === 'under' || s.key === 'no');
      if (!primary || !secondary) continue;

      const p = primary.modelProb;
      if (p < minProb || p > maxProb) continue;

      const price = (prob) => ({
        prob,
        fair: 1 / prob,
        // The shortest price worth taking once a margin of safety is demanded.
        target: (1 + requiredEdge) / prob,
      });

      // Without a board there is no edge to rank by, so rank by how USEFUL the
      // row is to someone holding a coupon. That is not the same as how extreme
      // the model's view is: a 13%-to-hit line is where the model is least
      // reliable and the bookmaker's margin heaviest, so surfacing those first
      // is actively unhelpful. 4p(1-p) peaks at an even-money line and falls
      // away at the extremes, which is the band actually worth shopping.
      const interest = 4 * p * (1 - p) * market.dataQuality;

      rows.push({
        matchId: fixture.id,
        marketId: market.id,
        family: market.family,
        category: market.category,
        team: market.team,
        playerId: market.playerId || null,
        playerName: market.playerName || null,
        market: market.label,
        note: market.note || null,
        expectation: market.expectation ?? null,
        dataQuality: market.dataQuality,
        interest,
        over: { key: primary.key, label: primary.label, ...price(p) },
        under: { key: secondary.key, label: secondary.label, ...price(1 - p) },
      });
    }

    rows.sort((a, b) => b.interest - a.interest);

    const byCategory = {};
    for (const row of rows) {
      (byCategory[row.category] = byCategory[row.category] || []).push(row);
    }
    // Cap each family before trimming the category. Shots alone produce four
    // lines per player across two dozen players, so without this the player
    // section is nothing but shots and every other market type is pushed off
    // the sheet - exactly the markets worth shopping for.
    for (const key of Object.keys(byCategory)) {
      const perFamily = key === 'Player props' ? 3 : perCategory;
      const seen = {};
      const kept = [];
      for (const row of byCategory[key]) {
        seen[row.family] = (seen[row.family] || 0) + 1;
        if (seen[row.family] > perFamily) continue;
        kept.push(row);
      }
      byCategory[key] = kept.slice(0, key === 'Player props' ? perCategory * 2 : perCategory);
    }

    fixtures.push({
      id: fixture.id,
      localTime: fixture.localTime,
      kickoff: fixture.kickoff,
      home: { id: model.home.id, name: model.home.name, short: model.home.short },
      away: { id: model.away.id, name: model.away.name, short: model.away.short },
      referee: model.referee.name,
      refereeConfirmed: Boolean(fixture.referee),
      expectations: model.expectations,
      players: model.players,
      byCategory,
      all: rows,
    });
  }

  return {
    date: slateDate,
    competition: ctx.fixturesFile.competition,
    matchweek: ctx.fixturesFile.matchweek,
    requiredEdge,
    squad,
    playerRowsSuppressed: !squad.verified && !options.allowUnverifiedSquads,
    fixtures,
  };
}

module.exports = { loadContext, runSlate, buildParlays, priceParlay, fairSheet };

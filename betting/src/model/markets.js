'use strict';

const { expectedGoals, scoreMatrix, goalMarkets } = require('./goals');
const { jointCountModel, over, under, atLeast } = require('./counts');
const { prepareSquad, projectSquad, involvementShares, ALL_METRICS } = require('./squad');
const { possessionShare } = require('./involvement');
const { buildMatchups, gameState } = require('./matchups');
const { buildPlayerMarkets } = require('./playerEvents');
const { clampProb } = require('../lib/stats');

/**
 * Assembles every priced market for one fixture.
 *
 * The pipeline runs top-down into the player layer and then back up again:
 *
 *   team ratings -> match expectations (goals, corners, shots, fouls)
 *   -> game state and possession
 *   -> squad profiles, expected minutes, direct matchups
 *   -> player expectations, reconciled against the team totals
 *   -> player markets
 *   -> player booking probabilities aggregated back into team cards
 *   -> card markets
 *
 * Cards are built LAST for that reason: the team card projection is a blend of
 * the top-down team rating and the sum of individual booking probabilities,
 * which is the chain that actually generates a card - a deep-defending side,
 * a full-back facing a fast winger, more duels, more fouls, more bookings.
 */

const DEFAULT_REFEREE = {
  id: 'average', name: 'League average', strictness: 1, foulTendency: 1, penaltyRate: 1,
};

function mean(list, key) {
  return list.reduce((s, t) => s + t[key], 0) / list.length;
}

function adjustedRate(base, forRate, meanFor, againstRate, meanAgainst, bias = 1) {
  return base * (forRate / meanFor) * (againstRate / meanAgainst) * bias;
}

function buildFixtureModel(fixture, ctx) {
  const { teams, league, players, referees, roles } = ctx;
  const b = league.baselines;

  const home = teams.find((t) => t.id === fixture.home);
  const away = teams.find((t) => t.id === fixture.away);
  if (!home || !away) throw new Error(`Unknown team in fixture ${fixture.id}`);

  const ref = referees.find((r) => r.id === fixture.referee) || DEFAULT_REFEREE;
  const heat = fixture.heat || 1;

  const m = {
    cornersFor: mean(teams, 'cornersFor'), cornersAgainst: mean(teams, 'cornersAgainst'),
    shotsFor: mean(teams, 'shotsFor'), shotsAgainst: mean(teams, 'shotsAgainst'),
    cardsFor: mean(teams, 'cardsFor'), foulsFor: mean(teams, 'foulsFor'),
    foulsDrawn: mean(teams, 'foulsDrawn'),
  };
  const tempo = (home.tempo + away.tempo) / 2;

  // ===================== TEAM LAYER =======================================
  const xg = expectedGoals(home, away, {
    goalsPerTeamPerGame: b.goalsPerTeamPerGame,
    homeAdvantage: b.homeAdvantage,
    awayAdjustment: b.awayAdjustment,
  });
  const grid = scoreMatrix(xg.home, xg.away, b.dixonColesRho, 10);
  const goals = goalMarkets(grid);
  const state = gameState(grid);

  const cornersHome = adjustedRate(b.cornersPerTeam, home.cornersFor, m.cornersFor, away.cornersAgainst, m.cornersAgainst, b.cornersHomeBias) * tempo;
  const cornersAway = adjustedRate(b.cornersPerTeam, away.cornersFor, m.cornersFor, home.cornersAgainst, m.cornersAgainst, 2 - b.cornersHomeBias) * tempo;
  const corners = jointCountModel({
    muHome: cornersHome, muAway: cornersAway,
    phiTotal: b.cornersPhiTotal, phiShared: b.cornersPhiShared, maxK: 30,
  });

  const shotsHome = adjustedRate(b.shotsPerTeam, home.shotsFor, m.shotsFor, away.shotsAgainst, m.shotsAgainst, b.shotsHomeBias) * tempo * state.home.attack;
  const shotsAway = adjustedRate(b.shotsPerTeam, away.shotsFor, m.shotsFor, home.shotsAgainst, m.shotsAgainst, 2 - b.shotsHomeBias) * tempo * state.away.attack;
  const shots = jointCountModel({
    muHome: shotsHome, muAway: shotsAway,
    phiTotal: b.shotsPhiTotal, phiShared: b.shotsPhiShared, maxK: 46,
  });

  const sotHome = shotsHome * home.sotShare;
  const sotAway = shotsAway * away.sotShare;
  const sot = jointCountModel({
    muHome: sotHome, muAway: sotAway,
    phiTotal: b.sotPhiTotal, phiShared: b.sotPhiShared, maxK: 26,
  });

  const foulsHome = adjustedRate(b.foulsPerTeam, home.foulsFor, m.foulsFor, away.foulsDrawn, m.foulsDrawn) * ref.foulTendency;
  const foulsAway = adjustedRate(b.foulsPerTeam, away.foulsFor, m.foulsFor, home.foulsDrawn, m.foulsDrawn) * ref.foulTendency;

  const possHome = possessionShare(home, away, b.homeAdvantage * 0.95);
  const penaltyRate = 0.11 * (ref.penaltyRate || 1);

  // ===================== PLAYER LAYER =====================================
  const homePlayers = players.filter((p) => p.team === home.id);
  const awayPlayers = players.filter((p) => p.team === away.id);

  const minutesContext = { blowoutProb: state.blowoutProb };
  const homeSquad = prepareSquad(homePlayers, roles, minutesContext);
  const awaySquad = prepareSquad(awayPlayers, roles, minutesContext);

  const matchups = buildMatchups(homeSquad, awaySquad);

  const homeTeamExp = {
    shots: shotsHome, sot: sotHome, goals: xg.home, fouls: foulsHome,
    penaltyRate: penaltyRate * (possHome / 0.5),
  };
  const awayTeamExp = {
    shots: shotsAway, sot: sotAway, goals: xg.away, fouls: foulsAway,
    penaltyRate: penaltyRate * ((1 - possHome) / 0.5),
  };

  const homeProjection = projectSquad({
    squad: homeSquad, team: home, opponent: away,
    teamExpectations: homeTeamExp, opponentExpectations: awayTeamExp,
    possession: possHome, stateFactors: state.home,
    matchupMultipliers: matchups.multipliers, league,
  });
  const awayProjection = projectSquad({
    squad: awaySquad, team: away, opponent: home,
    teamExpectations: awayTeamExp, opponentExpectations: homeTeamExp,
    possession: 1 - possHome, stateFactors: state.away,
    matchupMultipliers: matchups.multipliers, league,
  });

  const markets = [];
  const push = (market) => markets.push({ ...market, matchId: fixture.id });

  // Player markets, collecting booking probabilities for the aggregation step.
  const playerRows = [];
  const bookingTotals = { home: 0, away: 0 };

  for (const [side, projection, team] of [['home', homeProjection, home], ['away', awayProjection, away]]) {
    for (const projected of projection.players) {
      const { markets: playerMarkets, yellowProb, redProb } = buildPlayerMarkets(projected, {
        fixtureId: fixture.id, side, teamShort: team.short,
        refStrictness: ref.strictness * heat,
      });
      playerMarkets.forEach(push);
      bookingTotals[side] += yellowProb;

      playerRows.push({
        id: projected.player.id,
        name: projected.player.name,
        team: team.short,
        side,
        role: projected.player.roleType,
        line: projected.line,
        expectedMinutes: projected.minutes.expectedMinutes,
        startProb: projected.minutes.pStart,
        pPlay60: projected.minutes.pPlay60Plus,
        pPlay90: projected.minutes.pPlay90,
        accuracy: projected.accuracy,
        yellowProb,
        redProb,
        matchup: matchups.multipliers[projected.player.id] || null,
        expectations: projected.expectations,
      });
    }
  }

  // ---- cards: blend the top-down team rating with the player aggregate ----
  const cardMult = ref.strictness * heat;
  const topDownHome = adjustedRate(b.cardsPerTeam, home.cardsFor, m.cardsFor, away.foulsDrawn, m.foulsDrawn, b.cardsHomeBias) * cardMult;
  const topDownAway = adjustedRate(b.cardsPerTeam, away.cardsFor, m.cardsFor, home.foulsDrawn, m.foulsDrawn, 2 - b.cardsHomeBias) * cardMult;

  // Sum of individual booking probabilities is the expected number of booked
  // players; gross up for squad members we have not listed.
  const bottomUpHome = bookingTotals.home / Math.max(0.3, homeProjection.coverage);
  const bottomUpAway = bookingTotals.away / Math.max(0.3, awayProjection.coverage);

  const CARD_BLEND = 0.65;
  const cardsHome = CARD_BLEND * topDownHome + (1 - CARD_BLEND) * bottomUpHome;
  const cardsAway = CARD_BLEND * topDownAway + (1 - CARD_BLEND) * bottomUpAway;

  const cards = jointCountModel({
    muHome: cardsHome, muAway: cardsAway,
    phiTotal: b.cardsPhiTotal, phiShared: b.cardsPhiShared, maxK: 18,
  });

  const expectations = {
    goals: { home: xg.home, away: xg.away, total: xg.home + xg.away },
    corners: { home: cornersHome, away: cornersAway, total: cornersHome + cornersAway, correlation: corners.correlation() },
    cards: {
      home: cardsHome, away: cardsAway, total: cardsHome + cardsAway,
      correlation: cards.correlation(), referee: ref.name,
      topDown: { home: topDownHome, away: topDownAway },
      bottomUp: { home: bottomUpHome, away: bottomUpAway },
      blendWeight: CARD_BLEND,
    },
    shots: { home: shotsHome, away: shotsAway, total: shotsHome + shotsAway },
    sot: { home: sotHome, away: sotAway, total: sotHome + sotAway },
    fouls: { home: foulsHome, away: foulsAway, total: foulsHome + foulsAway },
    possession: { home: possHome, away: 1 - possHome },
    gameState: {
      homeWin: state.homeWin, draw: state.draw, awayWin: state.awayWin,
      blowoutProb: state.blowoutProb,
      homeChase: state.home.chaseIndex, awayChase: state.away.chaseIndex,
    },
  };

  // ======================= GOAL MARKETS ==================================
  for (const line of [1.5, 2.5, 3.5, 4.5]) {
    push({
      id: `${fixture.id}:total_goals:${line}`, category: 'Goals', family: 'match_goals',
      team: 'match', label: `Total goals ${line}`, line, dataQuality: 0.88,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} goals`, modelProb: over(goals.totalGoals, line) },
        { key: 'under', side: 'under', label: `Under ${line} goals`, modelProb: under(goals.totalGoals, line) },
      ],
    });
  }

  push({
    id: `${fixture.id}:btts`, category: 'Goals', family: 'btts', team: 'match',
    label: 'Both teams to score', dataQuality: 0.88,
    selections: [
      { key: 'yes', side: 'yes', label: 'Both teams to score - Yes', modelProb: goals.bttsYes },
      { key: 'no', side: 'no', label: 'Both teams to score - No', modelProb: goals.bttsNo },
    ],
  });

  for (const [side, team, vec] of [['home', home, goals.homeGoals], ['away', away, goals.awayGoals]]) {
    for (const line of [0.5, 1.5, 2.5]) {
      push({
        id: `${fixture.id}:team_goals:${side}:${line}`, category: 'Goals', family: 'team_goals',
        team: side, label: `${team.short} total goals ${line}`, line, dataQuality: 0.85,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} goals`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} goals`, modelProb: under(vec, line) },
        ],
      });
    }
  }

  // ======================= CORNER MARKETS ================================
  for (const line of [8.5, 9.5, 10.5, 11.5, 12.5]) {
    push({
      id: `${fixture.id}:total_corners:${line}`, category: 'Corners', family: 'match_corners',
      team: 'match', label: `Total corners ${line}`, line, dataQuality: 0.82,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} corners`, modelProb: over(corners.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} corners`, modelProb: under(corners.total, line) },
      ],
    });
  }
  for (const [side, team, vec] of [['home', home, corners.marginalHome], ['away', away, corners.marginalAway]]) {
    for (const line of [3.5, 4.5, 5.5, 6.5]) {
      push({
        id: `${fixture.id}:team_corners:${side}:${line}`, category: 'Corners', family: 'team_corners',
        team: side, label: `${team.short} corners ${line}`, line, dataQuality: 0.78,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} corners`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} corners`, modelProb: under(vec, line) },
        ],
      });
    }
  }
  for (const k of [3, 4, 5]) {
    const joint = corners.bothAtLeast(k, k);
    const naive = atLeast(corners.marginalHome, k) * atLeast(corners.marginalAway, k);
    push({
      id: `${fixture.id}:both_corners:${k}`, category: 'Corners', family: 'team_corners',
      team: 'match', label: `Both teams ${k}+ corners`, dataQuality: 0.74,
      note: `Joint model; independence would say ${(naive * 100).toFixed(1)}%`,
      selections: [
        { key: 'yes', side: 'yes', label: `Both teams to have ${k}+ corners`, modelProb: joint },
        { key: 'no', side: 'no', label: `Not both teams ${k}+ corners`, modelProb: clampProb(1 - joint) },
      ],
    });
  }

  // ======================= CARD MARKETS ==================================
  for (const line of [2.5, 3.5, 4.5, 5.5]) {
    push({
      id: `${fixture.id}:total_cards:${line}`, category: 'Cards', family: 'match_cards',
      team: 'match', label: `Total cards ${line}`, line, dataQuality: 0.76,
      note: `Team rating ${(topDownHome + topDownAway).toFixed(2)} blended with player aggregate ${(bottomUpHome + bottomUpAway).toFixed(2)}`,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} cards`, modelProb: over(cards.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} cards`, modelProb: under(cards.total, line) },
      ],
    });
  }
  for (const [side, team, vec] of [['home', home, cards.marginalHome], ['away', away, cards.marginalAway]]) {
    for (const line of [1.5, 2.5]) {
      push({
        id: `${fixture.id}:team_cards:${side}:${line}`, category: 'Cards', family: 'team_cards',
        team: side, label: `${team.short} cards ${line}`, line, dataQuality: 0.72,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} cards`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} cards`, modelProb: under(vec, line) },
        ],
      });
    }
  }
  for (const k of [1, 2]) {
    const joint = cards.bothAtLeast(k, k);
    const naive = atLeast(cards.marginalHome, k) * atLeast(cards.marginalAway, k);
    push({
      id: `${fixture.id}:both_cards:${k}`, category: 'Cards', family: 'team_cards',
      team: 'match', label: `Both teams ${k}+ card${k > 1 ? 's' : ''}`, dataQuality: 0.72,
      note: `Joint model; independence would say ${(naive * 100).toFixed(1)}%`,
      selections: [
        { key: 'yes', side: 'yes', label: `Both teams to receive ${k}+ booking${k > 1 ? 's' : ''}`, modelProb: joint },
        { key: 'no', side: 'no', label: `Not both teams ${k}+ booking${k > 1 ? 's' : ''}`, modelProb: clampProb(1 - joint) },
      ],
    });
  }

  // ======================= SHOT MARKETS ==================================
  for (const line of [23.5, 25.5, 27.5]) {
    push({
      id: `${fixture.id}:total_shots:${line}`, category: 'Shots', family: 'match_shots',
      team: 'match', label: `Total shots ${line}`, line, dataQuality: 0.80,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} total shots`, modelProb: over(shots.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} total shots`, modelProb: under(shots.total, line) },
      ],
    });
  }
  for (const line of [7.5, 8.5, 9.5]) {
    push({
      id: `${fixture.id}:total_sot:${line}`, category: 'Shots', family: 'match_shots',
      team: 'match', label: `Total shots on target ${line}`, line, dataQuality: 0.78,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} shots on target`, modelProb: over(sot.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} shots on target`, modelProb: under(sot.total, line) },
      ],
    });
  }
  for (const [side, team, vec] of [['home', home, shots.marginalHome], ['away', away, shots.marginalAway]]) {
    for (const line of [11.5, 13.5, 15.5]) {
      push({
        id: `${fixture.id}:team_shots:${side}:${line}`, category: 'Shots', family: 'team_shots',
        team: side, label: `${team.short} shots ${line}`, line, dataQuality: 0.76,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} shots`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} shots`, modelProb: under(vec, line) },
        ],
      });
    }
  }
  for (const [side, team, vec] of [['home', home, sot.marginalHome], ['away', away, sot.marginalAway]]) {
    for (const line of [3.5, 4.5, 5.5]) {
      push({
        id: `${fixture.id}:team_sot:${side}:${line}`, category: 'Shots', family: 'team_shots',
        team: side, label: `${team.short} shots on target ${line}`, line, dataQuality: 0.74,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} shots on target`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} shots on target`, modelProb: under(vec, line) },
        ],
      });
    }
  }

  return {
    fixture, home, away, referee: ref, expectations, markets,
    players: playerRows,
    projections: {
      home: { diagnostics: homeProjection.diagnostics, coverage: homeProjection.coverage, multipliers: homeProjection.multipliers },
      away: { diagnostics: awayProjection.diagnostics, coverage: awayProjection.coverage, multipliers: awayProjection.multipliers },
    },
    shares: {
      home: involvementShares(homeProjection, ['shots', 'sot', 'goals', 'fouls', 'touches', 'boxTouches', 'keyPasses', 'tackles']),
      away: involvementShares(awayProjection, ['shots', 'sot', 'goals', 'fouls', 'touches', 'boxTouches', 'keyPasses', 'tackles']),
    },
    matchups: matchups.detail,
  };
}

module.exports = { buildFixtureModel };

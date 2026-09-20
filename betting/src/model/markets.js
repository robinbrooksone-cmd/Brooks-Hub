'use strict';

const { expectedGoals, scoreMatrix, goalMarkets } = require('./goals');
const { jointCountModel, over, under, atLeast } = require('./counts');
const { propAtLeast, propExpectation, bookingProb } = require('./players');
const { clampProb } = require('../lib/stats');

/**
 * Assembles every priced market for one fixture.
 *
 * The central idea: compute a small set of match expectations (goals, corners,
 * cards, shots, fouls for each side), then derive every market from those same
 * numbers. Because player props are scaled by the SAME team expectations that
 * drive the team totals, the board stays internally coherent — you can never
 * end up recommending "under 2.5 team shots" alongside "three of their players
 * over 2.5 shots each".
 */

const DEFAULT_REFEREE = { id: 'average', name: 'League average', strictness: 1, foulTendency: 1, penaltyRate: 1 };

function mean(list, key) {
  return list.reduce((s, t) => s + t[key], 0) / list.length;
}

/** Opponent-adjusted rate: league base x attacking rate x opponent's conceding rate. */
function adjustedRate(base, forRate, meanFor, againstRate, meanAgainst, bias = 1) {
  return base * (forRate / meanFor) * (againstRate / meanAgainst) * bias;
}

function buildFixtureModel(fixture, ctx) {
  const { teams, league, players, referees } = ctx;
  const b = league.baselines;

  const home = teams.find((t) => t.id === fixture.home);
  const away = teams.find((t) => t.id === fixture.away);
  if (!home || !away) throw new Error(`Unknown team in fixture ${fixture.id}`);

  const ref = referees.find((r) => r.id === fixture.referee) || DEFAULT_REFEREE;
  const heat = fixture.heat || 1;

  // League means taken from the ratings table itself, so the model stays
  // self-normalising if the table is refreshed with real season-to-date data.
  const m = {
    cornersFor: mean(teams, 'cornersFor'),
    cornersAgainst: mean(teams, 'cornersAgainst'),
    shotsFor: mean(teams, 'shotsFor'),
    shotsAgainst: mean(teams, 'shotsAgainst'),
    cardsFor: mean(teams, 'cardsFor'),
    foulsFor: mean(teams, 'foulsFor'),
    foulsDrawn: mean(teams, 'foulsDrawn'),
  };

  const tempo = (home.tempo + away.tempo) / 2;

  // ---- Goals -------------------------------------------------------------
  const xg = expectedGoals(home, away, {
    goalsPerTeamPerGame: b.goalsPerTeamPerGame,
    homeAdvantage: b.homeAdvantage,
    awayAdjustment: b.awayAdjustment,
  });
  const grid = scoreMatrix(xg.home, xg.away, b.dixonColesRho, 10);
  const goals = goalMarkets(grid);

  // ---- Corners -----------------------------------------------------------
  const cornersHome = adjustedRate(b.cornersPerTeam, home.cornersFor, m.cornersFor, away.cornersAgainst, m.cornersAgainst, b.cornersHomeBias) * tempo;
  const cornersAway = adjustedRate(b.cornersPerTeam, away.cornersFor, m.cornersFor, home.cornersAgainst, m.cornersAgainst, 2 - b.cornersHomeBias) * tempo;
  const corners = jointCountModel({
    muHome: cornersHome, muAway: cornersAway,
    phiTotal: b.cornersPhiTotal, phiShared: b.cornersPhiShared, maxK: 30,
  });

  // ---- Cards -------------------------------------------------------------
  // Card rates respond to the referee and to how fractious the fixture is.
  const cardMult = ref.strictness * heat;
  const cardsHome = adjustedRate(b.cardsPerTeam, home.cardsFor, m.cardsFor, away.foulsDrawn, m.foulsDrawn, b.cardsHomeBias) * cardMult;
  const cardsAway = adjustedRate(b.cardsPerTeam, away.cardsFor, m.cardsFor, home.foulsDrawn, m.foulsDrawn, 2 - b.cardsHomeBias) * cardMult;
  const cards = jointCountModel({
    muHome: cardsHome, muAway: cardsAway,
    phiTotal: b.cardsPhiTotal, phiShared: b.cardsPhiShared, maxK: 18,
  });

  // ---- Shots and shots on target ----------------------------------------
  const shotsHome = adjustedRate(b.shotsPerTeam, home.shotsFor, m.shotsFor, away.shotsAgainst, m.shotsAgainst, b.shotsHomeBias) * tempo;
  const shotsAway = adjustedRate(b.shotsPerTeam, away.shotsFor, m.shotsFor, home.shotsAgainst, m.shotsAgainst, 2 - b.shotsHomeBias) * tempo;
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

  // ---- Fouls -------------------------------------------------------------
  const foulsHome = adjustedRate(b.foulsPerTeam, home.foulsFor, m.foulsFor, away.foulsDrawn, m.foulsDrawn) * ref.foulTendency;
  const foulsAway = adjustedRate(b.foulsPerTeam, away.foulsFor, m.foulsFor, home.foulsDrawn, m.foulsDrawn) * ref.foulTendency;

  const expectations = {
    goals: { home: xg.home, away: xg.away, total: xg.home + xg.away },
    corners: { home: cornersHome, away: cornersAway, total: cornersHome + cornersAway, correlation: corners.correlation() },
    cards: { home: cardsHome, away: cardsAway, total: cardsHome + cardsAway, correlation: cards.correlation(), referee: ref.name },
    shots: { home: shotsHome, away: shotsAway, total: shotsHome + shotsAway },
    sot: { home: sotHome, away: sotAway, total: sotHome + sotAway },
    fouls: { home: foulsHome, away: foulsAway, total: foulsHome + foulsAway },
  };

  // Multipliers translating "this fixture vs the team's own average" into a
  // scaling factor for that team's individual players.
  const playerMultipliers = {
    [home.id]: {
      shots: shotsHome / home.shotsFor,
      sot: sotHome / (home.shotsFor * home.sotShare),
      fouls: foulsHome / home.foulsFor,
      goals: xg.home / (b.goalsPerTeamPerGame * home.attack),
      cards: cardsHome / home.cardsFor,
    },
    [away.id]: {
      shots: shotsAway / away.shotsFor,
      sot: sotAway / (away.shotsFor * away.sotShare),
      fouls: foulsAway / away.foulsFor,
      goals: xg.away / (b.goalsPerTeamPerGame * away.attack),
      cards: cardsAway / away.cardsFor,
    },
  };

  const markets = [];
  const push = (market) => markets.push({ ...market, matchId: fixture.id });

  // ======================= GOAL MARKETS ==================================
  for (const line of [1.5, 2.5, 3.5, 4.5]) {
    push({
      id: `${fixture.id}:total_goals:${line}`,
      category: 'Goals',
      family: 'match_goals',
      team: 'match',
      label: `Total goals ${line}`,
      line,
      dataQuality: 0.88,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} goals`, modelProb: over(goals.totalGoals, line) },
        { key: 'under', side: 'under', label: `Under ${line} goals`, modelProb: under(goals.totalGoals, line) },
      ],
    });
  }

  push({
    id: `${fixture.id}:btts`,
    category: 'Goals',
    family: 'btts',
    team: 'match',
    label: 'Both teams to score',
    dataQuality: 0.88,
    selections: [
      { key: 'yes', side: 'yes', label: 'Both teams to score - Yes', modelProb: goals.bttsYes },
      { key: 'no', side: 'no', label: 'Both teams to score - No', modelProb: goals.bttsNo },
    ],
  });

  for (const [side, team, vec] of [['home', home, goals.homeGoals], ['away', away, goals.awayGoals]]) {
    for (const line of [0.5, 1.5, 2.5]) {
      push({
        id: `${fixture.id}:team_goals:${side}:${line}`,
        category: 'Goals',
        family: 'team_goals',
        team: side,
        label: `${team.short} total goals ${line}`,
        line,
        dataQuality: 0.85,
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
      id: `${fixture.id}:total_corners:${line}`,
      category: 'Corners',
      family: 'match_corners',
      team: 'match',
      label: `Total corners ${line}`,
      line,
      dataQuality: 0.82,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} corners`, modelProb: over(corners.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} corners`, modelProb: under(corners.total, line) },
      ],
    });
  }

  for (const [side, team, vec] of [['home', home, corners.marginalHome], ['away', away, corners.marginalAway]]) {
    for (const line of [3.5, 4.5, 5.5, 6.5]) {
      push({
        id: `${fixture.id}:team_corners:${side}:${line}`,
        category: 'Corners',
        family: 'team_corners',
        team: side,
        label: `${team.short} corners ${line}`,
        line,
        dataQuality: 0.78,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} corners`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} corners`, modelProb: under(vec, line) },
        ],
      });
    }
  }

  // The headline "both teams" corner line — priced off the joint distribution,
  // not the product of two marginals.
  for (const k of [3, 4, 5]) {
    const joint = corners.bothAtLeast(k, k);
    const naive = atLeast(corners.marginalHome, k) * atLeast(corners.marginalAway, k);
    push({
      id: `${fixture.id}:both_corners:${k}`,
      category: 'Corners',
      family: 'team_corners',
      team: 'match',
      label: `Both teams ${k}+ corners`,
      dataQuality: 0.74,
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
      id: `${fixture.id}:total_cards:${line}`,
      category: 'Cards',
      family: 'match_cards',
      team: 'match',
      label: `Total cards ${line}`,
      line,
      dataQuality: 0.76,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} cards`, modelProb: over(cards.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} cards`, modelProb: under(cards.total, line) },
      ],
    });
  }

  for (const [side, team, vec] of [['home', home, cards.marginalHome], ['away', away, cards.marginalAway]]) {
    for (const line of [1.5, 2.5]) {
      push({
        id: `${fixture.id}:team_cards:${side}:${line}`,
        category: 'Cards',
        family: 'team_cards',
        team: side,
        label: `${team.short} cards ${line}`,
        line,
        dataQuality: 0.72,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} cards`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} cards`, modelProb: under(vec, line) },
        ],
      });
    }
  }

  // "Both teams to receive X+ cards" — same joint treatment as corners. The
  // referee is a single shared factor, so the correlation here is stronger.
  for (const k of [1, 2]) {
    const joint = cards.bothAtLeast(k, k);
    const naive = atLeast(cards.marginalHome, k) * atLeast(cards.marginalAway, k);
    push({
      id: `${fixture.id}:both_cards:${k}`,
      category: 'Cards',
      family: 'team_cards',
      team: 'match',
      label: `Both teams ${k}+ card${k > 1 ? 's' : ''}`,
      dataQuality: 0.72,
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
      id: `${fixture.id}:total_shots:${line}`,
      category: 'Shots',
      family: 'match_shots',
      team: 'match',
      label: `Total shots ${line}`,
      line,
      dataQuality: 0.80,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} total shots`, modelProb: over(shots.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} total shots`, modelProb: under(shots.total, line) },
      ],
    });
  }

  for (const line of [7.5, 8.5, 9.5]) {
    push({
      id: `${fixture.id}:total_sot:${line}`,
      category: 'Shots',
      family: 'match_shots',
      team: 'match',
      label: `Total shots on target ${line}`,
      line,
      dataQuality: 0.78,
      selections: [
        { key: 'over', side: 'over', label: `Over ${line} shots on target`, modelProb: over(sot.total, line) },
        { key: 'under', side: 'under', label: `Under ${line} shots on target`, modelProb: under(sot.total, line) },
      ],
    });
  }

  for (const [side, team, vec, lines] of [
    ['home', home, shots.marginalHome, [11.5, 13.5, 15.5]],
    ['away', away, shots.marginalAway, [11.5, 13.5, 15.5]],
  ]) {
    for (const line of lines) {
      push({
        id: `${fixture.id}:team_shots:${side}:${line}`,
        category: 'Shots',
        family: 'team_shots',
        team: side,
        label: `${team.short} shots ${line}`,
        line,
        dataQuality: 0.76,
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
        id: `${fixture.id}:team_sot:${side}:${line}`,
        category: 'Shots',
        family: 'team_shots',
        team: side,
        label: `${team.short} shots on target ${line}`,
        line,
        dataQuality: 0.74,
        selections: [
          { key: 'over', side: 'over', label: `${team.name} over ${line} shots on target`, modelProb: over(vec, line) },
          { key: 'under', side: 'under', label: `${team.name} under ${line} shots on target`, modelProb: under(vec, line) },
        ],
      });
    }
  }

  // ======================= PLAYER PROPS ==================================
  const squad = players.filter((p) => p.team === home.id || p.team === away.id);

  for (const player of squad) {
    const side = player.team === home.id ? 'home' : 'away';
    const mult = playerMultipliers[player.team];
    const teamName = player.team === home.id ? home : away;

    const addProp = (family, market, lines, noun, quality, multiplier) => {
      for (const k of lines) {
        const p = propAtLeast(player, market, k, multiplier);
        if (p === null || p < 0.02 || p > 0.985) continue;

        // Goals read naturally as "to score" rather than "1+ goals".
        const isScorer = market === 'goals' && k === 1;
        const overLabel = isScorer ? `${player.name} to score` : `${player.name} ${k}+ ${noun}`;
        const underLabel = isScorer
          ? `${player.name} not to score`
          : k === 1
            ? `${player.name} no ${noun}`
            : `${player.name} under ${k} ${noun}`;

        push({
          id: `${fixture.id}:${family}:${player.id}:${k}`,
          category: 'Player props',
          family,
          team: side,
          playerId: player.id,
          playerName: player.name,
          teamName: teamName.short,
          label: overLabel,
          line: k - 0.5,
          dataQuality: quality,
          expectation: propExpectation(player, market, multiplier),
          selections: [
            { key: 'over', side: 'over', label: overLabel, modelProb: p },
            { key: 'under', side: 'under', label: underLabel, modelProb: clampProb(1 - p) },
          ],
        });
      }
    };

    addProp('player_shots', 'shots', [1, 2, 3, 4], 'shots', 0.68, mult.shots);
    addProp('player_sot', 'sot', [1, 2, 3], 'shots on target', 0.66, mult.sot);
    addProp('player_fouls', 'fouls', [1, 2, 3], 'fouls committed', 0.62, mult.fouls);
    addProp('player_goals', 'goals', [1, 2], 'goals', 0.72, mult.goals);

    const booked = bookingProb(player, {
      refStrictness: ref.strictness * heat,
      teamMultiplier: mult.fouls,
      oppMultiplier: 1,
    });
    if (booked !== null && booked > 0.03 && booked < 0.85) {
      push({
        id: `${fixture.id}:player_booked:${player.id}`,
        category: 'Player props',
        family: 'player_booked',
        team: side,
        playerId: player.id,
        playerName: player.name,
        teamName: teamName.short,
        label: `${player.name} to be booked`,
        dataQuality: 0.58,
        selections: [
          { key: 'yes', side: 'yes', label: `${player.name} to be carded`, modelProb: booked },
          { key: 'no', side: 'no', label: `${player.name} not carded`, modelProb: clampProb(1 - booked) },
        ],
      });
    }
  }

  return { fixture, home, away, referee: ref, expectations, markets };
}

module.exports = { buildFixtureModel };

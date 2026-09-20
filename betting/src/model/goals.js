'use strict';

const { poissonPmf, clampProb } = require('../lib/stats');

/**
 * Dixon-Coles bivariate goals model.
 *
 * Plain independent Poisson misprices low-scoring games: 0-0, 1-0, 0-1 and 1-1
 * are empirically more/less frequent than independence implies. Dixon & Coles
 * (1997) correct exactly those four cells with a single dependence parameter
 * rho, which is where most of the value in Under 2.5 / BTTS markets lives.
 */
function dcCorrection(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Expected goals for each side from team ratings.
 *
 * attack/defence are multiplicative ratings centred on 1.0, so a side with
 * attack 1.20 scores 20% more than league average against an average defence.
 */
function expectedGoals(home, away, league) {
  const base = league.goalsPerTeamPerGame;
  const lambda = base * home.attack * away.defence * league.homeAdvantage;
  const mu = base * away.attack * home.defence * league.awayAdjustment;
  return {
    home: Math.max(0.15, lambda),
    away: Math.max(0.15, mu),
  };
}

/** Full score matrix up to maxGoals, normalised to sum to 1. */
function scoreMatrix(lambda, mu, rho, maxGoals = 10) {
  const grid = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x++) {
    grid[x] = [];
    for (let y = 0; y <= maxGoals; y++) {
      const p = poissonPmf(x, lambda) * poissonPmf(y, mu) * dcCorrection(x, y, lambda, mu, rho);
      const safe = Math.max(0, p);
      grid[x][y] = safe;
      total += safe;
    }
  }
  // The DC correction is not a probability measure on its own; renormalise.
  if (total > 0) {
    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) grid[x][y] /= total;
    }
  }
  return grid;
}

/** Collapse a score matrix into the goal-based markets we price. */
function goalMarkets(grid) {
  const n = grid.length;
  const totalVec = new Array(2 * n).fill(0);
  const homeVec = new Array(n).fill(0);
  const awayVec = new Array(n).fill(0);
  let bttsYes = 0;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const p = grid[x][y];
      if (p <= 0) continue;
      totalVec[x + y] += p;
      homeVec[x] += p;
      awayVec[y] += p;
      if (x > 0 && y > 0) bttsYes += p;
      if (x > y) homeWin += p;
      else if (x === y) draw += p;
      else awayWin += p;
    }
  }

  return {
    totalGoals: totalVec,
    homeGoals: homeVec,
    awayGoals: awayVec,
    bttsYes: clampProb(bttsYes),
    bttsNo: clampProb(1 - bttsYes),
    homeWin: clampProb(homeWin),
    draw: clampProb(draw),
    awayWin: clampProb(awayWin),
  };
}

/**
 * Probability a given player's team scores at least one — used to sanity-bound
 * "player to score" props against the team's own scoring distribution.
 */
function teamScoresProb(vec) {
  return clampProb(1 - (vec[0] || 0));
}

module.exports = { dcCorrection, expectedGoals, scoreMatrix, goalMarkets, teamScoresProb };

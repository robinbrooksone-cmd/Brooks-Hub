const config = require('../config');

/**
 * Elo-style power-rating model for rugby teams, independent of bookmaker prices.
 * Used as the second input (alongside bookmaker consensus) to the blended fair-value
 * model, so a value flag isn't purely "one book disagrees with the others" but also
 * "our own team-strength model disagrees with the market."
 *
 * Margin-of-victory multiplier and home-advantage follow the same shape as
 * FiveThirtyEight's NFL Elo methodology, adapted for rugby's wider score margins.
 */

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function movMultiplier(pointMargin, winnerRating, loserRating) {
  const margin = Math.max(Math.abs(pointMargin), 1);
  const ratingDiff = winnerRating - loserRating;
  return Math.log(margin + 1) * (2.2 / (ratingDiff * 0.001 + 2.2));
}

/**
 * Applies one match result to a pair of ratings and returns the updated ratings.
 * @param {number} homeRating
 * @param {number} awayRating
 * @param {number} homeScore
 * @param {number} awayScore
 * @param {{ kFactor?: number, homeAdvantage?: number }} [opts]
 */
function updateRatings(homeRating, awayRating, homeScore, awayScore, opts = {}) {
  const kFactor = opts.kFactor ?? config.elo.kFactor;
  const homeAdvantage = opts.homeAdvantage ?? config.elo.homeAdvantage;

  const adjHomeRating = homeRating + homeAdvantage;
  const expectedHome = expectedScore(adjHomeRating, awayRating);
  const expectedAway = 1 - expectedHome;

  let actualHome;
  let mult;
  if (homeScore === awayScore) {
    actualHome = 0.5;
    mult = 1;
  } else if (homeScore > awayScore) {
    actualHome = 1;
    mult = movMultiplier(homeScore - awayScore, adjHomeRating, awayRating);
  } else {
    actualHome = 0;
    mult = movMultiplier(awayScore - homeScore, awayRating, adjHomeRating);
  }

  const homeDelta = kFactor * mult * (actualHome - expectedHome);
  const awayDelta = kFactor * mult * ((1 - actualHome) - expectedAway);

  return {
    homeRating: homeRating + homeDelta,
    awayRating: awayRating + awayDelta,
  };
}

/**
 * Converts two Elo ratings into win/draw/loss probabilities for an upcoming match.
 * Rugby draws are rare; we use a small fixed base rate and split the remainder by
 * the Elo-implied win probability rather than modeling draws directly in Elo space.
 */
function matchProbabilities(homeRating, awayRating, opts = {}) {
  const homeAdvantage = opts.homeAdvantage ?? config.elo.homeAdvantage;
  const drawProb = opts.drawProb ?? config.analysis.defaultDrawProb;

  const homeWinShare = expectedScore(homeRating + homeAdvantage, awayRating);
  const homeProb = homeWinShare * (1 - drawProb);
  const awayProb = (1 - homeWinShare) * (1 - drawProb);

  return { home: homeProb, draw: drawProb, away: awayProb };
}

module.exports = { expectedScore, movMultiplier, updateRatings, matchProbabilities };

const { db } = require('../db');
const config = require('../config');

/**
 * Independent probability model for "anytime try scorer" style player props,
 * built the same way as the match-level Elo model: from historical results,
 * not from other bookmakers' prices. This is what lets the agent flag a player
 * whose price looks generic (e.g. a hooker priced like an average forward) when
 * the data shows his team funnels a disproportionate share of its tries through
 * him — a strong driving maul, say — without hardcoding any team-specific
 * assumption. If the try-log data doesn't show that pattern, the model won't
 * manufacture an edge; it just returns null and the market price stands alone.
 *
 * Method: team try-scoring is modeled as Poisson-distributed. A team's expected
 * tries in a match = its own rolling attack rate (tries scored/match) adjusted
 * by the opponent's rolling defense factor (their tries conceded relative to the
 * league average). A player's expected tries = team expected tries * that
 * player's historical share of his team's tries. P(scores >= 1 try) is then the
 * standard Poisson tail: 1 - e^(-lambda).
 */

function leagueAverageTriesPerTeam() {
  const row = db.prepare('SELECT AVG(tries_scored) AS avg FROM team_match_tries').get();
  return row && row.avg != null ? row.avg : null;
}

function recentTeamTries(teamId, lookback) {
  return db
    .prepare(
      `SELECT tries_scored FROM team_match_tries
       WHERE team_id = ? ORDER BY match_date DESC LIMIT ?`
    )
    .all(teamId, lookback)
    .map((r) => r.tries_scored);
}

function recentConcededTries(teamId, lookback) {
  return db
    .prepare(
      `SELECT tries_scored FROM team_match_tries
       WHERE opponent_id = ? ORDER BY match_date DESC LIMIT ?`
    )
    .all(teamId, lookback)
    .map((r) => r.tries_scored);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function teamAttackRate(teamId, lookback = config.propsModel.lookbackMatches) {
  return average(recentTeamTries(teamId, lookback));
}

/** >1 means this team concedes more tries than league average (leaky defense). */
function teamDefenseFactor(teamId, lookback = config.propsModel.lookbackMatches) {
  const leagueAvg = leagueAverageTriesPerTeam();
  const conceded = average(recentConcededTries(teamId, lookback));
  if (leagueAvg == null || leagueAvg === 0 || conceded == null) return 1; // neutral, insufficient data
  return conceded / leagueAvg;
}

function expectedTeamTries(teamId, opponentId, lookback = config.propsModel.lookbackMatches) {
  const leagueAvg = leagueAverageTriesPerTeam();
  const attackRate = teamAttackRate(teamId, lookback) ?? leagueAvg;
  if (attackRate == null) return null; // no league data at all yet
  const defenseFactor = teamDefenseFactor(opponentId, lookback);
  return attackRate * defenseFactor;
}

/**
 * Historical share of the player's own team's tries that this player has scored,
 * over the same lookback window. Returns null if there isn't enough history to
 * trust it (fewer than propsModel.minMatchesForShare team-matches recorded).
 */
function playerTryShare(playerId, teamId, lookback = config.propsModel.lookbackMatches) {
  const teamMatches = db
    .prepare(
      `SELECT match_date, tries_scored FROM team_match_tries
       WHERE team_id = ? ORDER BY match_date DESC LIMIT ?`
    )
    .all(teamId, lookback);

  if (teamMatches.length < config.propsModel.minMatchesForShare) return null;

  const teamTriesTotal = teamMatches.reduce((a, r) => a + r.tries_scored, 0);
  if (teamTriesTotal === 0) return 0;

  const earliestDate = teamMatches[teamMatches.length - 1].match_date;
  const playerTriesTotal = db
    .prepare(
      `SELECT SUM(tries) AS total FROM player_tries
       WHERE player_id = ? AND team_id = ? AND match_date >= ?`
    )
    .get(playerId, teamId, earliestDate);

  const playerTotal = playerTriesTotal && playerTriesTotal.total != null ? playerTriesTotal.total : 0;
  return playerTotal / teamTriesTotal;
}

function fairTryScorerProb(lambda) {
  return 1 - Math.exp(-lambda);
}

/**
 * Full pipeline for one player in one upcoming match: resolves the player's team
 * and opponent from the match, computes expected tries, converts to a probability.
 * Returns null (rather than a guess) whenever there isn't enough historical data —
 * callers should fall back to bookmaker consensus alone in that case.
 */
function estimateAnytimeTryProb(playerId, matchId) {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!player || !match || !player.team_id) return null;

  if (player.team_id !== match.home_team_id && player.team_id !== match.away_team_id) return null;
  const opponentId = player.team_id === match.home_team_id ? match.away_team_id : match.home_team_id;

  const share = playerTryShare(playerId, player.team_id);
  if (share == null) return null;

  const expTeamTries = expectedTeamTries(player.team_id, opponentId);
  if (expTeamTries == null) return null;

  const lambda = expTeamTries * share;
  return fairTryScorerProb(lambda);
}

module.exports = {
  leagueAverageTriesPerTeam,
  teamAttackRate,
  teamDefenseFactor,
  expectedTeamTries,
  playerTryShare,
  fairTryScorerProb,
  estimateAnytimeTryProb,
};

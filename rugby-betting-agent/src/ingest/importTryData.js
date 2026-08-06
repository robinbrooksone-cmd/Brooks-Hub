const fs = require('fs');
const { db, getOrCreateTeam, getOrCreatePlayer } = require('../db');
const { parseCsv } = require('./importResults');

/**
 * Seeds the try-scorer prop model (src/analysis/propsModel.js) from two CSVs of
 * historical results — same "bring your own real data" pattern as importResults.js
 * for the Elo model. Neither shipped sample file is real rugby history; see
 * data/sample-team-tries.csv and data/sample-player-tries.csv for format only.
 *
 * Team tries: date,competition,team,opponent,tries_scored
 *   One row per team per match (so a real match needs two rows, one per side) —
 *   this gives both the team's attack rate (its own tries_scored rows) and its
 *   defense factor (the opponent's tries_scored rows where opponent = this team).
 *
 * Player tries: date,competition,team,player,position,tries
 *   One row per player per match they featured in (tries can be 0).
 */

function importTeamMatchTries(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const records = parseCsv(text)
    .map((r) => ({
      date: r.date,
      competition: r.competition,
      team: r.team,
      opponent: r.opponent,
      triesScored: Number(r.tries_scored),
    }))
    .filter((r) => r.team && r.opponent && Number.isFinite(r.triesScored));

  let processed = 0;
  const insert = db.prepare(
    `INSERT INTO team_match_tries (team_id, opponent_id, match_date, competition, tries_scored)
     VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((recs) => {
    for (const r of recs) {
      const team = getOrCreateTeam(r.team, r.competition);
      const opponent = getOrCreateTeam(r.opponent, r.competition);
      insert.run(team.id, opponent.id, r.date, r.competition, r.triesScored);
      processed += 1;
    }
  });
  tx(records);

  return { processed };
}

function importPlayerTries(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const records = parseCsv(text)
    .map((r) => ({
      date: r.date,
      competition: r.competition,
      team: r.team,
      player: r.player,
      position: r.position || null,
      tries: Number(r.tries),
    }))
    .filter((r) => r.team && r.player && Number.isFinite(r.tries));

  let processed = 0;
  const insert = db.prepare(
    `INSERT INTO player_tries (player_id, team_id, match_date, competition, tries)
     VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((recs) => {
    for (const r of recs) {
      const team = getOrCreateTeam(r.team, r.competition);
      const player = getOrCreatePlayer(r.player, team.id);
      if (r.position && !player.position) {
        db.prepare('UPDATE players SET position = ? WHERE id = ?').run(r.position, player.id);
      }
      insert.run(player.id, team.id, r.date, r.competition, r.tries);
      processed += 1;
    }
  });
  tx(records);

  return { processed };
}

module.exports = { importTeamMatchTries, importPlayerTries };

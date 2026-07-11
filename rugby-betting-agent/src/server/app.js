const path = require('path');
const express = require('express');
const { db } = require('../db');
const config = require('../config');
const { generateDailyReport, upcomingOpportunities, groupByMatch } = require('../reports/dailyReport');
const { getMatchDetail, findMatches } = require('../reports/matchDetail');

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/opportunities', (req, res) => {
    const daysAhead = Number(req.query.days) || 7;
    const rows = upcomingOpportunities(daysAhead);
    res.json({ matchGroups: groupByMatch(rows) });
  });

  app.get('/api/matches/upcoming', (req, res) => {
    const rows = db
      .prepare(
        `SELECT m.id, m.competition, m.kickoff_at, home.name AS home_team, away.name AS away_team
         FROM matches m
         JOIN teams home ON home.id = m.home_team_id
         JOIN teams away ON away.id = m.away_team_id
         WHERE m.status = 'scheduled' AND m.kickoff_at >= datetime('now')
         ORDER BY m.kickoff_at ASC`
      )
      .all();
    res.json({ matches: rows });
  });

  app.get('/api/reports/latest', (req, res) => {
    const { json } = generateDailyReport();
    res.json(json);
  });

  // Registered before /api/matches/:id so "search" isn't swallowed as an id param.
  app.get('/api/matches/search', (req, res) => {
    const { team, competition } = req.query;
    res.json({ matches: findMatches({ team, competition }) });
  });

  app.get('/api/matches/:id', (req, res) => {
    const detail = getMatchDetail(Number(req.params.id));
    if (!detail) return res.status(404).json({ error: 'match not found' });
    res.json(detail);
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  return app;
}

function startServer() {
  const app = createApp();
  app.listen(config.server.port, () => {
    console.log(`Rugby betting agent dashboard running at http://localhost:${config.server.port}`);
  });
}

module.exports = { createApp, startServer };

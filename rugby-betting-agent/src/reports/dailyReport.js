const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const config = require('../config');

function upcomingOpportunities(daysAhead = 7) {
  return db
    .prepare(
      `SELECT vo.*, m.competition, m.kickoff_at,
              home.name AS home_team, away.name AS away_team
       FROM value_opportunities vo
       JOIN matches m ON m.id = vo.match_id
       JOIN teams home ON home.id = m.home_team_id
       JOIN teams away ON away.id = m.away_team_id
       WHERE m.kickoff_at BETWEEN datetime('now') AND datetime('now', ?)
         AND vo.flagged_at = (
           SELECT MAX(flagged_at) FROM value_opportunities vo2
           WHERE vo2.match_id = vo.match_id AND vo2.bookmaker = vo.bookmaker
             AND vo2.market_type = vo.market_type AND vo2.selection = vo.selection
             AND IFNULL(vo2.line, -999999) = IFNULL(vo.line, -999999)
         )
       ORDER BY m.kickoff_at ASC, vo.edge_pct DESC`
    )
    .all(`+${daysAhead} days`);
}

function groupByMatch(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.match_id)) {
      groups.set(row.match_id, {
        matchId: row.match_id,
        competition: row.competition,
        kickoffAt: row.kickoff_at,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        opportunities: [],
      });
    }
    groups.get(row.match_id).opportunities.push(row);
  }
  return [...groups.values()];
}

function toMarkdown(matchGroups, generatedAt) {
  const lines = [];
  lines.push(`# South African Rugby Betting — Daily Value Report`);
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push(
    '_Analysis only — no bets are placed automatically. Prices move fast; verify at the bookmaker before acting. Bet within your means and only with licensed, regulated operators._'
  );
  lines.push('');

  if (!matchGroups.length) {
    lines.push('No flagged opportunities in the next 7 days. Either no value found, or not enough odds have been ingested yet — run `npm run ingest` first.');
    return lines.join('\n');
  }

  for (const group of matchGroups) {
    lines.push(`## ${group.homeTeam} vs ${group.awayTeam} — ${group.competition}`);
    lines.push(`Kickoff: ${group.kickoffAt}`);
    lines.push('');
    lines.push('| Bookmaker | Market | Selection | Line | Price | Fair Price | Edge | Confidence | Suggested max stake (fractional Kelly) |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const o of group.opportunities) {
      const fairPrice = (1 / o.fair_prob).toFixed(2);
      lines.push(
        `| ${o.bookmaker} | ${o.market_type} | ${o.selection} | ${o.line ?? '-'} | ${o.price.toFixed(2)} | ${fairPrice} | +${o.edge_pct.toFixed(1)}% | ${o.confidence} | ${(o.kelly_fraction * 100).toFixed(1)}% of bankroll |`
      );
    }
    lines.push('');
    lines.push('Rationale:');
    for (const o of group.opportunities) {
      lines.push(`- **${o.bookmaker} / ${o.selection}**: ${o.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateDailyReport({ daysAhead = 7 } = {}) {
  const rows = upcomingOpportunities(daysAhead);
  const matchGroups = groupByMatch(rows);
  const generatedAt = new Date().toISOString();

  const markdown = toMarkdown(matchGroups, generatedAt);
  const json = { generatedAt, matchGroups };

  fs.mkdirSync(config.reportsDir, { recursive: true });
  const dateStamp = generatedAt.slice(0, 10);
  fs.writeFileSync(path.join(config.reportsDir, `${dateStamp}.md`), markdown, 'utf8');
  fs.writeFileSync(path.join(config.reportsDir, `${dateStamp}.json`), JSON.stringify(json, null, 2), 'utf8');
  fs.writeFileSync(path.join(config.reportsDir, 'latest.md'), markdown, 'utf8');
  fs.writeFileSync(path.join(config.reportsDir, 'latest.json'), JSON.stringify(json, null, 2), 'utf8');

  return { markdown, json };
}

module.exports = { generateDailyReport, upcomingOpportunities, groupByMatch };

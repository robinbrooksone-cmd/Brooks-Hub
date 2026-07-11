#!/usr/bin/env node
const path = require('path');
const { ingestAll } = require('./ingest/ingestOdds');
const { importResultsFromFile } = require('./ingest/importResults');
const { importTeamMatchTries, importPlayerTries } = require('./ingest/importTryData');
const { importPropOddsFromFile } = require('./ingest/importPropOdds');
const { importMatchOddsFromFile } = require('./ingest/importMatchOdds');
const { analyzeAllUpcomingMatches } = require('./analysis/analyze');
const { generateDailyReport } = require('./reports/dailyReport');
const { startServer } = require('./server/app');
const scheduler = require('./scheduler');

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'ingest': {
      const summary = await ingestAll();
      console.log('Ingest summary:', summary);
      break;
    }
    case 'analyze': {
      const summary = analyzeAllUpcomingMatches();
      console.log('Analyze summary:', summary);
      break;
    }
    case 'report': {
      generateDailyReport();
      console.log('Report written to reports/latest.md and reports/latest.json');
      break;
    }
    case 'seed-elo': {
      const file = args[0] || path.join(__dirname, '..', 'data', 'sample-results.csv');
      const { processed } = importResultsFromFile(file);
      console.log(`Imported ${processed} results from ${file} into the Elo model.`);
      break;
    }
    case 'seed-tries': {
      const teamFile = args[0] || path.join(__dirname, '..', 'data', 'sample-team-tries.csv');
      const playerFile = args[1] || path.join(__dirname, '..', 'data', 'sample-player-tries.csv');
      const teamResult = importTeamMatchTries(teamFile);
      const playerResult = importPlayerTries(playerFile);
      console.log(`Imported ${teamResult.processed} team-match try rows from ${teamFile}.`);
      console.log(`Imported ${playerResult.processed} player try rows from ${playerFile}.`);
      break;
    }
    case 'ingest-props': {
      const file = args[0] || path.join(__dirname, '..', 'data', 'sample-prop-odds.csv');
      const { stored, rejected } = importPropOddsFromFile(file);
      console.log(`Stored ${stored} prop odds rows from ${file}.`);
      if (rejected.length) console.log(`Rejected ${rejected.length} rows:`, rejected.slice(0, 5));
      break;
    }
    case 'ingest-match-odds': {
      const file = args[0] || path.join(__dirname, '..', 'data', 'sample-match-odds.csv');
      const { stored, rejected } = importMatchOddsFromFile(file);
      console.log(`Stored ${stored} match odds rows from ${file}.`);
      if (rejected.length) console.log(`Rejected ${rejected.length} rows:`, rejected.slice(0, 5));
      break;
    }
    case 'serve': {
      startServer();
      break;
    }
    case 'schedule': {
      scheduler.start();
      break;
    }
    case 'pipeline': {
      await scheduler.runFullPipeline();
      break;
    }
    default:
      console.log(`Usage: node src/cli.js <command>

Commands:
  ingest      Pull odds from the configured Odds API sports + any enabled scrapers
  analyze     Recompute fair values and flag value opportunities for upcoming matches
  report      Write reports/latest.md and reports/latest.json
  seed-elo [csvPath]   Import historical results into the Elo model (defaults to sample data)
  seed-tries [teamCsvPath] [playerCsvPath]   Import team/player try history for the props model
  ingest-props [csvPath]   Import manually-collected player prop odds (anytime/first try scorer)
  ingest-match-odds [csvPath]   Import manually-collected match odds (h2h/spreads/totals) — useful for
                                 fixtures thin on API/scraper coverage, e.g. the U20 World Cup
  serve       Start the dashboard web server
  schedule    Start the daily cron scheduler (ingest -> analyze -> report)
  pipeline    Run ingest -> analyze -> report once, immediately
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
const path = require('path');
const { ingestAll } = require('./ingest/ingestOdds');
const { importResultsFromFile } = require('./ingest/importResults');
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

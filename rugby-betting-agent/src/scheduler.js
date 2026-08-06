const cron = require('node-cron');
const config = require('./config');
const { ingestAll } = require('./ingest/ingestOdds');
const { analyzeAllUpcomingMatches } = require('./analysis/analyze');
const { generateDailyReport } = require('./reports/dailyReport');

async function runFullPipeline() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running ingest -> analyze -> report pipeline...`);
  try {
    const ingestSummary = await ingestAll();
    console.log('Ingest summary:', ingestSummary);

    const analyzeSummary = analyzeAllUpcomingMatches();
    console.log('Analyze summary:', analyzeSummary);

    generateDailyReport();
    console.log('Daily report written to reports/latest.md');
  } catch (err) {
    console.error('Pipeline run failed:', err);
  }
}

function start() {
  console.log(
    `Scheduling daily pipeline at cron "${config.scheduler.reportCron}" (${config.scheduler.timezone})`
  );
  cron.schedule(config.scheduler.reportCron, runFullPipeline, { timezone: config.scheduler.timezone });
  console.log('Scheduler running. Press Ctrl+C to stop.');
}

module.exports = { start, runFullPipeline };

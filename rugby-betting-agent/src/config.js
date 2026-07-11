const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function list(value, fallback = []) {
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  oddsApi: {
    key: process.env.ODDS_API_KEY || '',
    baseUrl: process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4',
    sportKeys: list(process.env.ODDS_API_SPORT_KEYS, ['rugbyunion_six_nations']),
    regions: list(process.env.ODDS_API_REGIONS, ['za', 'uk', 'eu']),
    markets: list(process.env.ODDS_API_MARKETS, ['h2h']),
    oddsFormat: process.env.ODDS_API_ODDS_FORMAT || 'decimal',
  },
  scrapers: {
    enabled: bool(process.env.SCRAPERS_ENABLED, false),
    userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; rugby-betting-agent/1.0)',
    requestDelayMs: num(process.env.SCRAPER_REQUEST_DELAY_MS, 2000),
  },
  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'rugby-betting-agent.db'),
  },
  analysis: {
    edgeThresholdPct: num(process.env.EDGE_THRESHOLD_PCT, 3),
    outlierThresholdPct: num(process.env.OUTLIER_THRESHOLD_PCT, 5),
    minBookmakersForConsensus: num(process.env.MIN_BOOKMAKERS_FOR_CONSENSUS, 2),
    consensusWeight: num(process.env.CONSENSUS_WEIGHT, 0.65),
    eloWeight: num(process.env.ELO_WEIGHT, 0.35),
    kellyFractionCap: num(process.env.KELLY_FRACTION_CAP, 0.25),
    defaultDrawProb: num(process.env.DEFAULT_DRAW_PROB, 0.02),
  },
  elo: {
    initialRating: num(process.env.ELO_INITIAL_RATING, 1500),
    kFactor: num(process.env.ELO_K_FACTOR, 32),
    homeAdvantage: num(process.env.ELO_HOME_ADVANTAGE, 60),
  },
  server: {
    port: num(process.env.PORT, 4100),
  },
  scheduler: {
    reportCron: process.env.REPORT_TIME_CRON || '0 7 * * *',
    timezone: process.env.TZ || 'Africa/Johannesburg',
  },
  reportsDir: path.join(__dirname, '..', 'reports'),
};

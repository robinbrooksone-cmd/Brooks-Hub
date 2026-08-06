const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const config = require('../config');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'bookmakers.json');
const PLACEHOLDER = 'REPLACE_WITH_REAL_SELECTOR';

function loadBookmakerConfigs() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return raw.bookmakers || [];
}

function isConfigured(selectors) {
  return Object.values(selectors).every((v) => v && v !== PLACEHOLDER);
}

/**
 * Fetches and parses one bookmaker's rugby page using its configured CSS selectors.
 * This is a generic engine, not a per-site scraper: it only works once you've filled
 * in real selectors in config/bookmakers.json for that entry, and only runs at all
 * when SCRAPERS_ENABLED=true and the entry's own `enabled` flag is true.
 */
async function scrapeBookmaker(bookmakerConfig, competitionLabel) {
  const { label, oddsUrl, selectors } = bookmakerConfig;

  if (!isConfigured(selectors)) {
    return { skipped: true, reason: 'selectors not configured', records: [] };
  }

  const res = await fetch(oddsUrl, {
    headers: { 'User-Agent': config.scrapers.userAgent },
  });
  if (!res.ok) {
    throw new Error(`Scrape of ${label} failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const records = [];
  $(selectors.eventRow).each((_, el) => {
    const row = $(el);
    const homeTeam = row.find(selectors.homeTeam).first().text().trim();
    const awayTeam = row.find(selectors.awayTeam).first().text().trim();
    const kickoffAt = row.find(selectors.kickoffTime).first().attr('datetime')
      || row.find(selectors.kickoffTime).first().text().trim();
    const homePrice = parseFloat(row.find(selectors.homePrice).first().text().trim());
    const awayPrice = parseFloat(row.find(selectors.awayPrice).first().text().trim());
    const drawPrice = selectors.drawPrice
      ? parseFloat(row.find(selectors.drawPrice).first().text().trim())
      : null;

    if (!homeTeam || !awayTeam || !Number.isFinite(homePrice) || !Number.isFinite(awayPrice)) {
      return; // row didn't match expected shape — skip rather than record garbage
    }

    const base = { competition: competitionLabel, homeTeam, awayTeam, kickoffAt, bookmaker: label, marketType: 'h2h', line: null };
    records.push({ ...base, selection: homeTeam, price: homePrice });
    records.push({ ...base, selection: awayTeam, price: awayPrice });
    if (Number.isFinite(drawPrice)) {
      records.push({ ...base, selection: 'Draw', price: drawPrice });
    }
  });

  return { skipped: false, records };
}

async function scrapeAllConfiguredBookmakers(competitionLabel) {
  if (!config.scrapers.enabled) {
    return { records: [], skippedBookmakers: [], disabled: true };
  }

  const bookmakers = loadBookmakerConfigs().filter((b) => b.enabled);
  const records = [];
  const skippedBookmakers = [];

  for (const bm of bookmakers) {
    try {
      const result = await scrapeBookmaker(bm, competitionLabel);
      if (result.skipped) {
        skippedBookmakers.push({ key: bm.key, reason: result.reason });
      } else {
        records.push(...result.records);
      }
    } catch (err) {
      skippedBookmakers.push({ key: bm.key, reason: err.message });
    }
    // Be a polite scraper: space out requests.
    await new Promise((resolve) => setTimeout(resolve, config.scrapers.requestDelayMs));
  }

  return { records, skippedBookmakers, disabled: false };
}

module.exports = { loadBookmakerConfigs, scrapeBookmaker, scrapeAllConfiguredBookmakers };

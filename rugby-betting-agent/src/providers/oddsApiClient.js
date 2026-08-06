const config = require('../config');

/**
 * Client for a The-Odds-API-shaped provider (https://the-odds-api.com/liveapi/guides/v4/).
 * Any provider that returns the same event/bookmaker/market/outcome shape can be pointed
 * at via ODDS_API_BASE_URL. Sport keys and regions are NOT hardcoded beyond the .env
 * defaults — verify them against your provider account, since rugby tournament windows
 * and regional bookmaker coverage change over the season.
 */

async function fetchSportOdds(sportKey) {
  if (!config.oddsApi.key) {
    throw new Error(
      'ODDS_API_KEY is not set. Add it to .env — see .env.example for where to get one.'
    );
  }

  const url = new URL(`${config.oddsApi.baseUrl}/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', config.oddsApi.key);
  url.searchParams.set('regions', config.oddsApi.regions.join(','));
  url.searchParams.set('markets', config.oddsApi.markets.join(','));
  url.searchParams.set('oddsFormat', config.oddsApi.oddsFormat);
  url.searchParams.set('dateFormat', 'iso');

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API request failed for sport "${sportKey}": ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

/**
 * Normalizes a provider event into the flat odds records used by the ingestion pipeline.
 * Expected shape per https://the-odds-api.com/liveapi/guides/v4/#get-odds:
 * { id, sport_key, commence_time, home_team, away_team,
 *   bookmakers: [{ key, title, markets: [{ key, outcomes: [{ name, price, point }] }] }] }
 */
function normalizeEvent(event, competitionLabel) {
  const records = [];
  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      for (const outcome of market.outcomes || []) {
        records.push({
          externalId: event.id,
          competition: competitionLabel,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          kickoffAt: event.commence_time,
          bookmaker: bookmaker.title || bookmaker.key,
          marketType: market.key,
          selection: outcome.name,
          line: outcome.point ?? null,
          price: outcome.price,
        });
      }
    }
  }
  return records;
}

async function fetchAllConfiguredOdds() {
  const all = [];
  for (const sportKey of config.oddsApi.sportKeys) {
    const events = await fetchSportOdds(sportKey);
    for (const event of events) {
      all.push(...normalizeEvent(event, sportKey));
    }
  }
  return all;
}

module.exports = { fetchSportOdds, normalizeEvent, fetchAllConfiguredOdds };

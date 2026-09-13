'use strict';

/**
 * Roster resolution.
 *
 * Team assignments in slips.json are hand-written hints, and hand-written
 * hints rot: a player changes teams in the off-season and the hint quietly
 * points at the wrong game. This module asks ESPN who is actually on each
 * roster and builds a name -> team index, so the app corrects itself instead
 * of depending on anyone's memory.
 *
 * Rosters change rarely, so the index is fetched once and reused for
 * ROSTER_TTL_MS. It is strictly an enhancement: if the fetch fails, legs fall
 * back to whatever hint slips.json carries and nothing else breaks.
 */

const { normalizeName, initialLastKey, getJson } = require('./espn');

const TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40';
const rosterUrl = (teamId) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;

const ROSTER_TTL_MS = 12 * 60 * 60 * 1000; // half a day

let cache = {
  byName: new Map(),
  byInitialLast: new Map(),
  teams: 0,
  players: 0,
  fetchedAt: 0,
  error: null,
};

let inFlight = null;

/** ESPN nests roster athletes by position group, but has served them flat too. */
function collectAthletes(rosterPayload) {
  const groups = rosterPayload?.athletes;
  if (!Array.isArray(groups)) return [];

  const out = [];
  for (const group of groups) {
    if (Array.isArray(group?.items)) out.push(...group.items);
    else if (group?.id || group?.displayName) out.push(group);
  }
  return out;
}

function indexAthlete(maps, athlete, team) {
  const name = athlete?.displayName || athlete?.fullName || athlete?.shortName;
  if (!name) return false;

  const entry = {
    name,
    team: team.abbr,
    teamName: team.name,
    position: athlete?.position?.abbreviation || '',
    jersey: athlete?.jersey || '',
  };

  const full = normalizeName(name);
  if (!maps.byName.has(full)) maps.byName.set(full, entry);

  const loose = initialLastKey(full);
  if (loose) {
    // Ambiguous short names are worse than none — mark and skip them.
    if (maps.byInitialLast.has(loose)) maps.byInitialLast.set(loose, null);
    else maps.byInitialLast.set(loose, entry);
  }
  return true;
}

async function build() {
  const teamsPayload = await getJson(TEAMS_URL);
  const teamEntries =
    teamsPayload?.sports?.[0]?.leagues?.[0]?.teams ||
    teamsPayload?.leagues?.[0]?.teams ||
    [];

  const teams = teamEntries
    .map((t) => t?.team)
    .filter(Boolean)
    .map((t) => ({
      id: String(t.id),
      abbr: t.abbreviation || '',
      name: t.displayName || t.shortDisplayName || '',
    }));

  if (!teams.length) throw new Error('no teams in ESPN teams payload');

  const maps = { byName: new Map(), byInitialLast: new Map() };
  let players = 0;
  let loaded = 0;

  // One team failing shouldn't cost the other 31.
  const results = await Promise.allSettled(
    teams.map(async (team) => ({ team, payload: await getJson(rosterUrl(team.id)) }))
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    loaded += 1;
    for (const athlete of collectAthletes(result.value.payload)) {
      if (indexAthlete(maps, athlete, result.value.team)) players += 1;
    }
  }

  if (!players) throw new Error('no athletes parsed from any roster');

  cache = {
    byName: maps.byName,
    byInitialLast: maps.byInitialLast,
    teams: loaded,
    players,
    fetchedAt: Date.now(),
    error: null,
  };

  console.log(`[rosters] indexed ${players} players across ${loaded} teams`);
  return cache;
}

/** Returns the current index, refreshing it if stale. Never throws. */
async function getRosterIndex() {
  const fresh = cache.fetchedAt && Date.now() - cache.fetchedAt < ROSTER_TTL_MS;
  if (fresh) return cache;
  if (inFlight) return inFlight;

  inFlight = build()
    .catch((err) => {
      // Keep any previous index rather than dropping to nothing.
      cache = { ...cache, error: String(err?.message || err) };
      console.error(`[rosters] ${cache.error}`);
      return cache;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Look a player up. Unambiguous first-initial+surname is accepted as a fallback. */
function lookupRoster(index, playerName, aliases = []) {
  const candidates = [playerName, ...(Array.isArray(aliases) ? aliases : [])];

  for (const candidate of candidates) {
    const hit = index.byName.get(normalizeName(candidate));
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const key = initialLastKey(normalizeName(candidate));
    const hit = key ? index.byInitialLast.get(key) : null;
    if (hit) return hit; // null means the short name was ambiguous
  }
  return null;
}

function summary() {
  return {
    teams: cache.teams,
    players: cache.players,
    fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
    error: cache.error,
  };
}

module.exports = { getRosterIndex, lookupRoster, summary, ROSTER_TTL_MS, TEAMS_URL, rosterUrl };

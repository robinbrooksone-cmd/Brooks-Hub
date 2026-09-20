'use strict';

/**
 * FotMob data adapter.
 *
 * Split deliberately in two:
 *
 *   - PURE MAPPERS (exported below) turn a FotMob JSON payload into this
 *     model's schema. They touch no network, so they are unit-testable and can
 *     be run against a JSON file saved from a browser.
 *   - The NETWORK layer (fetchJson and the endpoint helpers) is a thin wrapper
 *     that only exists to obtain those payloads.
 *
 * That split matters because FotMob is unreachable from some environments. The
 * mapping, which is where the actual work and the actual bugs live, can still
 * be developed and verified; only the transport needs a machine with access.
 *
 * FotMob has no documented public API and its response shapes change without
 * notice. Every mapper therefore probes several candidate paths and, when it
 * cannot find what it needs, throws an error naming the keys it DID see rather
 * than silently returning empty data. Silent empties are how a squad ends up
 * half-populated and the model starts pricing a phantom bench.
 */

const BASE = process.env.FOTMOB_BASE || 'https://www.fotmob.com/api';

/** Premier League. FotMob's own league id. */
const PREMIER_LEAGUE_ID = 47;

/* ------------------------------------------------------------------ util */

/** Walk a list of candidate paths and return the first that resolves. */
function pick(obj, paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(key in cur)) { ok = false; break; }
      cur = cur[key];
    }
    if (ok && cur != null) return cur;
  }
  return undefined;
}

/** Describe what a payload actually contains, for error messages. */
function describe(obj, depth = 2) {
  if (obj == null) return String(obj);
  if (Array.isArray(obj)) return `array[${obj.length}]${obj.length && depth > 0 ? ` of ${describe(obj[0], depth - 1)}` : ''}`;
  if (typeof obj !== 'object') return typeof obj;
  const keys = Object.keys(obj).slice(0, 14);
  return `{${keys.join(', ')}${Object.keys(obj).length > 14 ? ', …' : ''}}`;
}

function shapeError(what, payload) {
  const err = new Error(
    `FotMob ${what}: could not find the expected fields. Payload looked like ${describe(payload)}. ` +
    'The API shape has probably changed - re-run with --dump to capture it.'
  );
  err.code = 'FOTMOB_SHAPE';
  return err;
}

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const num = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // FotMob mixes "12", "1.4", "45%" and { value: 3 }.
  if (typeof v === 'object') return num(v.value ?? v.total ?? v.statValue);
  const cleaned = String(v).replace(/[%,]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/* -------------------------------------------------------------- mapping */

/** FotMob position codes to this model's functional archetypes. */
const POSITION_TO_ROLE = {
  GK: 'goalkeeper',
  CB: 'cover-defender', RCB: 'cover-defender', LCB: 'cover-defender',
  LB: 'defensive-fullback', RB: 'defensive-fullback',
  LWB: 'wingback', RWB: 'wingback',
  DM: 'holding-mid', CDM: 'holding-mid',
  CM: 'box-to-box', RCM: 'box-to-box', LCM: 'box-to-box',
  AM: 'attacking-mid', CAM: 'attacking-mid',
  LM: 'wide-playmaker', RM: 'wide-playmaker',
  LW: 'inverted-winger', RW: 'inverted-winger',
  ST: 'pressing-forward', CF: 'pressing-forward', FW: 'pressing-forward',
};

const FLANK_BY_POSITION = {
  LB: 'left', LWB: 'left', LM: 'left', LW: 'left', LCB: 'left', LCM: 'left',
  RB: 'right', RWB: 'right', RM: 'right', RW: 'right', RCB: 'right', RCM: 'right',
};

/**
 * Refine the archetype using season output.
 *
 * Position alone cannot separate a traditional winger from an inside forward,
 * and that distinction is worth a factor of two in shots. Where the stats say
 * something clear, they win.
 */
function inferRoleType(position, per90 = {}) {
  const base = POSITION_TO_ROLE[String(position || '').toUpperCase()] || 'box-to-box';
  const { shots = 0, crosses = 0, keyPasses = 0, tackles = 0, aerials = 0, passes = 0 } = per90;

  if (base === 'inverted-winger' || base === 'wide-playmaker') {
    if (shots >= 2.6) return 'inside-forward';
    if (crosses >= 3.0 && shots < 1.9) return 'traditional-winger';
    if (keyPasses >= 2.2) return 'wide-playmaker';
    return base;
  }
  if (base === 'pressing-forward') {
    if (aerials >= 6.0) return 'target-forward';
    if (shots >= 3.2 && keyPasses < 1.2) return 'poacher';
    if (keyPasses >= 1.7 && shots < 2.6) return 'false-9';
    return base;
  }
  if (base === 'box-to-box') {
    if (passes >= 68) return 'deep-playmaker';
    if (tackles >= 2.4 && shots < 1.0) return 'holding-mid';
    if (keyPasses >= 1.9) return 'attacking-mid';
    return base;
  }
  if (base === 'cover-defender') {
    if (passes >= 62) return 'ball-playing-defender';
    if (tackles >= 1.7) return 'aggressive-stopper';
    return base;
  }
  if (base === 'defensive-fullback') {
    if (crosses >= 2.2) return 'attacking-fullback';
    if (passes >= 55) return 'inverted-fullback';
    return base;
  }
  return base;
}

/**
 * FotMob stat labels to this model's metric names. Labels vary by endpoint and
 * locale, so each metric lists every spelling seen.
 */
const STAT_ALIASES = {
  goals: ['goals'],
  assists: ['assists'],
  shots: ['shots', 'total shots', 'shots total'],
  sot: ['shots on target', 'shots on target per 90', 'sot'],
  keyPasses: ['chances created', 'key passes', 'big chances created'],
  fouls: ['fouls committed', 'fouls', 'fouls conceded'],
  foulsDrawn: ['fouls won', 'was fouled', 'fouls suffered', 'fouls drawn'],
  tackles: ['tackles', 'tackles attempted', 'tackles won'],
  interceptions: ['interceptions'],
  clearances: ['clearances'],
  blocks: ['blocks', 'shots blocked'],
  dribblesAttempted: ['dribbles attempted', 'take-ons attempted', 'dribbles'],
  dribblesCompleted: ['successful dribbles', 'dribbles succeeded', 'take-ons succeeded'],
  crosses: ['crosses', 'accurate crosses', 'successful crosses'],
  passes: ['passes', 'passes attempted', 'total passes'],
  passesCompleted: ['accurate passes', 'successful passes', 'passes completed'],
  touches: ['touches'],
  aerials: ['aerial duels', 'aerials', 'duels aerial'],
  aerialsWon: ['aerial duels won', 'aerials won'],
  offsides: ['offsides', 'caught offside'],
  dispossessed: ['dispossessed', 'possession lost'],
  saves: ['saves'],
  yellowCards: ['yellow cards', 'yellow'],
  redCards: ['red cards', 'red'],
  minutes: ['minutes played', 'minutes'],
  appearances: ['matches', 'appearances', 'matches played', 'started'],
};

const normaliseLabel = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Flatten FotMob's assorted stat containers into { label: number }.
 * Handles the flat [{title, value}] form and the grouped
 * [{title, items:[{title, value}]}] form.
 */
function flattenStats(node, out = {}) {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) flattenStats(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;

  const label = node.title ?? node.name ?? node.key ?? node.localizedTitleId;
  const hasChildren = node.items || node.stats || node.statsArr || node.children;

  if (label && !hasChildren) {
    const value = num(node.value ?? node.statValue ?? node.total ?? node.per90);
    if (value != null) out[normaliseLabel(label)] = value;
  }
  for (const key of ['items', 'stats', 'statsArr', 'children', 'statsSection', 'topStats']) {
    if (node[key]) flattenStats(node[key], out);
  }
  return out;
}

function statValue(flat, metric) {
  for (const alias of STAT_ALIASES[metric] || []) {
    const v = flat[normaliseLabel(alias)];
    if (v != null) return v;
  }
  return null;
}

/**
 * Convert season totals to per-90 rates.
 *
 * Guarded on minutes: a player with 90 minutes all season produces per-90
 * numbers that are pure noise, and feeding those into the model is worse than
 * falling back to his role archetype. Below the threshold we return nothing and
 * let the role layer supply the baseline.
 */
function toPer90(flat, { minMinutes = 270 } = {}) {
  const minutes = statValue(flat, 'minutes');
  if (!minutes || minutes < minMinutes) return { per90: null, minutes: minutes || 0, reliable: false };

  const per = (metric) => {
    const total = statValue(flat, metric);
    return total == null ? null : (total / minutes) * 90;
  };

  const per90 = {};
  for (const metric of [
    'goals', 'assists', 'shots', 'sot', 'keyPasses', 'fouls', 'foulsDrawn',
    'tackles', 'interceptions', 'clearances', 'blocks',
    'dribblesAttempted', 'dribblesCompleted', 'crosses',
    'passes', 'passesCompleted', 'touches', 'aerials', 'aerialsWon',
    'offsides', 'dispossessed', 'saves',
  ]) {
    const v = per(metric);
    if (v != null) per90[metric] = Math.round(v * 1000) / 1000;
  }

  return { per90, minutes, reliable: true };
}

/**
 * Card proneness: cards per foul, relative to the league norm of roughly one
 * booking per eight fouls. This is the player-specific part of the booking
 * hazard, and taking it from real data is a genuine upgrade on a guess.
 */
function cardProneness(flat) {
  const yellows = statValue(flat, 'yellowCards');
  const fouls = statValue(flat, 'fouls');
  if (yellows == null || !fouls || fouls < 12) return 1;
  const ratio = yellows / fouls;
  const league = 0.125;
  // Damped and bounded: a small sample should not produce a 2x multiplier.
  return Math.min(1.8, Math.max(0.5, 1 + 0.6 * (ratio / league - 1)));
}

/** Map one FotMob player payload into this model's player record. */
function mapPlayer(payload, { teamId, verifiedAt }) {
  const id = pick(payload, ['id', 'playerId']);
  const name = pick(payload, ['name', 'playerName', 'name.fullName']);
  if (!name) throw shapeError('player', payload);

  const position = pick(payload, [
    'positionDescription.primaryPosition.label',
    'primaryPosition',
    'position.label',
    'position',
    'role',
  ]);

  const flat = flattenStats(
    pick(payload, ['mainLeague.stats', 'statSeasons', 'stats', 'playerProps', 'topStats']) ?? payload
  );

  const { per90, minutes, reliable } = toPer90(flat);
  const posCode = String(position || '').toUpperCase().slice(0, 3);

  return {
    id: slug(name),
    fotmobId: id ?? null,
    name,
    team: teamId,
    position: position || null,
    roleType: inferRoleType(posCode, per90 || {}),
    flank: FLANK_BY_POSITION[posCode] || 'central',
    pace: null, // FotMob does not publish a pace rating; left for the role default
    startProb: null, // set from line-ups or appearance rate, not guessed here
    benchProb: null,
    cardProneness: cardProneness(flat),
    setPieces: { penalties: 0, freeKicks: 0, corners: 0 },
    per90: per90 || undefined,
    sourceMinutes: minutes,
    statsReliable: reliable,
    verifiedAt,
    source: 'fotmob',
  };
}

/**
 * Selection probability from appearance history.
 *
 * Without a confirmed line-up this is the honest estimate: how often has he
 * started, tempered towards the mean so a three-game sample does not produce
 * a 1.0. Confirmed line-ups override it entirely.
 */
function startProbFromHistory({ starts, appearances, teamMatches }) {
  if (!teamMatches || teamMatches < 1) return null;
  const s = starts ?? 0;
  const apps = appearances ?? s;
  // Beta(2,2)-style shrinkage: two phantom matches either side.
  const startRate = (s + 2) / (teamMatches + 4);
  const appRate = (apps + 2) / (teamMatches + 4);
  const benchRate = Math.max(0, appRate - startRate);
  return {
    startProb: Math.min(0.95, Math.max(0.02, startRate)),
    benchProb: Math.min(0.9, Math.max(0.02, benchRate + 0.08)),
  };
}

/** Map a FotMob squad payload into a flat list of player stubs. */
function mapSquad(payload, { teamId }) {
  const groups = pick(payload, ['squad.squad', 'squad', 'details.squad']);
  if (!Array.isArray(groups)) throw shapeError('squad', payload);

  const players = [];
  for (const group of groups) {
    const title = normaliseLabel(group.title ?? group.name);
    if (title === 'coach' || title === 'coaches' || title === 'manager') continue;
    const members = group.members ?? group.players ?? [];
    for (const m of members) {
      const name = pick(m, ['name', 'playerName']);
      if (!name) continue;
      players.push({
        fotmobId: pick(m, ['id', 'playerId']) ?? null,
        name,
        team: teamId,
        positionGroup: title,
        role: pick(m, ['role', 'position']) ?? null,
      });
    }
  }
  if (players.length === 0) throw shapeError('squad (no members)', payload);
  return players;
}

/** Pull confirmed line-ups and the referee out of a match-details payload. */
function mapMatchDetails(payload) {
  const general = pick(payload, ['general', 'header']) || {};
  const lineupNode = pick(payload, [
    'content.lineup.lineup', 'content.lineup', 'lineup.lineup', 'lineup',
  ]);

  const referee = pick(payload, [
    'content.matchFacts.infoBox.Referee.text',
    'content.matchFacts.infoBox.Referee.name',
    'content.matchFacts.infoBox.referee.text',
    'general.referee.name',
  ]) ?? null;

  const sides = [];
  if (Array.isArray(lineupNode)) {
    for (const side of lineupNode) {
      const starters = [];
      const bench = [];
      const rows = side.players ?? side.starters ?? [];
      // Starters come as rows of rows (the formation grid).
      const flatRows = Array.isArray(rows[0]) ? rows.flat() : rows;
      for (const p of flatRows) {
        const name = pick(p, ['name', 'playerName', 'name.fullName']);
        if (name) starters.push({ name, fotmobId: pick(p, ['id', 'playerId']) ?? null });
      }
      for (const p of side.bench ?? side.subs ?? []) {
        const name = pick(p, ['name', 'playerName', 'name.fullName']);
        if (name) bench.push({ name, fotmobId: pick(p, ['id', 'playerId']) ?? null });
      }
      sides.push({
        teamName: side.teamName ?? side.name ?? null,
        formation: side.formation ?? null,
        starters,
        bench,
      });
    }
  }

  return {
    matchId: pick(general, ['matchId', 'id']) ?? null,
    kickoff: pick(general, ['matchTimeUTC', 'matchTimeUTCDate', 'started']) ?? null,
    home: pick(general, ['homeTeam.name', 'homeTeam']) ?? null,
    away: pick(general, ['awayTeam.name', 'awayTeam']) ?? null,
    referee,
    lineupsConfirmed: sides.length > 0 && sides.every((s) => s.starters.length >= 11),
    sides,
  };
}

/** Extract Premier League fixtures for a date from the matches-by-date payload. */
function mapFixtures(payload, { leagueId = PREMIER_LEAGUE_ID } = {}) {
  const leagues = pick(payload, ['leagues', 'matches.leagues']);
  if (!Array.isArray(leagues)) throw shapeError('fixtures', payload);

  const league = leagues.find((l) => num(pick(l, ['primaryId', 'id'])) === leagueId)
    || leagues.find((l) => /premier league/i.test(String(pick(l, ['name', 'ccode']) || '')));
  if (!league) {
    const names = leagues.map((l) => pick(l, ['name'])).filter(Boolean).slice(0, 12);
    throw new Error(`FotMob fixtures: no Premier League on this date. Saw: ${names.join(', ')}`);
  }

  return (league.matches || []).map((m) => ({
    fotmobMatchId: pick(m, ['id', 'matchId']),
    home: pick(m, ['home.name', 'home.longName']),
    away: pick(m, ['away.name', 'away.longName']),
    kickoff: pick(m, ['status.utcTime', 'time', 'utcTime']),
    started: Boolean(pick(m, ['status.started'])),
  }));
}

/* -------------------------------------------------------------- network */

const DEFAULT_HEADERS = {
  accept: 'application/json',
  // FotMob rejects requests without a browser-like agent.
  'user-agent': process.env.FOTMOB_UA
    || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

/**
 * Fetch and parse JSON from FotMob.
 *
 * FotMob has at times required a signed header on its API. If one is needed,
 * set FOTMOB_XMAS and it is sent through; without it a 401/403 is reported
 * plainly rather than being mistaken for a shape problem.
 */
async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const headers = { ...DEFAULT_HEADERS };
  if (process.env.FOTMOB_XMAS) headers['x-mas'] = process.env.FOTMOB_XMAS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });

    // A 403 can come from two very different places, and confusing them sends
    // you chasing an auth token you do not need. A network egress proxy
    // announces itself; FotMob does not.
    const denyReason = res.headers.get('x-deny-reason');
    if (res.status === 403 && denyReason) {
      const body = await res.text().catch(() => '');
      const err = new Error(
        `Blocked before reaching FotMob: the network egress policy refused ${url} ` +
        `(${denyReason}${body ? ` - ${body.trim().slice(0, 160)}` : ''}). ` +
        'This is your network, not FotMob. Allow the host, run the fetch elsewhere, ' +
        'or use the offline --from-file path.'
      );
      err.code = 'FOTMOB_EGRESS_BLOCKED';
      throw err;
    }

    if (res.status === 401 || res.status === 403) {
      const err = new Error(
        `FotMob returned ${res.status} for ${url}. It is gating the API - set FOTMOB_XMAS to the x-mas header ` +
        'value your browser sends, then retry.'
      );
      err.code = 'FOTMOB_AUTH';
      throw err;
    }
    if (!res.ok) throw new Error(`FotMob returned ${res.status} ${res.statusText} for ${url}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`FotMob request timed out after ${timeoutMs}ms: ${url}`);
    if (err.code === 'ENOTFOUND' || /fetch failed|ECONNREFUSED|EAI_AGAIN/.test(err.message)) {
      const wrapped = new Error(
        `Cannot reach FotMob (${err.message}). This machine has no route to www.fotmob.com - ` +
        'run the fetch somewhere with open egress, or save the JSON from a browser and use --from-file.'
      );
      wrapped.code = 'FOTMOB_UNREACHABLE';
      throw wrapped;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const endpoints = {
  matchesByDate: (yyyymmdd) => `${BASE}/matches?date=${yyyymmdd}`,
  matchDetails: (matchId) => `${BASE}/matchDetails?matchId=${matchId}`,
  team: (teamId) => `${BASE}/teams?id=${teamId}&tab=squad`,
  player: (playerId) => `${BASE}/playerData?id=${playerId}`,
  league: (leagueId = PREMIER_LEAGUE_ID) => `${BASE}/leagues?id=${leagueId}`,
};

module.exports = {
  BASE, PREMIER_LEAGUE_ID, endpoints, fetchJson,
  // pure mappers
  pick, describe, slug, num, flattenStats, statValue, toPer90, cardProneness,
  inferRoleType, POSITION_TO_ROLE, FLANK_BY_POSITION, STAT_ALIASES,
  mapPlayer, mapSquad, mapMatchDetails, mapFixtures, startProbFromHistory,
};

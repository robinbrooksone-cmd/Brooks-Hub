'use strict';

/**
 * ESPN data layer.
 *
 * Everything here is written against the *actual* shape of ESPN's public
 * summary endpoint, where per-athlete stat lines arrive as parallel arrays:
 *
 *   boxscore.players[]              -> one entry per team
 *     .team.abbreviation
 *     .statistics[]                 -> one entry per category ("passing", ...)
 *       .name      "passing"
 *       .keys      ["completions/passingAttempts","passingYards","yardsPerPassAttempt","passingTouchdowns",...]
 *       .labels    ["C/ATT","YDS","AVG","TD","INT","SACKS","QBR","RTG"]
 *       .text      "C/ATT, YDS, AVG, TD, INT, SACKS, QBR, RTG"
 *       .athletes[]
 *         .athlete { id, displayName, shortName, position:{abbreviation}, headshot:{href} }
 *         .stats   ["18/25","210","8.4","2","0","1-7","75.2","112.3"]   <- strings, positional
 *
 * There are no named stat fields on the athlete rows, so we resolve a column
 * *index* per category and read `stats[index]`. We resolve that index three
 * ways, most reliable first, and record which one worked so the shape can be
 * audited at runtime via /api/debug/shape.
 */

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const SUMMARY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=';

const FETCH_TIMEOUT_MS = 12000;

/* ------------------------------------------------------------------ */
/* Stat definitions                                                    */
/* ------------------------------------------------------------------ */

/**
 * The five stats we track, keyed by the ESPN category they live in.
 * `key`   -> matched against category.keys[]   (semantic, most reliable)
 * `label` -> matched against category.labels[] (what's actually displayed)
 */
const STAT_MAP = {
  passing: {
    pass_yds: { key: 'passingYards', label: 'YDS' },
    pass_td: { key: 'passingTouchdowns', label: 'TD' },
  },
  rushing: {
    rush_yds: { key: 'rushingYards', label: 'YDS' },
    rush_td: { key: 'rushingTouchdowns', label: 'TD' },
  },
  receiving: {
    rec_yds: { key: 'receivingYards', label: 'YDS' },
    rec: { key: 'receptions', label: 'REC' },
    rec_td: { key: 'receivingTouchdowns', label: 'TD' },
  },
  kickReturns: {
    kr_td: { key: 'kickReturnTouchdowns', label: 'TD' },
  },
  puntReturns: {
    pr_td: { key: 'puntReturnTouchdowns', label: 'TD' },
  },
};

/** Components of an "anytime touchdown scorer" prop. A passing TD is the
 *  thrower's, not the scorer's, so it is deliberately not in this list. */
const TD_COMPONENTS = ['rush_td', 'rec_td', 'kr_td', 'pr_td'];

const STAT_LABELS = {
  pass_yds: 'pass yds',
  pass_td: 'pass TDs',
  rush_yds: 'rush yds',
  rush_td: 'rush TDs',
  rec_yds: 'rec yds',
  rec: 'receptions',
  rec_td: 'rec TDs',
  any_td: 'TDs',
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Names have to survive apostrophes, periods, hyphens, accents and suffixes:
 * "Ja'Marr Chase", "Amon-Ra St. Brown", "De'Von Achane", "Marvin Harrison Jr."
 * Both sides of every comparison go through this, so the exact scheme matters
 * less than applying it consistently.
 */
function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+(jr|sr|ii|iii|iv)$/, '')
    .trim();
}

/** "Ja'Marr Chase" -> "j chase", to match ESPN's shortName "J. Chase". */
function initialLastKey(normalized) {
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

/**
 * Stat cells are strings: "210", "2", "--", "8/12", "1-7".
 * Everything we track is a plain integer, but never trust that.
 */
function parseStatCell(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === '--' || text === '-') return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Column resolution                                                   */
/* ------------------------------------------------------------------ */

const shapeReport = { resolvedAt: null, categories: {} };

/**
 * Work out which index in `athlete.stats[]` holds each stat we want.
 * Returns { pass_yds: 1, pass_td: 3, ... } plus a note on how each was found.
 */
function resolveColumnIndices(category, categoryName) {
  const wanted = STAT_MAP[categoryName];
  const keys = Array.isArray(category.keys) ? category.keys : [];
  const labels =
    Array.isArray(category.labels) && category.labels.length
      ? category.labels
      : String(category.text || '')
          .split(/\s*,\s*/)
          .filter(Boolean);

  const indices = {};
  const how = {};

  for (const [statKey, spec] of Object.entries(wanted)) {
    let index = keys.findIndex(
      (k) => String(k).toLowerCase() === spec.key.toLowerCase()
    );
    let via = 'keys';

    if (index < 0) {
      index = labels.findIndex(
        (l) => String(l).trim().toUpperCase() === spec.label
      );
      via = 'labels';
    }

    if (index < 0) {
      via = 'unresolved';
    }

    indices[statKey] = index < 0 ? null : index;
    how[statKey] = index < 0 ? 'unresolved' : `${via}[${index}]`;
  }

  shapeReport.resolvedAt = new Date().toISOString();
  shapeReport.categories[categoryName] = {
    keys,
    labels,
    resolved: how,
  };

  return indices;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fold every athlete in every fetched box score into one index.
 * One athlete can appear in several categories (a RB with rush + rec lines),
 * so stats are merged onto a single record per athlete id.
 */
function buildPlayerIndex(summaries) {
  const byId = new Map();

  for (const { event, data } of summaries) {
    const teamBlocks = data?.boxscore?.players;
    if (!Array.isArray(teamBlocks)) continue;

    for (const teamBlock of teamBlocks) {
      const teamAbbr = teamBlock?.team?.abbreviation || '';
      const categories = Array.isArray(teamBlock?.statistics)
        ? teamBlock.statistics
        : [];

      for (const category of categories) {
        const categoryName = String(category?.name || '').toLowerCase();
        if (!STAT_MAP[categoryName]) continue;

        const indices = resolveColumnIndices(category, categoryName);
        const rows = Array.isArray(category?.athletes) ? category.athletes : [];

        for (const row of rows) {
          const athlete = row?.athlete;
          if (!athlete) continue;

          const id = String(athlete.id ?? athlete.displayName ?? '');
          if (!id) continue;

          let record = byId.get(id);
          if (!record) {
            record = {
              athleteId: id,
              name: athlete.displayName || athlete.shortName || '',
              shortName: athlete.shortName || '',
              position: athlete.position?.abbreviation || '',
              headshot: athlete.headshot?.href || null,
              team: teamAbbr,
              eventId: event.id,
              stats: {},
            };
            byId.set(id, record);
          }

          for (const statKey of Object.keys(STAT_MAP[categoryName])) {
            const index = indices[statKey];
            if (index == null) continue;
            const value = parseStatCell(row.stats?.[index]);
            if (value != null) record.stats[statKey] = value;
          }
        }
      }
    }
  }

  // A player can be split across categories (a rushing block and a receiving
  // block). Those are keyed by athlete id above, so any inconsistency in that
  // id would silently drop half his line. Fold everything for one player in
  // one game into a single record before indexing by name.
  const merged = new Map();
  for (const record of byId.values()) {
    const key = `${record.eventId}::${record.team}::${normalizeName(record.name)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, record);
      continue;
    }
    Object.assign(existing.stats, record.stats);
    existing.headshot = existing.headshot || record.headshot;
    existing.position = existing.position || record.position;
    existing.shortName = existing.shortName || record.shortName;
  }

  // Anytime-TD is a derived stat: it only makes sense once a player's
  // rushing, receiving and return lines have been folded together.
  for (const record of merged.values()) {
    record.stats.any_td = TD_COMPONENTS.reduce(
      (total, key) => total + (record.stats[key] ?? 0),
      0
    );
  }

  // Name -> player records. Both the full normalized name and the
  // first-initial+surname form, so either can resolve a leg.
  const byFullName = new Map();
  const byInitialLast = new Map();

  const push = (map, key, record) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  };

  for (const record of merged.values()) {
    const full = normalizeName(record.name);
    const short = normalizeName(record.shortName);
    push(byFullName, full, record);
    if (short && short !== full) push(byFullName, short, record);
    push(byInitialLast, initialLastKey(full), record);
  }

  return { byId: merged, byFullName, byInitialLast };
}

/**
 * Resolve one slip leg's player against the index.
 * The initial+surname fallback is only trusted when it is unambiguous —
 * "A. Brown" matching three players is worse than no match at all.
 */
function lookupPlayer(index, playerName, aliases = []) {
  const candidates = [playerName, ...(Array.isArray(aliases) ? aliases : [])];

  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    const exact = index.byFullName.get(key);
    if (exact && exact.length) return { record: exact[0], match: 'name' };
  }

  for (const candidate of candidates) {
    const key = initialLastKey(normalizeName(candidate));
    const loose = key ? index.byInitialLast.get(key) : null;
    if (loose && loose.length === 1) return { record: loose[0], match: 'initial' };
  }

  return { record: null, match: 'none' };
}

/* ------------------------------------------------------------------ */
/* Scoreboard                                                          */
/* ------------------------------------------------------------------ */

function parseScoreboard(data) {
  const events = Array.isArray(data?.events) ? data.events : [];

  return events.map((event) => {
    const competition = event?.competitions?.[0] || {};
    const competitors = Array.isArray(competition.competitors)
      ? competition.competitors
      : [];
    const side = (which) => {
      const entry = competitors.find((c) => c.homeAway === which) || {};
      return {
        abbr: entry.team?.abbreviation || '',
        name: entry.team?.shortDisplayName || entry.team?.displayName || '',
        score: entry.score != null ? Number(entry.score) : null,
        logo: entry.team?.logo || null,
      };
    };

    const status = event?.status || competition.status || {};

    return {
      id: String(event.id),
      shortName: event.shortName || '',
      name: event.name || '',
      date: event.date || null,
      state: status.type?.state || 'pre', // 'pre' | 'in' | 'post'
      completed: Boolean(status.type?.completed),
      detail: status.type?.shortDetail || status.type?.detail || '',
      period: status.period ?? null,
      clock: status.displayClock || null,
      home: side('home'),
      away: side('away'),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Fetching, with caching                                              */
/* ------------------------------------------------------------------ */

/**
 * Summary cache. Finished games never change, so once an event is final we
 * keep its box score forever and stop hitting ESPN for it. Live games are
 * always refetched; games that haven't kicked off have no box score at all,
 * so we don't ask.
 */
const summaryCache = new Map(); // eventId -> { data, fetchedAt, final }

let loggedFirstSummary = false;

/** The "log one full response before parsing" step, done once per process. */
function logFirstSummary(eventId, data) {
  if (loggedFirstSummary) return;
  loggedFirstSummary = true;

  const teamBlocks = data?.boxscore?.players || [];
  console.log(
    `\n=== First summary response (event ${eventId}) ===========================`
  );
  console.log(`top-level keys: ${Object.keys(data || {}).join(', ')}`);
  console.log(`boxscore.players[] length: ${teamBlocks.length}`);

  for (const teamBlock of teamBlocks) {
    console.log(`\n  team: ${teamBlock?.team?.abbreviation || '?'}`);
    for (const category of teamBlock?.statistics || []) {
      const sample = category?.athletes?.[0];
      console.log(`    category name  : ${category?.name}`);
      console.log(`    category keys  : ${JSON.stringify(category?.keys)}`);
      console.log(`    category labels: ${JSON.stringify(category?.labels)}`);
      console.log(`    athletes       : ${category?.athletes?.length ?? 0}`);
      if (sample) {
        console.log(
          `    sample athlete : ${sample.athlete?.displayName} -> ${JSON.stringify(sample.stats)}`
        );
      }
    }
  }
  console.log(
    '\n=== end first summary ==================================================\n'
  );
}

async function fetchSummary(event) {
  const cached = summaryCache.get(event.id);
  if (cached?.final) return cached.data;

  const data = await getJson(`${SUMMARY_URL}${encodeURIComponent(event.id)}`);
  logFirstSummary(event.id, data);

  summaryCache.set(event.id, {
    data,
    fetchedAt: Date.now(),
    final: event.state === 'post',
  });

  return data;
}

/**
 * Pull the scoreboard, then box scores for every game that has one.
 * A single failed summary doesn't sink the poll — the other games still
 * report, and the leg for the missing game just shows as unresolved.
 */
async function fetchLiveData({ date, rosters = null } = {}) {
  const url = date
    ? `${SCOREBOARD_URL}?dates=${encodeURIComponent(date)}`
    : SCOREBOARD_URL;

  const scoreboard = await getJson(url);
  const games = parseScoreboard(scoreboard);

  const needBoxScore = games.filter((g) => g.state === 'in' || g.state === 'post');

  const settled = await Promise.allSettled(
    needBoxScore.map(async (event) => ({ event, data: await fetchSummary(event) }))
  );

  const summaries = [];
  const errors = [];
  for (let i = 0; i < settled.length; i += 1) {
    if (settled[i].status === 'fulfilled') {
      summaries.push(settled[i].value);
    } else {
      errors.push({
        eventId: needBoxScore[i].id,
        game: needBoxScore[i].shortName,
        message: String(settled[i].reason?.message || settled[i].reason),
      });
    }
  }

  return {
    games,
    rosters,
    index: buildPlayerIndex(summaries),
    boxScoresLoaded: summaries.length,
    errors,
    week: scoreboard?.week?.number ?? null,
    season: scoreboard?.season?.year ?? null,
    seasonType: scoreboard?.season?.type ?? null,
  };
}

module.exports = {
  SCOREBOARD_URL,
  SUMMARY_URL,
  STAT_MAP,
  STAT_LABELS,
  TD_COMPONENTS,
  normalizeName,
  initialLastKey,
  parseStatCell,
  resolveColumnIndices,
  buildPlayerIndex,
  lookupPlayer,
  parseScoreboard,
  fetchLiveData,
  getJson,
  shapeReport,
  summaryCache,
};

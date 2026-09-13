'use strict';

const { STAT_LABELS, lookupPlayer } = require('./espn');
const { lookupRoster, summary: rosterSummary } = require('./rosters');

/**
 * `team` may be one abbreviation ("BAL") or both sides of the matchup
 * (["MIN","GB"]) — useful when the slip shows the game but you can't be sure
 * which side the player is on. Either way it only supplies pre-kickoff
 * context; the live team comes from the box score.
 */
function findGameByTeam(games, team) {
  if (!team) return null;
  const wanted = (Array.isArray(team) ? team : [team]).map((t) => String(t).toUpperCase());
  return (
    games.find(
      (g) =>
        wanted.includes(g.home.abbr.toUpperCase()) ||
        wanted.includes(g.away.abbr.toUpperCase())
    ) || null
  );
}

function describeLine(leg) {
  // An explicit label wins, for props the "N+ stat" phrasing doesn't fit
  // ("anytime TD", "over 9.5 rush yds").
  if (leg.label) return leg.label;
  return `${leg.line}+ ${STAT_LABELS[leg.stat] || leg.stat}`;
}

function evaluateLeg(leg, position, live, eventsById) {
  if (leg.placeholder) {
    return {
      position,
      placeholder: true,
      status: 'unset',
      player: leg.note || 'Leg not supplied',
      prop: '—',
      value: null,
      line: null,
      toGo: null,
      pct: 0,
      game: null,
    };
  }

  const { record, match } = lookupPlayer(live.index, leg.player, leg.aliases);

  // Three sources for a player's team, most authoritative first: the box score
  // he actually appears in, ESPN's current roster, and finally the hand-written
  // hint in slips.json. The roster lookup is what survives an off-season move —
  // a hint written before a trade is the one thing here that can be out of date.
  const roster = live.rosters ? lookupRoster(live.rosters, leg.player, leg.aliases) : null;
  const hint = leg.team;
  const hintTeam = Array.isArray(hint) ? null : hint || null;

  const teamSource = record ? 'boxscore' : roster ? 'roster' : hintTeam ? 'hint' : null;
  const team = record?.team || roster?.team || hintTeam || '';

  // Prefer the game the player actually turned up in; otherwise look him up by
  // his roster team, falling back to the hint.
  const game = record
    ? eventsById.get(record.eventId) || null
    : findGameByTeam(live.games, roster?.team || hint);

  // In a box score but absent from this category means a genuine zero
  // (a QB with no carries). Absent from every box score means no value yet —
  // except once the game is final, where never appearing really does mean
  // zero, whether he was inactive or just never touched the ball.
  const finished = Boolean(game && game.state === 'post');
  let value;
  if (record) value = record.stats[leg.stat] ?? 0;
  else if (finished) value = 0;
  else value = null;

  const line = Number(leg.line);

  let status;
  if (value != null && value >= line) status = 'hit';
  else if (finished) status = 'miss';
  else if (game && game.state === 'in') status = 'live';
  else status = 'pending';

  return {
    position,
    placeholder: false,
    status,
    player: record?.name || roster?.name || leg.player,
    configuredPlayer: leg.player,
    matchedBy: match,
    team,
    teamSource,
    rosterTeam: roster?.team || null,
    hintTeam,
    // The hint disagrees with ESPN's current roster — almost always an
    // off-season move the slip file hasn't caught up with.
    hintConflict: Boolean(hintTeam && roster && hintTeam !== roster.team),
    positionAbbr: record?.position || roster?.position || '',
    stat: leg.stat,
    prop: describeLine(leg),
    statLines: formatStatLines(record),
    headshot: record?.headshot || null,
    noLine: !record, // no box-score entry for this player at all
    finished,
    value,
    line,
    toGo: Math.max(0, line - (value ?? 0)),
    pct: line > 0 ? Math.min(1, (value ?? 0) / line) : 0,
    game: game
      ? {
          id: game.id,
          shortName: game.shortName,
          state: game.state,
          detail: game.detail,
          score: `${game.away.abbr} ${game.away.score ?? 0} – ${game.home.abbr} ${game.home.score ?? 0}`,
        }
      : null,
  };
}


/* ------------------------------------------------------------------ */
/* Stat lines                                                          */
/* ------------------------------------------------------------------ */

/**
 * How to read a category's raw row back as the line you'd see on a broadcast
 * graphic. `hideZero` keeps "0 TD" and "0 INT" out of the way without hiding
 * the counting stats that are the point of the line.
 */
const LINE_FORMAT = {
  passing: [
    { label: 'C/ATT', render: (v) => v },
    { label: 'YDS', render: (v) => `${v} yds` },
    { label: 'TD', render: (v) => `${v} TD`, hideZero: true },
    { label: 'INT', render: (v) => `${v} INT`, hideZero: true },
  ],
  rushing: [
    { label: 'CAR', render: (v) => `${v} car` },
    { label: 'YDS', render: (v) => `${v} yds` },
    { label: 'TD', render: (v) => `${v} TD`, hideZero: true },
  ],
  receiving: [
    { label: 'REC', render: (v) => `${v} rec` },
    { label: 'YDS', render: (v) => `${v} yds` },
    { label: 'TD', render: (v) => `${v} TD`, hideZero: true },
    { label: 'TGTS', render: (v) => `${v} tgt`, hideZero: true },
  ],
};

const CATEGORY_ORDER = ['passing', 'rushing', 'receiving'];

/** "24/38, 240 yds, 1 TD, 1 INT" for each category the player figures in. */
function formatStatLines(record) {
  if (!record?.lines) return [];

  const out = [];
  for (const category of CATEGORY_ORDER) {
    const line = record.lines[category];
    if (!line) continue;

    const parts = [];
    for (const field of LINE_FORMAT[category] || []) {
      const index = line.labels.findIndex(
        (l) => String(l).trim().toUpperCase() === field.label
      );
      if (index < 0) continue;

      const raw = line.stats[index];
      if (raw == null || raw === '' || raw === '--') continue;
      if (field.hideZero && Number(raw) === 0) continue;

      parts.push(field.render(raw));
    }
    if (parts.length) out.push({ category, text: parts.join(', ') });
  }
  return out;
}

/**
 * One entry per player rather than per leg, so a player carrying props on
 * several slips is read once. Live games first — that's what's worth watching.
 */
function buildPlayers(slips) {
  const byPlayer = new Map();

  for (const slip of slips) {
    for (const leg of slip.legs) {
      if (leg.placeholder) continue;

      const key = leg.player.toLowerCase();
      let entry = byPlayer.get(key);
      if (!entry) {
        entry = {
          key,
          name: leg.player,
          team: leg.team,
          position: leg.positionAbbr,
          headshot: leg.headshot || null,
          game: leg.game,
          statLines: leg.statLines || [],
          props: [],
        };
        byPlayer.set(key, entry);
      }

      if (!entry.statLines.length && leg.statLines?.length) entry.statLines = leg.statLines;
      if (!entry.game && leg.game) entry.game = leg.game;

      entry.props.push({
        slip: slip.name,
        slipId: slip.id,
        prop: leg.prop,
        stat: leg.stat,
        value: leg.value,
        line: leg.line,
        toGo: leg.toGo,
        pct: leg.pct,
        status: leg.status,
      });
    }
  }

  const gameRank = (g) => (g?.state === 'in' ? 0 : g?.state === 'pre' ? 1 : 2);

  return [...byPlayer.values()].sort((a, b) => {
    // Live games first, and within them the players who have actually done
    // something — a stat line is the thing worth looking at.
    const byGame = gameRank(a.game) - gameRank(b.game);
    if (byGame) return byGame;

    const byLine = (b.statLines.length ? 1 : 0) - (a.statLines.length ? 1 : 0);
    if (byLine) return byLine;

    if (b.props.length !== a.props.length) return b.props.length - a.props.length;
    return a.name.localeCompare(b.name);
  });
}

function evaluateSlip(slip, live, eventsById) {
  const legs = slip.legs.map((leg, i) => evaluateLeg(leg, i + 1, live, eventsById));

  const hits = legs.filter((l) => l.status === 'hit').length;
  const misses = legs.filter((l) => l.status === 'miss').length;
  const placeholders = legs.filter((l) => l.placeholder).length;

  // A placeholder can never be "hit", so a slip with one can't read as won.
  let status;
  if (misses > 0) status = 'dead';
  else if (hits === legs.length) status = 'won';
  else status = 'alive';

  return {
    id: slip.id,
    name: slip.name,
    book: slip.book || '',
    stake: slip.stake ?? null,
    odds: slip.odds ?? null,
    payout: slip.payout ?? null,
    status,
    hits,
    misses,
    placeholders,
    total: legs.length,
    legs,
  };
}

function buildPayload(config, live) {
  const eventsById = new Map(live.games.map((g) => [g.id, g]));
  const slips = config.slips.map((slip) => evaluateSlip(slip, live, eventsById));
  return {
    currency: config.currency || 'R',
    season: live.season,
    week: live.week,
    games: live.games,
    boxScoresLoaded: live.boxScoresLoaded,
    fetchErrors: live.errors,
    rosters: rosterSummary(),
    slips,
    players: buildPlayers(slips),
  };
}

module.exports = {
  findGameByTeam, describeLine, evaluateLeg, evaluateSlip, buildPayload,
  formatStatLines, buildPlayers,
};

'use strict';

const { STAT_LABELS, lookupPlayer } = require('./espn');

function findGameByTeam(games, teamAbbr) {
  if (!teamAbbr) return null;
  const wanted = String(teamAbbr).toUpperCase();
  return (
    games.find(
      (g) => g.home.abbr.toUpperCase() === wanted || g.away.abbr.toUpperCase() === wanted
    ) || null
  );
}

function describeLine(leg) {
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

  // Prefer the game the player actually turned up in; fall back to the
  // team hint in slips.json so a leg still shows a kickoff before the game.
  const game = record
    ? eventsById.get(record.eventId) || null
    : findGameByTeam(live.games, leg.team);

  // In a box score but absent from this category means a genuine zero
  // (a QB with no carries). Absent from every box score means no value yet.
  const value = record ? record.stats[leg.stat] ?? 0 : null;
  const line = Number(leg.line);

  let status;
  if (value != null && value >= line) status = 'hit';
  else if (game && game.state === 'post') status = 'miss';
  else if (game && game.state === 'in') status = 'live';
  else status = 'pending';

  return {
    position,
    placeholder: false,
    status,
    player: record?.name || leg.player,
    configuredPlayer: leg.player,
    matchedBy: match,
    team: record?.team || leg.team || '',
    positionAbbr: record?.position || '',
    stat: leg.stat,
    prop: describeLine(leg),
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
  return {
    currency: config.currency || 'R',
    season: live.season,
    week: live.week,
    games: live.games,
    boxScoresLoaded: live.boxScoresLoaded,
    fetchErrors: live.errors,
    slips: config.slips.map((slip) => evaluateSlip(slip, live, eventsById)),
  };
}

module.exports = { findGameByTeam, describeLine, evaluateLeg, evaluateSlip, buildPayload };

'use strict';

/**
 * Betslip text parser.
 *
 * Sunbet prints every leg in the same shape, so a pasted (or transcribed)
 * betslip can be turned into slip legs directly instead of being retyped
 * as JSON by hand:
 *
 *   80+ Receiving Yards By The Player - Including Overtime: Ja'Marr Chase - Yes
 *   Total Rushing Yards by the Player - Including Overtime: C.J. Stroud - Over 9.5
 *   Touchdown Scorer: Saquon Barkley - Yes
 *   New York Giants - Dallas Cowboys            <- game line, gives a team hint
 *   24-0   2nd Quarter 4:44                     <- live score, ignored
 *
 * Anything it can't read is reported rather than dropped, so a leg never goes
 * missing silently.
 */

const { STAT_LABELS } = require('./espn');

/** Nicknames are unique across all 32 clubs, so the last word identifies a team. */
const TEAM_BY_NICKNAME = {
  cardinals: 'ARI', falcons: 'ATL', ravens: 'BAL', bills: 'BUF',
  panthers: 'CAR', bears: 'CHI', bengals: 'CIN', browns: 'CLE',
  cowboys: 'DAL', broncos: 'DEN', lions: 'DET', packers: 'GB',
  texans: 'HOU', colts: 'IND', jaguars: 'JAX', chiefs: 'KC',
  raiders: 'LV', chargers: 'LAC', rams: 'LAR', dolphins: 'MIA',
  vikings: 'MIN', patriots: 'NE', saints: 'NO', giants: 'NYG',
  jets: 'NYJ', eagles: 'PHI', steelers: 'PIT', '49ers': 'SF',
  seahawks: 'SEA', buccaneers: 'TB', titans: 'TEN', commanders: 'WAS',
};

/**
 * Market phrase -> stat key. Order matters: "touchdown passes" has to be
 * tested before "passing", and "touchdown scorer" before either.
 */
const MARKET_PATTERNS = [
  [/touchdown\s+scorer/, 'any_td'],
  [/touchdown\s+passes/, 'pass_td'],
  [/passing\s+touchdowns/, 'pass_td'],
  [/rushing\s+touchdowns/, 'rush_td'],
  [/receiving\s+touchdowns/, 'rec_td'],
  [/receiving\s+yards/, 'rec_yds'],
  [/rushing\s+yards/, 'rush_yds'],
  [/passing\s+yards/, 'pass_yds'],
  [/receptions/, 'rec'],
];

const clean = (value) =>
  String(value || '')
    .replace(/’/g, "'")   // curly apostrophe -> straight
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/\s+/g, ' ')
    .trim();

function teamFromName(name) {
  const words = clean(name).toLowerCase().split(' ').filter(Boolean);
  if (!words.length) return null;
  return TEAM_BY_NICKNAME[words[words.length - 1]] || null;
}

/** "Live Jacksonville Jaguars - Cleveland Browns" -> ["JAX","CLE"] */
function parseGameLine(line) {
  const text = clean(line).replace(/^live\s+/i, '');
  if (text.includes(':')) return null;

  const halves = text.split(/\s+-\s+/);
  if (halves.length !== 2) return null;

  const teams = halves.map(teamFromName);
  return teams[0] && teams[1] ? teams : null;
}

const isScoreLine = (line) =>
  /^\d+\s*-\s*\d+\b/.test(clean(line)) ||
  /\b(1st|2nd|3rd|4th)\s+quarter\b/i.test(line) ||
  /^(half ?time|final|overtime)\b/i.test(clean(line));

/**
 * Parse one leg line. Returns { leg } or { error }.
 */
function parseLegLine(raw) {
  const text = clean(raw);
  const colon = text.indexOf(':');
  if (colon < 0) return { error: 'no market/player separator (":")' };

  const market = text.slice(0, colon);
  const rest = text.slice(colon + 1).trim();

  // The market itself contains " - ", so split the remainder at its LAST one.
  const split = rest.lastIndexOf(' - ');
  if (split < 0) return { error: 'no player/selection separator (" - ")' };

  const player = rest.slice(0, split).trim();
  const selection = rest.slice(split + 3).trim();
  if (!player) return { error: 'empty player name' };

  const marketLower = market.toLowerCase();
  const found = MARKET_PATTERNS.find(([pattern]) => pattern.test(marketLower));
  if (!found) return { error: `unrecognised market "${market}"` };
  const stat = found[1];

  // Three ways a line is expressed: an "N+" prefix, an "Over N" selection,
  // or neither (a scorer market, which is simply 1+).
  const plus = market.match(/(\d+(?:\.\d+)?)\s*\+/);
  const over = selection.match(/^over\s+(\d+(?:\.\d+)?)$/i);
  const under = selection.match(/^under\s+/i);

  if (under) return { error: 'Under props are not supported — only "N+" and "Over N"' };
  if (/^no$/i.test(selection)) return { error: 'a "No" selection is not supported' };

  let line;
  let label;
  if (plus) {
    line = Number(plus[1]);
  } else if (over) {
    line = Number(over[1]);
    label = `over ${over[1]} ${STAT_LABELS[stat] || stat}`;
  } else if (stat === 'any_td') {
    line = 1;
    label = 'anytime TD';
  } else {
    return { error: `no line found in "${text}"` };
  }

  if (!Number.isFinite(line)) return { error: `unreadable line in "${text}"` };
  if (stat === 'any_td' && !label) label = line === 1 ? 'anytime TD' : `${line}+ TDs`;

  const leg = { player, stat, line };
  if (label) leg.label = label;
  return { leg };
}

/**
 * Parse a whole pasted betslip.
 * Game lines attach as a team hint to the leg immediately above them, which is
 * how the slip prints them. Score lines are ignored.
 */
function parseSlipText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const legs = [];
  const problems = [];

  for (const line of lines) {
    if (isScoreLine(line)) continue;

    const game = parseGameLine(line);
    if (game) {
      // Both sides of the matchup: the roster resolver picks the right one.
      if (legs.length) legs[legs.length - 1].team = game;
      continue;
    }

    const { leg, error } = parseLegLine(line);
    if (leg) legs.push(leg);
    else problems.push({ line, error });
  }

  return { legs, problems };
}

module.exports = { parseSlipText, parseLegLine, parseGameLine, teamFromName, TEAM_BY_NICKNAME };

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


/* ------------------------------------------------------------------ */
/* Plain-language legs                                                 */
/* ------------------------------------------------------------------ */

/**
 * The way you'd actually say it:
 *
 *   Josh Allen 35 rush yards
 *   Ja'Marr Chase 80+ receiving yds
 *   DeVonta Smith 4 catches
 *   Saquon Barkley anytime td
 *   C.J. Stroud over 9.5 rushing yards
 *   Jared Goff 2 passing tds
 *
 * Matched longest/most-specific first, so "passing tds" never falls through
 * to "passing yards" or to a bare "tds".
 */
const PLAIN_STATS = [
  [/\b(?:passing|pass)\s*(?:touchdowns?|tds?)\b/, 'pass_td'],
  [/\btd\s*passes\b/, 'pass_td'],
  [/\b(?:rushing|rush)\s*(?:touchdowns?|tds?)\b/, 'rush_td'],
  [/\b(?:receiving|rec)\s*(?:touchdowns?|tds?)\b/, 'rec_td'],
  [/\b(?:receiving|rec)\s*(?:yards?|yds?)\b/, 'rec_yds'],
  [/\b(?:rushing|rush)\s*(?:yards?|yds?)\b/, 'rush_yds'],
  [/\b(?:passing|pass)\s*(?:yards?|yds?)\b/, 'pass_yds'],
  [/\b(?:receptions?|catches|catch|recs)\b/, 'rec'],
  [/\b(?:touchdowns?|tds?)\b/, 'any_td'],
  // Bare discipline with no unit — "80 rush" is plainly rushing yards.
  [/\brush(?:ing)?\b/, 'rush_yds'],
  [/\breceiving\b/, 'rec_yds'],
  [/\bpass(?:ing)?\b/, 'pass_yds'],
  [/\brec\b/, 'rec?'],     // "80 rec" — yards or catches, decided by size
  [/\b(?:yards?|yds?)\b/, 'yds?'], // no discipline given at all
];

/** An anytime-scorer leg, phrased any of the usual ways. */
const SCORER = /\b(?:anytime|any time|to score|scores?|scorer)\b/;

/**
 * A bare "rec" is ambiguous: "4 rec" means catches, "80 rec" means yards.
 * No receiver gets 20 catches and none is targeted for 20 receiving yards,
 * so the number itself settles it. The preview shows the reading either way.
 */
const REC_YARDS_THRESHOLD = 20;

function parsePlainLine(raw) {
  const text = clean(raw)
    .replace(/\s*-\s*yes\s*$/i, '')
    .replace(/\s+yes\s*$/i, '')
    .replace(/\s*\bplus\b\s*/gi, '+ ');

  const lower = text.toLowerCase();

  // Where does the prop start? The first number, which is never part of a name.
  const numberAt = lower.search(/\d/);

  if (numberAt < 0) {
    // No number: only a scorer market makes sense.
    if (SCORER.test(lower) || /\b(?:touchdowns?|tds?)\b/.test(lower)) {
      const player = clean(
        text.replace(SCORER, ' ').replace(/\b(?:a|an|the)\b/gi, ' ').replace(/\b(?:touchdowns?|tds?)\b/gi, ' ')
      );
      if (!player) return { error: 'no player name found' };
      return { leg: { player, stat: 'any_td', line: 1, label: 'anytime TD' } };
    }
    return { error: `no number found in "${text}" — try "Josh Allen 35 rush yards"` };
  }

  let player = clean(text.slice(0, numberAt).replace(/\bover\b\s*$/i, ''));
  const tail = lower.slice(numberAt);

  if (!player) return { error: `no player name before the number in "${text}"` };

  const numberMatch = tail.match(/^(\d+(?:\.\d+)?)\s*(\+?)/);
  if (!numberMatch) return { error: `unreadable number in "${text}"` };

  const line = Number(numberMatch[1]);
  const isOver = /\bover\b\s*$/i.test(text.slice(0, numberAt));
  const statPhrase = tail.slice(numberMatch[0].length);

  const found = PLAIN_STATS.find(([pattern]) => pattern.test(statPhrase));
  if (!found) {
    return {
      error: `couldn't tell which stat "${text}" means — add "rush yards", "rec yards", "pass yards", "receptions" or "td"`,
    };
  }

  let stat = found[1];
  if (stat === 'yds?') {
    return {
      error: `"${text}" doesn't say which yards — use "rush yards", "rec yards" or "pass yards"`,
    };
  }
  if (stat === 'rec?') stat = line >= REC_YARDS_THRESHOLD ? 'rec_yds' : 'rec';

  const leg = { player, stat, line };
  if (isOver) leg.label = `over ${numberMatch[1]} ${STAT_LABELS[stat] || stat}`;
  else if (stat === 'any_td' && line === 1) leg.label = 'anytime TD';

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

    // A colon means it came off a betslip; anything else is typed shorthand.
    const parsed = line.includes(':') ? parseLegLine(line) : parsePlainLine(line);

    if (parsed.leg) legs.push(parsed.leg);
    else problems.push({ line, error: parsed.error });
  }

  return { legs, problems };
}

module.exports = {
  parseSlipText, parseLegLine, parsePlainLine, parseGameLine, teamFromName, TEAM_BY_NICKNAME,
};

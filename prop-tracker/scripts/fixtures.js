'use strict';

/**
 * Fixture slate in ESPN's real response shape, shared by the self-test and
 * `npm run demo`. Stat lines are positional strings resolved through the
 * parallel `keys`/`labels` arrays; the CIN/DET receiving blocks deliberately
 * omit `keys` so the label fallback is exercised.
 */

/* ------------------------------ fixtures ------------------------------ */

const PASSING = {
  name: 'passing',
  keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt',
         'passingTouchdowns', 'interceptions', 'sacks-sackYardsLost', 'adjQBR', 'QBRating'],
  labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'],
  text: 'C/ATT, YDS, AVG, TD, INT, SACKS, QBR, RTG',
};
const RUSHING = {
  name: 'rushing',
  keys: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns', 'longRushing'],
  labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
  text: 'CAR, YDS, AVG, TD, LONG',
};
const RECEIVING_NO_KEYS = {
  name: 'receiving',
  // keys intentionally absent -> parser must fall back to labels
  labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'],
  text: 'REC, YDS, AVG, TD, LONG, TGTS',
};

// ESPN reuses one athlete id across every category block in a game.
const ids = new Map();
const idFor = (name) => {
  if (!ids.has(name)) ids.set(name, String(4000000 + ids.size));
  return ids.get(name);
};
const athlete = (name, pos, stats) => ({
  active: true,
  athlete: {
    id: idFor(name),
    displayName: name,
    shortName: name[0] + '. ' + name.split(' ').slice(1).join(' '),
    position: { abbreviation: pos },
    headshot: { href: 'https://example.invalid/x.png' },
  },
  stats,
});

const cat = (base, athletes) => ({ ...base, athletes, totals: [] });

const SUMMARIES = {
  // BUF @ BAL, in progress
  '401700001': {
    boxscore: {
      players: [
        { team: { abbreviation: 'BUF' }, statistics: [
          cat(PASSING, [athlete('Josh Allen', 'QB', ['18/25', '210', '8.4', '2', '0', '1-7', '75.2', '112.3'])]),
          cat(RUSHING, [athlete('Josh Allen', 'QB', ['6', '42', '7.0', '1', '15'])]),
        ] },
        { team: { abbreviation: 'BAL' }, statistics: [
          cat(RUSHING, [athlete('Derrick Henry', 'RB', ['14', '65', '4.6', '0', '12'])]),
        ] },
      ],
    },
  },
  // PHI @ WAS, in progress — anytime-TD and receptions coverage
  '401700004': {
    boxscore: {
      players: [
        { team: { abbreviation: 'PHI' }, statistics: [
          cat(RUSHING, [athlete('Saquon Barkley', 'RB', ['15', '88', '5.9', '1', '22'])]),
          cat(RECEIVING_NO_KEYS, [athlete('DeVonta Smith', 'WR', ['5', '62', '12.4', '0', '18', '7'])]),
        ] },
      ],
    },
  },
  // HOU @ CLE, final — decimal line and a receiving TD
  '401700005': {
    boxscore: {
      players: [
        { team: { abbreviation: 'HOU' }, statistics: [
          cat(PASSING, [athlete('C.J. Stroud', 'QB', ['22/31', '245', '7.9', '2', '0', '1-8', '70.1', '105.2'])]),
          cat(RUSHING, [athlete('C.J. Stroud', 'QB', ['3', '12', '4.0', '0', '7'])]),
        ] },
        { team: { abbreviation: 'CLE' }, statistics: [
          cat(RECEIVING_NO_KEYS, [athlete('Jerry Jeudy', 'WR', ['2', '28', '14.0', '1', '15', '5'])]),
        ] },
      ],
    },
  },
  // CIN @ DET, final
  '401700002': {
    boxscore: {
      players: [
        { team: { abbreviation: 'CIN' }, statistics: [
          cat(PASSING, [athlete('Joe Burrow', 'QB', ['24/38', '240', '6.3', '1', '1', '2-14', '55.1', '88.0'])]),
          cat(RECEIVING_NO_KEYS, [athlete("Ja'Marr Chase", 'WR', ['8', '95', '11.9', '1', '32', '12'])]),
        ] },
        { team: { abbreviation: 'DET' }, statistics: [
          cat(RECEIVING_NO_KEYS, [athlete('Amon-Ra St. Brown', 'WR', ['7', '70', '10.0', '0', '21', '9'])]),
          cat(RUSHING, [athlete('Jahmyr Gibbs', 'RB', ['12', '55', '4.6', '1', '14'])]),
        ] },
      ],
    },
  },
};

const team = (abbr, score) => ({ team: { abbreviation: abbr, shortDisplayName: abbr }, score, homeAway: null });

const SCOREBOARD = {
  season: { year: 2026, type: 2 },
  week: { number: 2 },
  events: [
    { id: '401700001', shortName: 'BUF @ BAL', name: 'Bills at Ravens',
      status: { type: { state: 'in', completed: false, shortDetail: '8:12 - 3rd' }, period: 3, displayClock: '8:12' },
      competitions: [{ competitors: [
        { ...team('BAL', '17'), homeAway: 'home' },
        { ...team('BUF', '21'), homeAway: 'away' }] }] },
    { id: '401700002', shortName: 'CIN @ DET', name: 'Bengals at Lions',
      status: { type: { state: 'post', completed: true, shortDetail: 'Final' } },
      competitions: [{ competitors: [
        { ...team('DET', '31'), homeAway: 'home' },
        { ...team('CIN', '24'), homeAway: 'away' }] }] },
    { id: '401700004', shortName: 'PHI @ WAS', name: 'Eagles at Commanders',
      status: { type: { state: 'in', completed: false, shortDetail: '2:20 - 2nd' }, period: 2, displayClock: '2:20' },
      competitions: [{ competitors: [
        { ...team('WAS', '10'), homeAway: 'home' },
        { ...team('PHI', '14'), homeAway: 'away' }] }] },
    { id: '401700005', shortName: 'HOU @ CLE', name: 'Texans at Browns',
      status: { type: { state: 'post', completed: true, shortDetail: 'Final' } },
      competitions: [{ competitors: [
        { ...team('CLE', '13'), homeAway: 'home' },
        { ...team('HOU', '27'), homeAway: 'away' }] }] },
    { id: '401700003', shortName: 'CAR @ TEN', name: 'Panthers at Titans',
      status: { type: { state: 'pre', completed: false, shortDetail: '9/13 - 1:00 PM EDT' } },
      competitions: [{ competitors: [
        { ...team('TEN', null), homeAway: 'home' },
        { ...team('CAR', null), homeAway: 'away' }] }] },
  ],
};

/* ----------------------------- fetch stub ----------------------------- */

let failUpstream = false;
let upstreamCalls = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const href = String(url);

  // Let the test's own calls to the local server through untouched.
  if (href.includes('127.0.0.1') || href.includes('localhost')) return realFetch(url, opts);

  upstreamCalls += 1;
  if (failUpstream) throw new Error('simulated ESPN outage');

  const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

  if (href.includes('/scoreboard')) return ok(SCOREBOARD);

  const m = href.match(/event=(\d+)/);
  if (m && SUMMARIES[m[1]]) return ok(SUMMARIES[m[1]]);

  return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
};



/* ------------------------------ rosters ------------------------------ */

/** Every player across the three slips, on the team ESPN would report. */
const ROSTER_PLAYERS = {
  BUF: [['Josh Allen', 'QB'], ['James Cook', 'RB']],
  BAL: [['Derrick Henry', 'RB'], ['Lamar Jackson', 'QB'], ['Zay Flowers', 'WR'], ["Ja'Kobi Lane", 'WR']],
  CIN: [["Ja'Marr Chase", 'WR'], ['Joe Burrow', 'QB']],
  DET: [['Amon-Ra St. Brown', 'WR'], ['Jahmyr Gibbs', 'RB'], ['Jared Goff', 'QB'], ['Sam LaPorta', 'TE']],
  CAR: [['Tetairoa McMillan', 'WR']],
  TEN: [['Tony Pollard', 'RB']],
  DAL: [['George Pickens', 'WR']],
  PHI: [['DeVonta Smith', 'WR'], ['Saquon Barkley', 'RB']],
  JAX: [['Parker Washington', 'WR']],
  MIA: [["De'Von Achane", 'RB']],
  HOU: [['C.J. Stroud', 'QB']],
  ATL: [['Bijan Robinson', 'RB']],
  IND: [['Daniel Jones', 'QB'], ['Keenan Allen', 'WR']],
  CLE: [['Jerry Jeudy', 'WR'], ['Harold Fannin Jr.', 'TE']],
  NYJ: [['Garrett Wilson', 'WR']],
  TB: [['Baker Mayfield', 'QB']],
  WAS: [['Stefon Diggs', 'WR']],
  MIN: [['Justin Jefferson', 'WR'], ['Kyler Murray', 'QB']],
  LAC: [['Ladd McConkey', 'WR']],
  NYG: [['Isaiah Likely', 'TE']],
};

const TEAM_IDS = Object.keys(ROSTER_PLAYERS);

const TEAMS_PAYLOAD = {
  sports: [{ leagues: [{ teams: TEAM_IDS.map((abbr, i) => ({
    team: { id: String(i + 1), abbreviation: abbr, displayName: abbr },
  })) }] }],
};

/** ESPN nests roster athletes under position groups — mirror that here. */
const rosterPayloadFor = (teamId) => {
  const abbr = TEAM_IDS[Number(teamId) - 1];
  const players = ROSTER_PLAYERS[abbr] || [];
  return {
    athletes: [
      {
        position: 'offense',
        items: players.map(([name, pos], i) => ({
          id: `${teamId}-${i}`,
          displayName: name,
          jersey: String(10 + i),
          position: { abbreviation: pos },
        })),
      },
    ],
  };
};


/* --------------------------- betslip text --------------------------- */

/** Verbatim leg text as the three slips print it, for the parser tests. */
const BETSLIP_TEXT = {
  eight: `3+ Receptions By The Player - Including Overtime: James Cook - Yes
Live HOU Texans - Buffalo Bills
14-17   2nd Quarter 4:04
Total Rushing Yards by the Player - Including Overtime: C.J. Stroud - Over 9.5
Live HOU Texans - Buffalo Bills
4+ Receptions By The Player - Including Overtime: Bijan Robinson - Yes
Live Pittsburgh Steelers - Atlanta Falcons
13-7   2nd Quarter 7:36
20+ Rushing Yards By The Player - Including Overtime: Daniel Jones - Yes
Live Indianapolis Colts - Baltimore Ravens
5+ Receptions By The Player - Including Overtime: Zay Flowers - Yes
Live Indianapolis Colts - Baltimore Ravens
3+ Receptions By The Player - Including Overtime: Jerry Jeudy - Yes
Live Jacksonville Jaguars - Cleveland Browns
4+ Receptions By The Player - Including Overtime: Sam LaPorta - Yes
Live Detroit Lions - New Orleans Saints
50+ Rushing Yards By The Player - Including Overtime: Tony Pollard - Yes
Live Tennessee Titans - New York Jets`,

  eighteen: `2+ Receptions By The Player - Including Overtime: James Cook - Yes
Live HOU Texans - Buffalo Bills
50+ Receiving Yards By The Player - Including Overtime: Garrett Wilson - Yes
Live Tennessee Titans - New York Jets
2+ Touchdown Passes By The Player - Including Overtime: Jared Goff - Yes
Live Detroit Lions - New Orleans Saints
200+ Passing Yards By The Player - Including Overtime: Baker Mayfield - Yes
Live Cincinnati Bengals - Tampa Bay Buccaneers
20+ Rushing Yards By The Player - Including Overtime: Lamar Jackson - Yes
Live Indianapolis Colts - Baltimore Ravens
2+ Receptions By The Player - Including Overtime: Ja'Kobi Lane - Yes
Live Indianapolis Colts - Baltimore Ravens
20+ Receiving Yards By The Player - Including Overtime: Keenan Allen - Yes
Live Indianapolis Colts - Baltimore Ravens
40+ Receiving Yards By The Player - Including Overtime: Tetairoa McMillan - Yes
Live Carolina Panthers - Chicago Bears
60+ Rushing Yards By The Player - Including Overtime: Bijan Robinson - Yes
Live Pittsburgh Steelers - Atlanta Falcons
3+ Receptions By The Player - Including Overtime: Harold Fannin Jr. - Yes
Live Jacksonville Jaguars - Cleveland Browns
3+ Receptions By The Player - Including Overtime: Stefon Diggs - Yes
Philadelphia Eagles - Washington Commanders
40+ Receiving Yards By The Player - Including Overtime: Stefon Diggs - Yes
Philadelphia Eagles - Washington Commanders
50+ Receiving Yards By The Player - Including Overtime: Justin Jefferson - Yes
Minnesota Vikings - Green Bay Packers
20+ Rushing Yards By The Player - Including Overtime: Kyler Murray - Yes
Minnesota Vikings - Green Bay Packers
50+ Rushing Yards By The Player - Including Overtime: De'Von Achane - Yes
Las Vegas Raiders - Miami Dolphins
40+ Receiving Yards By The Player - Including Overtime: Ladd McConkey - Yes
Los Angeles Chargers - Arizona Cardinals
50+ Receiving Yards By The Player - Including Overtime: George Pickens - Yes
New York Giants - Dallas Cowboys
30+ Receiving Yards By The Player - Including Overtime: Isaiah Likely - Yes
New York Giants - Dallas Cowboys`,
};

const state = { failUpstream: false, upstreamCalls: 0 };

/** Swap global fetch for one that serves the fixtures above. */
function installStub() {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    const href = String(url);

    // The test's own calls to the local server go through untouched.
    if (href.includes('127.0.0.1') || href.includes('localhost')) return realFetch(url, opts);

    state.upstreamCalls += 1;
    if (state.failUpstream) throw new Error('simulated ESPN outage');

    const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

    if (href.includes('/scoreboard')) return ok(SCOREBOARD);

    const roster = href.match(/\/teams\/(\d+)\/roster/);
    if (roster) return ok(rosterPayloadFor(roster[1]));
    if (href.includes('/nfl/teams')) return ok(TEAMS_PAYLOAD);

    const m = href.match(/event=(\d+)/);
    if (m && SUMMARIES[m[1]]) return ok(SUMMARIES[m[1]]);

    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
  };
}

module.exports = {
  SCOREBOARD, SUMMARIES, PASSING, RUSHING, RECEIVING_NO_KEYS,
  ROSTER_PLAYERS, TEAMS_PAYLOAD, rosterPayloadFor, BETSLIP_TEXT,
  installStub, state,
};

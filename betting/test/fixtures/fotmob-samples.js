'use strict';

/**
 * Synthetic payloads shaped like FotMob's responses, used to exercise the pure
 * mappers without network access. They deliberately include the awkward parts:
 * grouped and flat stat containers, the formation grid nesting for starters,
 * percentage-suffixed values, and alternative key spellings.
 */

const squadPayload = {
  squad: {
    squad: [
      { title: 'coach', members: [{ id: 1, name: 'A Manager' }] },
      {
        title: 'keepers',
        members: [{ id: 100, name: 'Sample Keeper', role: 'GK' }],
      },
      {
        title: 'defenders',
        members: [
          { id: 101, name: 'Sample Centreback', role: 'CB' },
          { id: 102, name: 'Sample Leftback', role: 'LB' },
        ],
      },
      {
        title: 'attackers',
        members: [{ id: 103, name: 'Sample Striker', role: 'ST' }],
      },
    ],
  },
};

// Flat [{title, value}] form.
const playerFlat = {
  id: 200,
  name: 'Flat Statline',
  positionDescription: { primaryPosition: { label: 'RW' } },
  mainLeague: {
    stats: [
      { title: 'Minutes played', value: 1800 },
      { title: 'Goals', value: 8 },
      { title: 'Assists', value: 5 },
      { title: 'Shots', value: 62 },
      { title: 'Shots on target', value: 24 },
      { title: 'Chances created', value: 31 },
      { title: 'Fouls committed', value: 14 },
      { title: 'Fouls won', value: 33 },
      { title: 'Successful dribbles', value: 40 },
      { title: 'Dribbles attempted', value: 84 },
      { title: 'Crosses', value: 22 },
      { title: 'Tackles', value: 18 },
      { title: 'Yellow cards', value: 2 },
      { title: 'Accurate passes', value: '540' },
      { title: 'Passes', value: '690' },
    ],
  },
};

// Grouped [{title, items:[…]}] form, plus a stat expressed as an object.
const playerGrouped = {
  id: 201,
  name: 'Grouped Statline',
  primaryPosition: 'DM',
  stats: [
    {
      title: 'Top stats',
      items: [
        { title: 'Minutes played', value: 2250 },
        { title: 'Fouls committed', value: { value: 61 } },
        { title: 'Tackles', value: 76 },
      ],
    },
    {
      title: 'Defence',
      items: [
        { title: 'Interceptions', value: 40 },
        { title: 'Clearances', value: 30 },
        { title: 'Yellow cards', value: 9 },
        { title: 'Passes', value: 1600 },
      ],
    },
  ],
};

// Below the minutes threshold: rates from this are noise.
const playerThin = {
  id: 202,
  name: 'Thin Sample',
  primaryPosition: 'ST',
  mainLeague: { stats: [{ title: 'Minutes played', value: 95 }, { title: 'Goals', value: 2 }] },
};

const matchDetails = {
  general: {
    matchId: 4321,
    matchTimeUTC: '2026-09-20T13:00:00Z',
    homeTeam: { name: 'Sample Home' },
    awayTeam: { name: 'Sample Away' },
  },
  content: {
    matchFacts: { infoBox: { Referee: { text: 'Sample Referee' } } },
    lineup: {
      lineup: [
        {
          teamName: 'Sample Home',
          formation: '4-3-3',
          // Starters arrive as a grid of rows.
          players: [
            [{ id: 1, name: 'Home GK' }],
            [{ id: 2, name: 'Home RB' }, { id: 3, name: 'Home CB1' }, { id: 4, name: 'Home CB2' }, { id: 5, name: 'Home LB' }],
            [{ id: 6, name: 'Home DM' }, { id: 7, name: 'Home CM1' }, { id: 8, name: 'Home CM2' }],
            [{ id: 9, name: 'Home RW' }, { id: 10, name: 'Home ST' }, { id: 11, name: 'Home LW' }],
          ],
          bench: [{ id: 12, name: 'Home Sub1' }, { id: 13, name: 'Home Sub2' }],
        },
        {
          teamName: 'Sample Away',
          formation: '4-2-3-1',
          players: [
            [{ id: 21, name: 'Away GK' }],
            [{ id: 22, name: 'Away RB' }, { id: 23, name: 'Away CB1' }, { id: 24, name: 'Away CB2' }, { id: 25, name: 'Away LB' }],
            [{ id: 26, name: 'Away DM1' }, { id: 27, name: 'Away DM2' }],
            [{ id: 28, name: 'Away RW' }, { id: 29, name: 'Away AM' }, { id: 30, name: 'Away LW' }],
            [{ id: 31, name: 'Away ST' }],
          ],
          bench: [{ id: 32, name: 'Away Sub1' }],
        },
      ],
    },
  },
};

const fixturesByDate = {
  leagues: [
    { primaryId: 55, name: 'Serie A', matches: [{ id: 1, home: { name: 'X' }, away: { name: 'Y' } }] },
    {
      primaryId: 47,
      name: 'Premier League',
      matches: [
        { id: 4321, home: { name: 'Bournemouth' }, away: { name: 'Liverpool' }, status: { utcTime: '2026-09-20T13:00:00Z', started: false } },
        { id: 4322, home: { name: 'Man City' }, away: { name: 'Sunderland' }, status: { utcTime: '2026-09-20T13:00:00Z', started: false } },
      ],
    },
  ],
};

module.exports = {
  squadPayload, playerFlat, playerGrouped, playerThin, matchDetails, fixturesByDate,
};

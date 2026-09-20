#!/usr/bin/env node
'use strict';

/**
 * One-off migration: attach a functional role, flank, pace and set-piece
 * responsibility to every player. Re-runnable and idempotent.
 *
 * Raw position is not enough to predict events - Salah and a traditional
 * winger are both "wide" but differ by a factor of two in shots and invert in
 * crosses - so each player is mapped to a functional archetype instead.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'players.json');

// id: [roleType, flank, pace, { penalties, freeKicks, corners }]
const MAP = {
  // Manchester City
  haaland: ['poacher', 'central', 82, { penalties: 0.85 }],
  foden: ['attacking-mid', 'central', 82],
  doku: ['traditional-winger', 'left', 92],
  savinho: ['inverted-winger', 'right', 86],
  cherki: ['attacking-mid', 'central', 78, { freeKicks: 0.4, corners: 0.4 }],
  marmoush: ['pressing-forward', 'central', 87],
  reijnders: ['box-to-box', 'central', 79],
  rodri: ['holding-mid', 'central', 68],
  bernardo: ['attacking-mid', 'central', 76],
  'nico-gonzalez': ['holding-mid', 'central', 70],
  gvardiol: ['ball-playing-defender', 'central', 82],
  dias: ['aggressive-stopper', 'central', 74],
  'ait-nouri': ['attacking-fullback', 'left', 84],
  oreilly: ['inverted-fullback', 'left', 80],

  // Sunderland
  isidor: ['pressing-forward', 'central', 84],
  mayenda: ['pressing-forward', 'central', 85],
  brobbey: ['target-forward', 'central', 78],
  talbi: ['inverted-winger', 'right', 85],
  'le-fee': ['attacking-mid', 'central', 78, { corners: 0.5, freeKicks: 0.5 }],
  xhaka: ['deep-playmaker', 'central', 62, { corners: 0.6, freeKicks: 0.6 }],
  sadiki: ['holding-mid', 'central', 76],
  'bertrand-traore': ['traditional-winger', 'right', 80],
  ballard: ['aggressive-stopper', 'central', 74],
  mukiele: ['defensive-fullback', 'right', 86],
  alderete: ['cover-defender', 'central', 72],
  hume: ['defensive-fullback', 'right', 78],

  // Bournemouth
  evanilson: ['pressing-forward', 'central', 81],
  semenyo: ['inside-forward', 'left', 88],
  kluivert: ['inverted-winger', 'right', 82, { penalties: 0.7, freeKicks: 0.6 }],
  tavernier: ['box-to-box', 'central', 78, { corners: 0.5 }],
  'tyler-adams': ['holding-mid', 'central', 78],
  christie: ['box-to-box', 'central', 74],
  'alex-scott': ['box-to-box', 'central', 78],
  'brooks-bou': ['attacking-mid', 'central', 76],
  diakite: ['aggressive-stopper', 'central', 80],
  senesi: ['ball-playing-defender', 'central', 75],
  truffert: ['attacking-fullback', 'left', 82],
  'adam-smith': ['defensive-fullback', 'right', 74],

  // Liverpool
  salah: ['inside-forward', 'right', 88, { penalties: 0.80 }],
  isak: ['poacher', 'central', 86],
  ekitike: ['pressing-forward', 'central', 84],
  gakpo: ['inside-forward', 'left', 80],
  wirtz: ['attacking-mid', 'central', 79, { corners: 0.4 }],
  szoboszlai: ['box-to-box', 'central', 80, { freeKicks: 0.7, corners: 0.5 }],
  'mac-allister': ['box-to-box', 'central', 74],
  gravenberch: ['holding-mid', 'central', 78],
  'van-dijk': ['aggressive-stopper', 'central', 80],
  konate: ['aggressive-stopper', 'central', 88],
  kerkez: ['attacking-fullback', 'left', 87],
  frimpong: ['wingback', 'right', 90],
  bradley: ['attacking-fullback', 'right', 84],

  // Leeds
  piroe: ['poacher', 'central', 76, { penalties: 0.8 }],
  'calvert-lewin': ['target-forward', 'central', 78],
  'dan-james': ['traditional-winger', 'right', 92],
  gnonto: ['inverted-winger', 'left', 87],
  okafor: ['inside-forward', 'left', 86],
  aaronson: ['attacking-mid', 'central', 80],
  stach: ['box-to-box', 'central', 74],
  ampadu: ['holding-mid', 'central', 72],
  tanaka: ['box-to-box', 'central', 74],
  bijol: ['aggressive-stopper', 'central', 76],
  rodon: ['cover-defender', 'central', 74],
  struijk: ['cover-defender', 'central', 72],
  gudmundsson: ['attacking-fullback', 'left', 82, { corners: 0.5 }],

  // Crystal Palace
  mateta: ['target-forward', 'central', 78, { penalties: 0.8 }],
  sarr: ['inside-forward', 'right', 88],
  pino: ['inverted-winger', 'left', 85],
  kamada: ['attacking-mid', 'central', 74],
  devenny: ['box-to-box', 'central', 76],
  wharton: ['deep-playmaker', 'central', 68, { corners: 0.7, freeKicks: 0.6 }],
  hughes: ['box-to-box', 'central', 70],
  guehi: ['ball-playing-defender', 'central', 80],
  lacroix: ['aggressive-stopper', 'central', 78],
  richards: ['aggressive-stopper', 'central', 79],
  munoz: ['wingback', 'right', 86],
  mitchell: ['wingback', 'left', 84],

  // Fulham
  jimenez: ['target-forward', 'central', 70, { penalties: 0.8 }],
  muniz: ['poacher', 'central', 76],
  iwobi: ['wide-playmaker', 'right', 78],
  'harry-wilson': ['inverted-winger', 'right', 76, { freeKicks: 0.7, corners: 0.6 }],
  'smith-rowe': ['attacking-mid', 'central', 78],
  berge: ['box-to-box', 'central', 72],
  lukic: ['holding-mid', 'central', 72],
  cairney: ['deep-playmaker', 'central', 62, { corners: 0.5 }],
  bassey: ['ball-playing-defender', 'central', 80],
  diop: ['aggressive-stopper', 'central', 76],
  robinson: ['attacking-fullback', 'left', 88],
  castagne: ['defensive-fullback', 'right', 78],
  tete: ['defensive-fullback', 'right', 80],

  // Manchester United
  sesko: ['target-forward', 'central', 84],
  mbeumo: ['inside-forward', 'right', 86],
  cunha: ['inside-forward', 'left', 80],
  fernandes: ['attacking-mid', 'central', 74, { penalties: 0.85, freeKicks: 0.7, corners: 0.6 }],
  amad: ['inverted-winger', 'right', 84],
  mount: ['attacking-mid', 'central', 76],
  casemiro: ['holding-mid', 'central', 64],
  ugarte: ['holding-mid', 'central', 76],
  mainoo: ['box-to-box', 'central', 76],
  'de-ligt': ['aggressive-stopper', 'central', 76],
  maguire: ['aggressive-stopper', 'central', 66],
  shaw: ['defensive-fullback', 'left', 74],
  dalot: ['attacking-fullback', 'right', 82],
  dorgu: ['wingback', 'left', 89],
};

const DEFAULT_PACE = {
  GK: 60, DEF: 76, MID: 74, AM: 80, FWD: 80,
};

function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const roles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'roles.json'), 'utf8')).roles;

  let assigned = 0;
  const unmapped = [];

  for (const player of data.players) {
    const entry = MAP[player.id];
    if (!entry) {
      unmapped.push(player.id);
      // Fall back to a sane archetype for the raw position rather than failing.
      player.roleType = player.roleType || { GK: 'goalkeeper', DEF: 'cover-defender', MID: 'box-to-box', AM: 'attacking-mid', FWD: 'pressing-forward' }[player.role] || 'box-to-box';
      player.flank = player.flank || 'central';
      player.pace = player.pace ?? DEFAULT_PACE[player.role] ?? 75;
      continue;
    }
    const [roleType, flank, pace, setPieces] = entry;
    if (!roles[roleType]) throw new Error(`Unknown role "${roleType}" for ${player.id}`);
    player.roleType = roleType;
    player.flank = flank;
    player.pace = pace;
    player.setPieces = Object.assign({ penalties: 0, freeKicks: 0, corners: 0 }, setPieces || {});
    assigned++;
  }

  data._roles = 'roleType maps each player to an archetype in roles.json, which supplies every per-90 metric not listed explicitly below. flank drives the positional matchup model; pace feeds duel outcomes; setPieces are shares of the team\'s penalties, direct free kicks and corners.';

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Assigned roles to ${assigned}/${data.players.length} players.`);
  if (unmapped.length) console.log(`Fell back to position defaults for: ${unmapped.join(', ')}`);

  const counts = {};
  for (const p of data.players) counts[p.roleType] = (counts[p.roleType] || 0) + 1;
  console.log('Role distribution:', JSON.stringify(counts, null, 0));
}

main();

#!/usr/bin/env node
'use strict';

/**
 * Applies confirmed transfer-window movements to the squad file.
 *
 * Removing a player who has left is strictly an improvement: it deletes a
 * known-wrong entry. ADDING an arrival is not, unless real per-90 numbers come
 * with him - inventing stats for a new signing swaps one class of error for
 * another. So arrivals are recorded in `_knownGaps` for a human to fill in, and
 * the squad stays unverified until someone confirms the full roster.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'players.json');

/** Departures confirmed by reporting, with where they went. */
const DEPARTED = [
  { id: 'salah', from: 'liverpool', to: 'left on a free at contract expiry' },
  { id: 'konate', from: 'liverpool', to: 'departed' },
  { id: 'robertson', from: 'liverpool', to: 'departed' },
  { id: 'casemiro', from: 'man-utd', to: 'left on a free at contract expiry' },
  { id: 'ugarte', from: 'man-utd', to: 'sold' },
  { id: 'savinho', from: 'man-city', to: 'Tottenham Hotspur (club record)' },
  { id: 'bernardo', from: 'man-city', to: 'Real Madrid (free)' },
  { id: 'semenyo', from: 'bournemouth', to: 'Manchester City (Jan 2026, GBP 64m)' },
  { id: 'jimenez', from: 'fulham', to: 'departed on a free' },
  { id: 'harry-wilson', from: 'fulham', to: 'Leeds United (free)' },
  { id: 'lacroix', from: 'crystal-palace', to: 'departed' },
];

/**
 * Arrivals we know about but have no usable per-90 data for. Recorded, not
 * fabricated.
 */
const ARRIVALS_NEEDING_DATA = {
  liverpool: ['Bradley Barcola (PSG)', 'Victor Munoz (Osasuna)', 'Jeremy Jacquet', 'Ronald Araujo (loan)'],
  'man-city': ['Enzo Fernandez (Chelsea)', 'Iliman Ndiaye (Everton)', 'Elliot Anderson', 'Ayyoub Bouaddi', 'Antoine Semenyo (Bournemouth)'],
  'man-utd': ['Andrey Santos (Chelsea)', 'Karl Darlow (Leeds)'],
  leeds: ['Harry Wilson (Fulham)'],
  'crystal-palace': ['Oscar Mingueza'],
  sunderland: ['Thomas Meunier'],
  bournemouth: ['Alvaro Rodriguez (Elche)', 'Antonio Silva (Benfica)', 'Amine Adli', 'Eli Junior Kroupi'],
  fulham: [],
};

function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const before = data.players.length;

  const removed = [];
  const notFound = [];
  for (const dep of DEPARTED) {
    const idx = data.players.findIndex((p) => p.id === dep.id);
    if (idx === -1) { notFound.push(dep.id); continue; }
    removed.push({ ...dep, name: data.players[idx].name });
    data.players.splice(idx, 1);
  }

  data._squadVerification = {
    verifiedAt: null,
    note:
      'Confirmed departures have been removed, but the roster as a whole has NOT been verified against a ' +
      'confirmed team sheet. Arrivals are listed in _knownGaps and are absent from the model. Player markets ' +
      'stay gated until verifiedAt is set to a date after the last transfer window close.',
    lastTransfersApplied: new Date().toISOString().slice(0, 10),
    removedThisPass: removed.map((r) => `${r.name} (${r.from}) - ${r.to}`),
  };
  data._knownGaps = {
    note: 'Known arrivals with no per-90 data in this file. The model cannot price them; add real numbers before relying on player markets.',
    arrivals: ARRIVALS_NEEDING_DATA,
  };

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');

  console.log(`Removed ${removed.length} departed players (${before} -> ${data.players.length}).`);
  for (const r of removed) console.log(`  - ${r.name.padEnd(22)} ${r.from.padEnd(16)} ${r.to}`);
  if (notFound.length) console.log(`Not present already: ${notFound.join(', ')}`);

  const gaps = Object.values(ARRIVALS_NEEDING_DATA).flat().length;
  console.log(`\n${gaps} known arrivals recorded in _knownGaps with no data - squad remains UNVERIFIED.`);

  const counts = {};
  for (const p of data.players) counts[p.team] = (counts[p.team] || 0) + 1;
  console.log('Squad sizes now:', JSON.stringify(counts));
}

main();

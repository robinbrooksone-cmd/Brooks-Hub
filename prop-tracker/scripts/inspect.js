#!/usr/bin/env node
'use strict';

/**
 * Shape inspector. Run this first, on a machine that can reach ESPN:
 *
 *   npm run inspect              # picks a live game, else the most recent final
 *   npm run inspect -- 401671800 # or name an event id
 *
 * It dumps the full summary response to debug/ and prints the parallel
 * label/value arrays the parser keys off, plus what our five tracked stats
 * resolve to. If ESPN ever reshuffles a category, this is where it shows.
 */

const fs = require('fs');
const path = require('path');

const {
  SCOREBOARD_URL,
  SUMMARY_URL,
  STAT_MAP,
  getJson,
  parseScoreboard,
  resolveColumnIndices,
  buildPlayerIndex,
} = require('../espn');

const DEBUG_DIR = path.join(__dirname, '..', 'debug');

async function main() {
  const requested = process.argv[2];

  const scoreboard = await getJson(SCOREBOARD_URL);
  const games = parseScoreboard(scoreboard);

  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const sbPath = path.join(DEBUG_DIR, 'scoreboard.json');
  fs.writeFileSync(sbPath, JSON.stringify(scoreboard, null, 2));

  console.log(
    `Season ${scoreboard?.season?.year ?? '?'}, week ${scoreboard?.week?.number ?? '?'} — ${games.length} games`
  );
  for (const g of games) {
    console.log(
      `  ${g.id}  ${String(g.shortName).padEnd(12)} ${g.state.padEnd(5)} ${g.detail}`
    );
  }
  console.log(`\nFull scoreboard written to ${sbPath}`);

  const target =
    (requested && games.find((g) => g.id === requested)) ||
    games.find((g) => g.state === 'in') ||
    [...games].reverse().find((g) => g.state === 'post');

  if (!target) {
    console.log('\nNo game has a box score yet (all still pre-game). Try again after kickoff.');
    return;
  }

  console.log(`\nInspecting event ${target.id} (${target.shortName}) — ${target.detail}\n`);
  const summary = await getJson(`${SUMMARY_URL}${encodeURIComponent(target.id)}`);

  const sumPath = path.join(DEBUG_DIR, `summary-${target.id}.json`);
  fs.writeFileSync(sumPath, JSON.stringify(summary, null, 2));
  console.log(`Full summary written to ${sumPath}\n`);

  const teamBlocks = summary?.boxscore?.players || [];
  console.log(`boxscore.players[] -> ${teamBlocks.length} team blocks\n`);

  for (const teamBlock of teamBlocks) {
    console.log(`TEAM ${teamBlock?.team?.abbreviation || '?'}`);
    for (const category of teamBlock?.statistics || []) {
      const name = String(category?.name || '').toLowerCase();
      const tracked = Boolean(STAT_MAP[name]);
      console.log(`  category "${category?.name}"${tracked ? '  <-- tracked' : ''}`);
      console.log(`    keys   : ${JSON.stringify(category?.keys)}`);
      console.log(`    labels : ${JSON.stringify(category?.labels)}`);
      console.log(`    text   : ${JSON.stringify(category?.text)}`);

      const sample = category?.athletes?.[0];
      if (sample) {
        console.log(`    sample : ${sample.athlete?.displayName}`);
        console.log(`    stats  : ${JSON.stringify(sample.stats)}`);
      }

      if (tracked) {
        const indices = resolveColumnIndices(category, name);
        for (const [statKey, index] of Object.entries(indices)) {
          const label = category?.labels?.[index];
          const value = index == null ? null : sample?.stats?.[index];
          console.log(
            `      ${statKey.padEnd(9)} -> index ${String(index).padEnd(4)} label ${String(label).padEnd(6)} sample value ${JSON.stringify(value)}`
          );
        }
      }
      console.log('');
    }
  }

  const index = buildPlayerIndex([{ event: target, data: summary }]);
  console.log(`Parsed ${index.byId.size} athletes from this game. Non-empty stat lines:\n`);
  for (const record of index.byId.values()) {
    if (!Object.keys(record.stats).length) continue;
    console.log(
      `  ${record.name.padEnd(24)} ${record.team.padEnd(4)} ${JSON.stringify(record.stats)}`
    );
  }
}

main().catch((err) => {
  console.error(`\nInspect failed: ${err?.message || err}`);
  process.exit(1);
});

#!/usr/bin/env node
'use strict';

/**
 * Build a themed slip: N legs per fixture drawn from a chosen set of market
 * families, priced through the correlation model.
 *
 *   node betting/scripts/themed-parlay.js --legs=4 --required-edge=6
 *
 * Same-game legs are correlated, so each fixture's slip is priced through the
 * copula and reported as a break-even price rather than an expected value: a
 * bookmaker prices the correlation in and will not pay the product of the legs.
 * Across fixtures the legs really are independent, so the accumulator of the
 * per-game slips multiplies correctly.
 */

const { runSlate } = require('../src/engine');
const { priceParlay } = require('../src/pricing/parlay');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', grey: '\x1b[90m', red: '\x1b[31m',
};

/**
 * Each theme names the market families it may draw from and the probability
 * band worth betting in. The band matters: a 90% leg adds almost nothing to a
 * slip but still carries the bookmaker's margin, and a 25% leg turns the slip
 * into a lottery ticket.
 */
const THEMES = [
  { key: 'bothCorners', label: 'Both teams corners', match: (m) => /both_corners/.test(m.id), lo: 0.45, hi: 0.80 },
  { key: 'bothCards',   label: 'Both teams cards',   match: (m) => /both_cards/.test(m.id),   lo: 0.45, hi: 0.80 },
  { key: 'playerSot',   label: 'Player shots on target', match: (m) => m.family === 'player_sot', lo: 0.42, hi: 0.72 },
  { key: 'playerFouls', label: 'Player fouls committed', match: (m) => m.family === 'player_fouls', lo: 0.42, hi: 0.72 },
];

function args() {
  const out = { legs: 4, requiredEdge: 0.06 };
  for (const raw of process.argv.slice(2)) {
    const [flag, value] = raw.split('=');
    if (flag === '--legs') out.legs = Number(value);
    if (flag === '--required-edge') out.requiredEdge = Number(value) / 100;
  }
  return out;
}

function main() {
  const opts = args();
  const slate = runSlate({ minEdge: 0 });
  const playersFile = require('../data/players.json').players;
  const realRates = new Set(playersFile.filter((p) => p.ratesFrom === 'prior').map((p) => p.id));
  const starters = new Set(playersFile.filter((p) => p.lineup === 'predicted-xi').map((p) => p.id));

  console.log(`\n${C.bold}Themed slip - ${opts.legs} legs per fixture${C.reset}`);
  console.log(`${C.grey}Both-teams corners and cards, player shots on target, player fouls committed.${C.reset}`);
  console.log(`${C.grey}TAKE AT carries a ${(opts.requiredEdge * 100).toFixed(0)}% margin of safety over the fair price.${C.reset}`);
  if (slate.warnings.length) slate.warnings.forEach((w) => console.log(`${C.yellow}! ${w}${C.reset}`));

  const perGame = [];

  for (const fixture of slate.fixtures) {
    const chosen = [];

    for (const theme of THEMES) {
      if (chosen.length >= opts.legs) break;

      const candidates = [];
      for (const market of fixture.markets) {
        if (!theme.match(market)) continue;
        // Player legs are only worth taking on someone who will actually start.
        if (market.playerId && !starters.has(market.playerId)) continue;

        const sel = market.selections.find((s) => s.key === 'over' || s.key === 'yes');
        if (!sel) continue;
        const p = sel.modelProb;
        if (p < theme.lo || p > theme.hi) continue;

        candidates.push({
          theme: theme.key,
          matchId: fixture.id,
          marketId: market.id,
          family: market.family,
          team: market.team,
          playerId: market.playerId || null,
          side: sel.side,
          label: sel.label,
          modelProb: p,
          marketFairProb: p,
          odds: (1 + opts.requiredEdge) / p,
          fairOdds: 1 / p,
          expectation: market.expectation ?? null,
          // A player leg resting on a real per-90 rate deserves more weight
          // than one resting on a role archetype.
          realRates: market.playerId ? realRates.has(market.playerId) : true,
        });
      }

      if (candidates.length === 0) continue;

      // Prefer legs built on real data, then the strongest probability inside
      // the band, then the largest underlying expectation.
      candidates.sort((a, b) =>
        (b.realRates - a.realRates)
        || (b.modelProb - a.modelProb)
        || ((b.expectation || 0) - (a.expectation || 0)));

      // One leg per theme, and never two legs on the same player.
      const pickedPlayers = new Set(chosen.map((c) => c.playerId).filter(Boolean));
      const leg = candidates.find((c) => !c.playerId || !pickedPlayers.has(c.playerId));
      if (leg) chosen.push(leg);
    }

    if (chosen.length === 0) continue;

    const priced = priceParlay(chosen, { bankroll: 100, draws: 300000 });
    perGame.push({ fixture, legs: chosen, priced });

    console.log(`\n${C.bold}${fixture.home.name} v ${fixture.away.name}${C.reset} ${C.grey}${fixture.localTime} UK${C.reset}`);
    for (const leg of chosen) {
      const tag = leg.playerId ? (leg.realRates ? `${C.green}[data]${C.reset}` : `${C.yellow}[archetype]${C.reset}`) : '';
      const exp = leg.expectation != null && leg.family.startsWith('player_') ? `${C.grey}E ${leg.expectation.toFixed(2)}${C.reset}  ` : '';
      console.log(`  ${C.cyan}•${C.reset} ${leg.label.padEnd(42)} ${(leg.modelProb * 100).toFixed(0).padStart(3)}%  ` +
        `fair ${leg.fairOdds.toFixed(2).padStart(5)}  take ${C.bold}${C.green}${leg.odds.toFixed(2).padStart(5)}${C.reset}  ${exp}${tag}`);
    }
    console.log(`  ${C.grey}joint${C.reset} ${(priced.probability * 100).toFixed(1)}%` +
      `${C.grey}  independent${C.reset} ${(priced.independentProbability * 100).toFixed(1)}%` +
      `${C.grey}  correlation${C.reset} ${priced.correlationUplift >= 0 ? '+' : ''}${(priced.correlationUplift * 100).toFixed(1)}%` +
      `${C.grey}  break-even${C.reset} ${C.bold}${priced.breakEvenOdds.toFixed(2)}${C.reset}`);
  }

  // Each fixture's slip is independent of the others, so the accumulator of
  // the per-game slips is an honest multiplication.
  const jointProb = perGame.reduce((p, g) => p * g.priced.probability, 1);
  const breakEven = jointProb > 0 ? 1 / jointProb : Infinity;

  console.log(`\n${C.bold}${'='.repeat(70)}${C.reset}`);
  console.log(`${C.bold}ALL FOUR GAMES COMBINED${C.reset} ${C.grey}(${perGame.reduce((n, g) => n + g.legs.length, 0)} legs)${C.reset}`);
  console.log(`  joint probability ${C.bold}${(jointProb * 100).toFixed(2)}%${C.reset}` +
    `${C.grey}  break-even${C.reset} ${C.bold}${breakEven.toFixed(0)}${C.reset}`);
  console.log(`  ${C.red}That is a lottery ticket.${C.reset} ${C.grey}One leg in sixteen fails and the slip is dead.${C.reset}`);

  // A more bettable shape: the single strongest leg from each fixture.
  const best = perGame.map((g) => [...g.legs].sort((a, b) => b.modelProb - a.modelProb)[0]);
  const bestPriced = priceParlay(best, { bankroll: 100 });
  console.log(`\n${C.bold}FOUR-FOLD - strongest leg from each game${C.reset} ${C.grey}(independent, so this price is exact)${C.reset}`);
  best.forEach((l) => console.log(`  ${C.cyan}•${C.reset} ${l.label.padEnd(42)} ${(l.modelProb * 100).toFixed(0).padStart(3)}%  take ${C.bold}${C.green}${l.odds.toFixed(2)}${C.reset}`));
  console.log(`  joint ${C.bold}${(bestPriced.probability * 100).toFixed(1)}%${C.reset}` +
    `${C.grey}  combined take-at${C.reset} ${C.bold}${best.reduce((o, l) => o * l.odds, 1).toFixed(2)}${C.reset}` +
    `${C.grey}  break-even${C.reset} ${bestPriced.breakEvenOdds.toFixed(2)}`);

  console.log(`\n${C.grey}Model output, not advice. 18+ | begambleaware.org${C.reset}\n`);
}

main();

#!/usr/bin/env node
'use strict';

/**
 * Terminal view of the slate. `node betting/src/cli.js --help` for options.
 */

const { runSlate, buildParlays, fairSheet } = require('./engine');

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', grey: '\x1b[90m',
};

function parseArgs(argv) {
  const out = { minEdge: 0.03, bankroll: 100, top: 20, maxLegs: 4, minLegs: 3 };
  for (let i = 2; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const next = () => inline ?? argv[++i];
    switch (flag) {
      case '--min-edge': out.minEdge = Number(next()) / 100; break;
      case '--bankroll': out.bankroll = Number(next()); break;
      case '--top': out.top = Number(next()); break;
      case '--category': out.category = next(); break;
      case '--match': out.match = next(); break;
      case '--max-legs': out.maxLegs = Number(next()); break;
      case '--min-legs': out.minLegs = Number(next()); break;
      case '--date': out.date = next(); break;
      case '--players': out.players = inline || argv[i + 1] && !argv[i + 1].startsWith('--') ? next() : 'all'; break;
      case '--fair': out.fair = true; break;
      case '--required-edge': out.requiredEdge = Number(next()) / 100; break;
      case '--help': out.help = true; break;
      default: break;
    }
  }
  return out;
}

function help() {
  console.log(`
${C.bold}Premier League value finder${C.reset}

  node betting/src/cli.js [options]

  --min-edge=N     minimum edge in percentage points (default 3)
  --bankroll=N     bankroll for stake sizing (default 100)
  --top=N          how many picks to list (default 20)
  --category=NAME  filter: Goals | Corners | Cards | Shots | "Player props"
  --match=ID       filter to one fixture, e.g. bou-liv
  --min-legs=N     minimum parlay legs (default 3)
  --max-legs=N     maximum parlay legs (default 4)
  --date=YYYY-MM-DD
  --players[=ID]   show the player projection chain (optionally one fixture)
  --fair           model fair prices with no odds board, to compare by hand
  --required-edge=N  margin of safety on the fair sheet (default 6)
`);
}

function pad(s, n) {
  const str = String(s);
  // Strip ANSI before measuring so colouring does not break alignment.
  const len = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return str + ' '.repeat(Math.max(0, n - len));
}

function gradeColour(g) {
  if (g === 'A+' || g === 'A') return C.green;
  if (g === 'B') return C.cyan;
  if (g === 'C') return C.yellow;
  return C.grey;
}

/**
 * Fair-price sheet. Used when you have a coupon on screen but no machine-
 * readable odds: it prints what the model thinks each selection is worth and
 * the shortest price worth taking, so the comparison can be made by eye.
 */
function printFairSheet(args) {
  const sheet = fairSheet({ date: args.date, requiredEdge: args.requiredEdge ?? 0.06 });

  console.log(`\n${C.bold}${sheet.competition} - Matchweek ${sheet.matchweek} - ${sheet.date}${C.reset}`);
  console.log(`${C.grey}Model fair prices. No bookmaker board used - compare each TAKE AT figure against the coupon.${C.reset}`);
  console.log(`${C.grey}Each market shows both sides. TAKE AT is the shortest price worth backing, with a ${((args.requiredEdge ?? 0.06) * 100).toFixed(0)}% margin of safety.${C.reset}`);
  console.log(`${C.grey}If the coupon pays MORE than TAKE AT, it is a bet. If less, pass.${C.reset}`);

  const order = ['Goals', 'Corners', 'Cards', 'Shots', 'Player props'];

  for (const f of sheet.fixtures) {
    const e = f.expectations;
    console.log(`\n${C.bold}${'='.repeat(74)}${C.reset}`);
    console.log(`${C.bold}${f.home.name} v ${f.away.name}${C.reset}  ${C.grey}${f.localTime} UK${C.reset}`);
    console.log(
      `${C.grey}  xG ${e.goals.home.toFixed(2)}-${e.goals.away.toFixed(2)}` +
      ` | possession ${(e.possession.home * 100).toFixed(0)}/${(e.possession.away * 100).toFixed(0)}` +
      ` | corners ${e.corners.total.toFixed(1)} | cards ${e.cards.total.toFixed(1)}` +
      ` | shots ${e.shots.total.toFixed(1)} | SOT ${e.sot.total.toFixed(1)} | fouls ${e.fouls.total.toFixed(1)}` +
      `\n  referee ${f.referee}${f.refereeConfirmed ? '' : ' (assumed - set it, it moves every card market)'}${C.reset}`
    );

    for (const category of order) {
      const rows = f.byCategory[category];
      if (!rows || rows.length === 0) continue;
      console.log(`\n  ${C.cyan}${category.toUpperCase()}${C.reset}`);
      console.log(
        C.grey + pad('', 4) + pad('MARKET', 40) + pad('EXP', 7) +
        pad('OVER', 7) + pad('TAKE AT', 9) + pad('UNDER', 7) + 'TAKE AT' + C.reset
      );
      for (const r of rows) {
        const exp = r.expectation !== null && r.expectation !== undefined && r.family.startsWith('player_')
          ? r.expectation.toFixed(2)
          : '';
        console.log(
          pad('', 4) + pad(r.market.slice(0, 38), 40) +
          pad(C.grey + exp + C.reset, 7) +
          pad((r.over.prob * 100).toFixed(0) + '%', 7) +
          pad(C.bold + C.green + r.over.target.toFixed(2) + C.reset, 9) +
          pad((r.under.prob * 100).toFixed(0) + '%', 7) +
          C.bold + C.green + r.under.target.toFixed(2) + C.reset
        );
      }
    }
  }

  console.log(`\n${C.grey}Model output, not advice. Stake only what you can afford to lose. 18+ | begambleaware.org${C.reset}\n`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) return help();
  if (args.fair) return printFairSheet(args);

  const slate = runSlate({ date: args.date, minEdge: args.minEdge, bankroll: args.bankroll });

  console.log(`\n${C.bold}${slate.competition} - Matchweek ${slate.matchweek} - ${slate.date}${C.reset}`);
  if (slate.board) {
    const live = slate.board.isLiveData;
    console.log(`${C.grey}Board: ${slate.board.bookmaker} | ${slate.board.priceCount} prices | source: ${live ? 'live' : slate.board.source}${C.reset}`);
  }
  if (slate.dataWarning) console.log(`${C.yellow}! ${slate.dataWarning}${C.reset}`);

  console.log(`\n${C.bold}FIXTURES${C.reset}`);
  for (const f of slate.fixtures) {
    const e = f.expectations;
    console.log(
      `  ${C.bold}${pad(f.localTime, 6)}${f.home.name} v ${f.away.name}${C.reset}` +
      `${C.grey}  (${f.picks.length} picks)${C.reset}`
    );
    console.log(
      `${C.grey}         xG ${e.goals.home.toFixed(2)}-${e.goals.away.toFixed(2)}` +
      ` | corners ${e.corners.total.toFixed(1)}` +
      ` | cards ${e.cards.total.toFixed(1)}` +
      ` | shots ${e.shots.total.toFixed(1)}` +
      ` | SOT ${e.sot.total.toFixed(1)}` +
      ` | fouls ${e.fouls.total.toFixed(1)}` +
      ` | ref ${f.referee}${f.refereeConfirmed ? '' : ' (assumed)'}${C.reset}`
    );
  }

  if (args.players) {
    const wanted = args.players === 'all'
      ? slate.fixtures
      : slate.fixtures.filter((f) => f.id === args.players);

    for (const f of wanted) {
      const e = f.expectations;
      console.log(`\n${C.bold}${f.home.name} v ${f.away.name}${C.reset}`);
      console.log(
        `${C.grey}  possession ${(e.possession.home * 100).toFixed(0)}/${(e.possession.away * 100).toFixed(0)}` +
        ` | chase ${(e.gameState.homeChase * 100).toFixed(0)}/${(e.gameState.awayChase * 100).toFixed(0)}` +
        ` | settled early ${(e.gameState.blowoutProb * 100).toFixed(0)}%` +
        ` | cards top-down ${(e.cards.topDown.home + e.cards.topDown.away).toFixed(2)}` +
        ` vs player aggregate ${(e.cards.bottomUp.home + e.cards.bottomUp.away).toFixed(2)}` +
        ` -> ${e.cards.total.toFixed(2)}${C.reset}`
      );

      for (const side of ['home', 'away']) {
        const d = f.projections[side].diagnostics;
        const parts = Object.entries(d)
          .map(([k, x]) => `${k} ${x.playerSum.toFixed(1)}->${x.blendedTeam.toFixed(1)} (x${x.factor.toFixed(2)})`);
        console.log(`${C.grey}  ${side === 'home' ? f.home.short : f.away.short} reconciliation: ${parts.join(' | ')}` +
          ` | coverage ${(f.projections[side].coverage * 100).toFixed(0)}%${C.reset}`);
      }

      console.log(
        C.grey + pad('', 2) + pad('PLAYER', 22) + pad('ROLE', 21) + pad('MIN', 5) +
        pad('SHOT', 6) + pad('SOT', 6) + pad('xG', 6) + pad('FOUL', 6) + pad('WON', 6) +
        pad('TKL', 6) + pad('DRIB', 6) + pad('CARD', 6) + 'DUEL' + C.reset
      );

      const rows = [...f.players].sort((a, b) => b.expectations.shots - a.expectations.shots);
      for (const p of rows) {
        const x = p.expectations;
        const isDef = p.line === 'DEF' || p.line === 'GK';
        const duel = p.matchup ? (isDef ? p.matchup.fouls : p.matchup.foulsDrawn) : 1;
        const duelStr = Math.abs(duel - 1) > 0.04
          ? (duel > 1 ? C.yellow : C.blue) + 'x' + duel.toFixed(2) + C.reset
          : C.grey + 'x' + duel.toFixed(2) + C.reset;
        console.log(
          pad('', 2) + pad(p.name.slice(0, 20), 22) +
          pad(C.grey + p.role.replace(/-/g, ' ').slice(0, 19) + C.reset, 21) +
          pad(p.expectedMinutes.toFixed(0), 5) +
          pad(x.shots.toFixed(2), 6) + pad(x.sot.toFixed(2), 6) + pad(x.goals.toFixed(2), 6) +
          pad(x.fouls.toFixed(2), 6) + pad(x.foulsDrawn.toFixed(2), 6) +
          pad(x.tackles.toFixed(2), 6) + pad(x.dribblesAttempted.toFixed(2), 6) +
          pad((p.yellowProb * 100).toFixed(0) + '%', 6) + duelStr
        );
      }
    }
    console.log(`\n${C.grey}Model output, not advice. 18+ | begambleaware.org${C.reset}\n`);
    return;
  }

  let picks = slate.picks;
  if (args.category) picks = picks.filter((p) => p.category.toLowerCase() === args.category.toLowerCase());
  if (args.match) picks = picks.filter((p) => p.matchId === args.match);

  console.log(`\n${C.bold}TOP PICKS${C.reset} ${C.grey}(edge >= ${(args.minEdge * 100).toFixed(1)}pp, ${picks.length} qualifying)${C.reset}`);
  console.log(
    C.grey + pad('', 4) + pad('MATCH', 11) + pad('SELECTION', 42) +
    pad('ODDS', 7) + pad('MODEL', 8) + pad('FAIR', 8) + pad('EDGE', 8) + pad('EV', 8) + pad('STAKE', 7) + 'CONF' + C.reset
  );

  picks.slice(0, args.top).forEach((p, i) => {
    const g = gradeColour(p.grade);
    console.log(
      pad(C.grey + String(i + 1).padStart(2) + '.' + C.reset, 4) +
      pad(p.fixtureLabel, 11) +
      pad(g + p.selection.slice(0, 40) + C.reset, 42) +
      pad(p.odds.toFixed(2), 7) +
      pad((p.modelProb * 100).toFixed(1) + '%', 8) +
      pad(C.grey + (p.marketFairProb * 100).toFixed(1) + '%' + C.reset, 8) +
      pad(C.green + '+' + p.edgePct.toFixed(1) + 'pp' + C.reset, 8) +
      pad(C.bold + p.evPct.toFixed(1) + '%' + C.reset, 8) +
      pad(p.stake.toFixed(2), 7) +
      String(p.confidence)
    );
  });

  const parlays = buildParlays(slate, { bankroll: args.bankroll, minLegs: args.minLegs, maxLegs: args.maxLegs });

  const printParlay = (title, p) => {
    if (!p) { console.log(`\n${C.bold}${title}${C.reset}\n  ${C.grey}no qualifying combination${C.reset}`); return; }
    console.log(`\n${C.bold}${title}${C.reset}`);
    p.legs.forEach((l) => console.log(
      `  ${C.cyan}•${C.reset} ${pad(l.fixtureLabel, 11)}${pad(l.selection.slice(0, 44), 46)}${C.bold}${l.odds.toFixed(2)}${C.reset}` +
      `${C.grey}  +${l.edgePct.toFixed(1)}pp${C.reset}`
    ));
    console.log(
      `  ${C.grey}true probability${C.reset} ${(p.probability * 100).toFixed(2)}%` +
      `${C.grey}  independent${C.reset} ${(p.independentProbability * 100).toFixed(2)}%` +
      `${C.grey}  correlation${C.reset} ${p.correlationUplift >= 0 ? '+' : ''}${(p.correlationUplift * 100).toFixed(1)}%`
    );
    if (p.priceKnown) {
      console.log(
        `  ${C.grey}price${C.reset} ${C.bold}${p.payoutOdds.toFixed(2)}${C.reset}` +
        `${C.grey}  break-even${C.reset} ${p.breakEvenOdds.toFixed(2)}` +
        `${C.grey}  EV${C.reset} ${C.green}${p.evPct.toFixed(1)}%${C.reset}` +
        `${C.grey}  stake${C.reset} ${p.stake.toFixed(2)}`
      );
    } else {
      console.log(
        `  ${C.yellow}No same-game price known.${C.reset} ${C.grey}Take it only at${C.reset} ${C.bold}${p.breakEvenOdds.toFixed(2)}${C.reset} ${C.grey}or better.${C.reset}\n` +
        `  ${C.grey}(multiplying the legs would give ${p.combinedOdds.toFixed(2)}, but a book prices the correlation in - it will offer far less)${C.reset}`
      );
    }
  };

  printParlay('SUGGESTED ACCUMULATOR - one leg per match, genuinely independent', parlays.accumulator);
  printParlay('SUGGESTED SAME-GAME PARLAY - correlation modelled', parlays.sameGame);

  console.log(`\n${C.grey}${slate.summary.marketsPriced} markets priced across ${slate.summary.fixtureCount} fixtures.${C.reset}`);
  console.log(`${C.grey}Model output, not advice. Stake only what you can afford to lose. 18+ | begambleaware.org${C.reset}\n`);
}

main();

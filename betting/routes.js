'use strict';

const path = require('path');
const express = require('express');

const { runSlate, buildParlays } = require('./src/engine');
const { priceParlay, buildBestParlay } = require('./src/pricing/parlay');
const sportingbet = require('./src/adapters/sportingbet');

const router = express.Router();

router.use(express.json({ limit: '2mb' }));
router.use(express.static(path.join(__dirname, 'public')));

/**
 * Building a slate means pricing ~1,300 markets, so cache it briefly. Odds
 * change on a much slower cadence than page loads, and the TTL is short enough
 * that an imported board shows up almost immediately.
 */
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function getSlate(opts) {
  const key = JSON.stringify(opts);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = runSlate(opts);
  cache.set(key, { at: Date.now(), value });
  return value;
}

function invalidate() {
  cache.clear();
}

function numeric(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Full slate: fixtures, expectations, every market and the ranked picks. */
router.get('/api/slate', (req, res) => {
  try {
    const slate = getSlate({
      date: req.query.date || undefined,
      minEdge: numeric(req.query.minEdge, 2, { min: 0, max: 50 }) / 100,
      bankroll: numeric(req.query.bankroll, 100, { min: 1, max: 1e7 }),
    });
    res.json(slate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Compact version for the board view - omits the full market tree. */
router.get('/api/picks', (req, res) => {
  try {
    const slate = getSlate({
      date: req.query.date || undefined,
      minEdge: numeric(req.query.minEdge, 2, { min: 0, max: 50 }) / 100,
      bankroll: numeric(req.query.bankroll, 100, { min: 1, max: 1e7 }),
    });
    res.json({
      date: slate.date,
      matchweek: slate.matchweek,
      board: slate.board,
      dataWarning: slate.dataWarning,
      summary: slate.summary,
      fixtures: slate.fixtures.map((f) => ({
        id: f.id, localTime: f.localTime, venue: f.venue,
        home: f.home, away: f.away,
        referee: f.referee, refereeConfirmed: f.refereeConfirmed,
        expectations: f.expectations,
        pickCount: f.picks.length,
        players: f.players,
        shares: f.shares,
        projections: f.projections,
      })),
      picks: slate.picks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Price an arbitrary slip. The client sends leg ids; we resolve them against
 * the current slate so the maths always uses live model numbers rather than
 * anything the client could have tampered with.
 */
router.post('/api/parlay', (req, res) => {
  try {
    const { legs = [], bankroll = 100, payoutOdds = null } = req.body || {};
    if (!Array.isArray(legs) || legs.length === 0) {
      return res.status(400).json({ error: 'Send at least one leg.' });
    }
    if (legs.length > 12) {
      return res.status(400).json({ error: 'Twelve legs is the limit.' });
    }

    const slate = getSlate({ minEdge: 0, bankroll: numeric(bankroll, 100, { min: 1, max: 1e7 }) });
    const index = new Map();
    for (const f of slate.fixtures) {
      for (const m of f.markets) {
        for (const s of m.selections) {
          index.set(`${m.id}|${s.key}`, { market: m, selection: s, fixture: f });
        }
      }
    }

    const resolved = [];
    const missing = [];
    for (const leg of legs) {
      const found = index.get(`${leg.marketId}|${leg.selection}`);
      if (!found || !found.selection.quoted) {
        missing.push(`${leg.marketId}|${leg.selection}`);
        continue;
      }
      const { market, selection, fixture } = found;
      resolved.push({
        matchId: market.matchId,
        marketId: market.id,
        family: market.family,
        team: market.team,
        playerId: market.playerId || null,
        side: selection.side,
        fixtureLabel: `${fixture.home.short} v ${fixture.away.short}`,
        category: market.category,
        market: market.label,
        selection: selection.label,
        modelProb: selection.modelProb,
        marketFairProb: selection.marketFairProb,
        odds: selection.odds,
        edgePct: selection.edgePct,
        evPct: selection.evPct,
      });
    }

    if (resolved.length === 0) {
      return res.status(400).json({ error: 'None of those selections are priced.', missing });
    }

    const priced = priceParlay(resolved, {
      bankroll: numeric(bankroll, 100, { min: 1, max: 1e7 }),
      payoutOdds: payoutOdds ? numeric(payoutOdds, null, { min: 1.01, max: 1e6 }) : null,
      draws: 200000,
    });

    res.json({ ...priced, missing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Auto-build the best accumulator and the best same-game parlay. */
router.post('/api/parlay/auto', (req, res) => {
  try {
    const { bankroll = 100, minLegs = 3, maxLegs = 4, minEdge = 2, mode } = req.body || {};
    const slate = getSlate({
      minEdge: numeric(minEdge, 2, { min: 0, max: 50 }) / 100,
      bankroll: numeric(bankroll, 100, { min: 1, max: 1e7 }),
    });

    const opts = {
      bankroll: numeric(bankroll, 100, { min: 1, max: 1e7 }),
      minLegs: numeric(minLegs, 3, { min: 2, max: 8 }),
      maxLegs: numeric(maxLegs, 4, { min: 2, max: 8 }),
    };

    if (mode === 'accumulator' || mode === 'sameGame') {
      const all = buildParlays(slate, opts);
      return res.json({ [mode]: all[mode] });
    }
    res.json(buildParlays(slate, opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Import a real price board, replacing the sample one. */
router.post('/api/odds/import', (req, res) => {
  try {
    const { text, date, bookmaker } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Send the pasted price list as "text".' });
    }
    const { board, errors } = sportingbet.parsePastedOdds(text, { date, bookmaker });
    if (board.prices.length === 0) {
      return res.status(400).json({ error: 'No usable prices found.', errors });
    }
    const file = sportingbet.saveBoard(board.date, board);
    invalidate();
    res.json({ imported: board.prices.length, date: board.date, file, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Full player projection chain for one fixture, including the duel map. */
router.get('/api/players/:matchId', (req, res) => {
  try {
    const slate = getSlate({ minEdge: 0, bankroll: 100 });
    const fixture = slate.fixtures.find((f) => f.id === req.params.matchId);
    if (!fixture) return res.status(404).json({ error: 'Unknown fixture.' });
    res.json({
      fixture: { id: fixture.id, home: fixture.home, away: fixture.away, referee: fixture.referee },
      expectations: fixture.expectations,
      players: fixture.players,
      shares: fixture.shares,
      projections: fixture.projections,
      matchups: fixture.matchups,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/health', (req, res) => {
  res.json({ ok: true, boards: sportingbet.listBoards() });
});

module.exports = router;

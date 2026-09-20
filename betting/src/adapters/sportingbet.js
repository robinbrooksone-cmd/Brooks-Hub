'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Sportingbet odds adapter.
 *
 * Sportingbet (an Entain brand, same platform as bwin/Ladbrokes/Coral) has no
 * public odds API, so there are three supported ways to get a price board in:
 *
 *   1. A saved JSON board in data/odds/<date>.json        (loadBoard)
 *   2. A pasted block of "selection @ price" lines        (parsePastedOdds)
 *   3. Any HTTP endpoint you point ODDS_FEED_URL at,      (fetchBoard)
 *      including a feed you scrape yourself or a paid
 *      aggregator such as The Odds API.
 *
 * Everything downstream consumes the normalised shape produced here, so
 * swapping the source never touches the model.
 */

const ODDS_DIR = path.join(__dirname, '..', '..', 'data', 'odds');

/**
 * Bookmakers do not quote arbitrary decimals; they move along a price ladder.
 * Rounding to it keeps generated and imported boards comparable.
 */
function roundToLadder(odds) {
  if (!Number.isFinite(odds) || odds <= 1) return 1.01;
  let step;
  if (odds < 2) step = 0.01;
  else if (odds < 3) step = 0.05;
  else if (odds < 6) step = 0.1;
  else if (odds < 10) step = 0.25;
  else if (odds < 20) step = 0.5;
  else step = 1;
  // Round the result to 2dp as well: step arithmetic on floats otherwise
  // yields prices like 2.5500000000000003.
  return Math.max(1.01, Math.round(Math.round(odds / step) * step * 100) / 100);
}

/** Load a saved board for a date. Returns null when none exists. */
function loadBoard(date) {
  const file = path.join(ODDS_DIR, `sportingbet-${date}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return normaliseBoard(raw);
}

function listBoards() {
  if (!fs.existsSync(ODDS_DIR)) return [];
  return fs
    .readdirSync(ODDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/^sportingbet-|\.json$/g, ''))
    .sort();
}

/**
 * Normalise to { meta, prices: Map-like object keyed by `${marketId}|${selectionKey}` }.
 */
function normaliseBoard(raw) {
  const prices = {};
  for (const entry of raw.prices || []) {
    prices[`${entry.marketId}|${entry.selection}`] = roundToLadder(entry.odds);
  }
  return {
    meta: {
      bookmaker: raw.bookmaker || 'Sportingbet',
      date: raw.date,
      capturedAt: raw.capturedAt,
      source: raw.source || 'unknown',
      isLiveData: raw.source === 'live' || raw.source === 'import',
      priceCount: Object.keys(prices).length,
      notes: raw.notes || null,
    },
    prices,
  };
}

function saveBoard(date, board) {
  if (!fs.existsSync(ODDS_DIR)) fs.mkdirSync(ODDS_DIR, { recursive: true });
  const file = path.join(ODDS_DIR, `sportingbet-${date}.json`);
  fs.writeFileSync(file, JSON.stringify(board, null, 2));
  return file;
}

/**
 * Parse a pasted price list. Accepts the shape you get from copying a coupon:
 *
 *   bou-liv:total_corners:10.5 | over | 1.91
 *   bou-liv:player_shots:salah:2 | over | 2.10
 *
 * Also tolerates "=" or "@" as the price separator and ignores blank/comment lines.
 */
function parsePastedOdds(text, { date, bookmaker = 'Sportingbet' } = {}) {
  const prices = [];
  const errors = [];
  const lines = String(text).split(/\r?\n/);

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const parts = trimmed.split(/\s*[|@=]\s*/).filter(Boolean);
    if (parts.length < 3) {
      errors.push({ line: i + 1, text: trimmed, reason: 'expected: marketId | selection | odds' });
      return;
    }
    const odds = Number(parts[parts.length - 1]);
    if (!Number.isFinite(odds) || odds <= 1) {
      errors.push({ line: i + 1, text: trimmed, reason: `unusable price "${parts[parts.length - 1]}"` });
      return;
    }
    prices.push({
      marketId: parts[0],
      selection: parts[1].toLowerCase(),
      odds: roundToLadder(odds),
    });
  });

  return {
    board: {
      bookmaker,
      date: date || new Date().toISOString().slice(0, 10),
      capturedAt: new Date().toISOString(),
      source: 'import',
      prices,
    },
    errors,
  };
}

/**
 * Pull a board from an HTTP feed. Point ODDS_FEED_URL at anything that returns
 * either this module's board shape or a flat array of
 * { marketId, selection, odds }.
 */
async function fetchBoard({ url = process.env.ODDS_FEED_URL, apiKey = process.env.ODDS_API_KEY, date } = {}) {
  if (!url) {
    const err = new Error('No ODDS_FEED_URL configured - falling back to the saved board.');
    err.code = 'NO_FEED';
    throw err;
  }
  const headers = { accept: 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Odds feed responded ${res.status} ${res.statusText}`);
  const json = await res.json();

  const prices = Array.isArray(json) ? json : json.prices || [];
  return normaliseBoard({
    bookmaker: json.bookmaker || 'Sportingbet',
    date: date || json.date || new Date().toISOString().slice(0, 10),
    capturedAt: new Date().toISOString(),
    source: 'live',
    prices,
  });
}

/** Look up a price; returns null when the board does not quote that selection. */
function priceFor(board, marketId, selectionKey) {
  if (!board) return null;
  return board.prices[`${marketId}|${selectionKey}`] ?? null;
}

module.exports = {
  ODDS_DIR,
  roundToLadder,
  loadBoard,
  listBoards,
  saveBoard,
  normaliseBoard,
  parsePastedOdds,
  fetchBoard,
  priceFor,
};

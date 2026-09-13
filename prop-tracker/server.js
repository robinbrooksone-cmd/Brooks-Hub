'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const {
  SUMMARY_URL,
  SCOREBOARD_URL,
  fetchLiveData,
  getJson,
  shapeReport,
} = require('./espn');
const { buildPayload } = require('./evaluate');
const { getRosterIndex } = require('./rosters');

const app = express();
const PORT = Number(process.env.PORT) || 3100;
const POLL_MS = Number(process.env.POLL_MS) || 30000;
const SLIPS_PATH = path.join(__dirname, 'slips.json');

app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/* Slip config                                                         */
/* ------------------------------------------------------------------ */

/** Read fresh each time so editing slips.json takes effect without a restart. */
function readSlips() {
  const raw = fs.readFileSync(SLIPS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.slips)) throw new Error('slips.json: "slips" must be an array');
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Poll cache — last good response survives a failed fetch             */
/* ------------------------------------------------------------------ */

let lastGood = null; // { payload, fetchedAt }
let lastError = null;
let inFlight = null;

async function refresh({ date } = {}) {
  // Collapse concurrent requests onto one upstream fetch.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const config = readSlips();
      // Rosters are cached for hours and never fatal, so this is nearly always
      // a no-op that just hands back the existing index.
      const rosters = await getRosterIndex();
      const live = await fetchLiveData({ date, rosters });
      lastGood = { payload: buildPayload(config, live), fetchedAt: Date.now() };
      lastError = null;
      return lastGood;
    } catch (err) {
      lastError = { message: String(err?.message || err), at: Date.now() };
      console.error(`[poll] ${lastError.message}`);
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

app.get('/api/state', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;

  try {
    const fresh = await refresh({ date });
    res.json({
      ok: true,
      stale: false,
      fetchedAt: new Date(fresh.fetchedAt).toISOString(),
      pollMs: POLL_MS,
      error: null,
      ...fresh.payload,
    });
  } catch (err) {
    // A failed poll shows the last good data with its own timestamp
    // rather than blanking the screen.
    if (lastGood) {
      res.json({
        ok: true,
        stale: true,
        fetchedAt: new Date(lastGood.fetchedAt).toISOString(),
        pollMs: POLL_MS,
        error: String(err?.message || err),
        ...lastGood.payload,
      });
      return;
    }
    res.status(503).json({
      ok: false,
      stale: false,
      fetchedAt: null,
      pollMs: POLL_MS,
      error: String(err?.message || err),
      slips: [],
      games: [],
    });
  }
});

/** How each stat column was resolved on the last parse — audit the shape. */
app.get('/api/debug/shape', (req, res) => res.json(shapeReport));

/** Raw ESPN passthrough, for eyeballing the real response. */
app.get('/api/debug/scoreboard', async (req, res) => {
  try {
    res.json(await getJson(SCOREBOARD_URL));
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.get('/api/debug/summary/:eventId', async (req, res) => {
  try {
    res.json(await getJson(`${SUMMARY_URL}${encodeURIComponent(req.params.eventId)}`));
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`NFL prop tracker listening on http://localhost:${PORT}`);
  console.log(`Polling every ${POLL_MS / 1000}s. Slips: ${SLIPS_PATH}`);
  refresh().catch(() => {
    /* first poll failure is already logged; the page will retry */
  });
});

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
const { parseSlipText } = require('./slip-parser');

const app = express();
const PORT = Number(process.env.PORT) || 3100;
const POLL_MS = Number(process.env.POLL_MS) || 30000;
// Local app that accepts writes, so don't listen on every interface by default.
const HOST = process.env.HOST || '127.0.0.1';
const SLIPS_PATH = path.join(__dirname, 'slips.json');

app.use(express.json({ limit: '256kb' }));
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

/* ------------------------------------------------------------------ */
/* Adding and removing slips                                           */
/* ------------------------------------------------------------------ */

function writeSlips(config) {
  // Write via a temp file so an interrupted save can't truncate slips.json.
  const tmp = `${SLIPS_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, SLIPS_PATH);
}

function makeSlipId(name, existing) {
  const base =
    String(name || 'slip')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'slip';

  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const numberOrNull = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Parse pasted betslip text without saving anything — drives the preview. */
app.post('/api/slips/parse', (req, res) => {
  const { legs, problems } = parseSlipText(req.body?.text || '');
  res.json({ legs, problems });
});

/** Parse pasted betslip text and append it to slips.json. */
app.post('/api/slips', (req, res) => {
  try {
    const body = req.body || {};
    const { legs, problems } = parseSlipText(body.text || '');

    if (!legs.length) {
      res.status(400).json({
        error: 'No legs could be read from that text.',
        problems,
      });
      return;
    }

    const config = readSlips();
    const existing = new Set(config.slips.map((s) => s.id));

    const slip = {
      id: makeSlipId(body.name, existing),
      name: String(body.name || '').trim() || `Slip (${legs.length} legs)`,
      book: String(body.book || 'Sunbet').trim(),
      coupon: String(body.coupon || '').trim() || undefined,
      placedAt: new Date().toISOString(),
      stake: numberOrNull(body.stake),
      odds: numberOrNull(body.odds),
      payout: numberOrNull(body.payout),
      legs,
    };

    config.slips.push(slip);
    writeSlips(config);
    lastGood = null; // force the next poll to rebuild against the new slip

    console.log(`[slips] added "${slip.name}" with ${legs.length} legs`);
    res.json({ slip, problems });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.delete('/api/slips/:id', (req, res) => {
  try {
    const config = readSlips();
    const before = config.slips.length;
    config.slips = config.slips.filter((s) => s.id !== req.params.id);

    if (config.slips.length === before) {
      res.status(404).json({ error: `no slip with id "${req.params.id}"` });
      return;
    }

    writeSlips(config);
    lastGood = null;
    console.log(`[slips] removed "${req.params.id}"`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
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

app.listen(PORT, HOST, () => {
  console.log(`NFL prop tracker listening on http://${HOST}:${PORT}`);
  console.log(`Polling every ${POLL_MS / 1000}s. Slips: ${SLIPS_PATH}`);
  refresh().catch(() => {
    /* first poll failure is already logged; the page will retry */
  });
});

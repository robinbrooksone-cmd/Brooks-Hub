'use strict';

/**
 * NFL prop tracker — serves the dashboard and proxies ESPN server-side so the
 * browser never makes a cross-origin call.
 *
 * No dependencies: Node's own http server and global fetch do everything this
 * needs, so there is nothing to install before running it.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

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

const PORT = Number(process.env.PORT) || 3100;
const POLL_MS = Number(process.env.POLL_MS) || 30000;
// Local app that accepts writes, so don't listen on every interface by default.
const HOST = process.env.HOST || '127.0.0.1';

const PUBLIC_DIR = path.join(__dirname, 'public');
const SLIPS_PATH = path.join(__dirname, 'slips.json');

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, relative);

  // Never serve outside public/, whatever the request path claims.
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* Slip config                                                         */
/* ------------------------------------------------------------------ */

/** Read fresh each time so editing slips.json takes effect without a restart. */
function readSlips() {
  const parsed = JSON.parse(fs.readFileSync(SLIPS_PATH, 'utf8'));
  if (!Array.isArray(parsed.slips)) throw new Error('slips.json: "slips" must be an array');
  return parsed;
}

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

/* ------------------------------------------------------------------ */
/* Poll cache — last good response survives a failed fetch             */
/* ------------------------------------------------------------------ */

let lastGood = null; // { payload, fetchedAt }
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
      return lastGood;
    } catch (err) {
      console.error(`[poll] ${err?.message || err}`);
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

async function handleState(url, res) {
  const date = url.searchParams.get('date') || undefined;

  try {
    const fresh = await refresh({ date });
    sendJson(res, 200, {
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
      sendJson(res, 200, {
        ok: true,
        stale: true,
        fetchedAt: new Date(lastGood.fetchedAt).toISOString(),
        pollMs: POLL_MS,
        error: String(err?.message || err),
        ...lastGood.payload,
      });
      return;
    }
    sendJson(res, 503, {
      ok: false,
      stale: false,
      fetchedAt: null,
      pollMs: POLL_MS,
      error: String(err?.message || err),
      slips: [],
      games: [],
    });
  }
}

function handleAddSlip(body, res) {
  const { legs, problems } = parseSlipText(body.text || '');

  if (!legs.length) {
    sendJson(res, 400, { error: 'No legs could be read from that text.', problems });
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
  sendJson(res, 200, { slip, problems });
}

function handleRemoveSlip(id, res) {
  const config = readSlips();
  const before = config.slips.length;
  config.slips = config.slips.filter((s) => s.id !== id);

  if (config.slips.length === before) {
    sendJson(res, 404, { error: `no slip with id "${id}"` });
    return;
  }

  writeSlips(config);
  lastGood = null;
  console.log(`[slips] removed "${id}"`);
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (req.method === 'GET' && pathname === '/api/state') return await handleState(url, res);

    if (req.method === 'POST' && pathname === '/api/slips/parse') {
      const body = await readBody(req);
      return sendJson(res, 200, parseSlipText(body.text || ''));
    }

    if (req.method === 'POST' && pathname === '/api/slips') {
      return handleAddSlip(await readBody(req), res);
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/slips/')) {
      return handleRemoveSlip(decodeURIComponent(pathname.slice('/api/slips/'.length)), res);
    }

    /** How each stat column was resolved on the last parse — audit the shape. */
    if (req.method === 'GET' && pathname === '/api/debug/shape') {
      return sendJson(res, 200, shapeReport);
    }

    /** Raw ESPN passthrough, for eyeballing the real response. */
    if (req.method === 'GET' && pathname === '/api/debug/scoreboard') {
      return sendJson(res, 200, await getJson(SCOREBOARD_URL));
    }

    if (req.method === 'GET' && pathname.startsWith('/api/debug/summary/')) {
      const eventId = pathname.slice('/api/debug/summary/'.length);
      return sendJson(res, 200, await getJson(`${SUMMARY_URL}${encodeURIComponent(eventId)}`));
    }

    if (req.method === 'GET') return serveStatic(res, pathname);

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n  NFL prop tracker running — open ${url}\n`);
  console.log(`  Polling every ${POLL_MS / 1000}s. Slips: ${SLIPS_PATH}`);
  console.log('  Press Ctrl+C to stop.\n');
  refresh().catch(() => {
    /* first poll failure is already logged; the page will retry */
  });
});

module.exports = server;

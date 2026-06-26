require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const CONTENT_PATH = path.join(__dirname, 'config', 'content.json');

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function readContent() {
  return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ---------- Public content ----------

app.get('/api/content', (req, res) => {
  res.json(readContent());
});

// ---------- Public RSVP ----------

app.get('/api/rsvp/search', (req, res) => {
  const q = (req.query.name || '').trim();
  if (q.length < 2) return res.json({ parties: [] });

  const rows = db
    .prepare(
      `SELECT DISTINCT p.id, p.label
       FROM parties p
       JOIN guests g ON g.party_id = p.id
       WHERE (g.first_name || ' ' || g.last_name) LIKE ?
          OR g.last_name LIKE ?
          OR g.first_name LIKE ?
          OR p.label LIKE ?
       LIMIT 10`
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

  const parties = rows.map((p) => {
    const guests = db
      .prepare('SELECT id, first_name, last_name, is_child, invited_events FROM guests WHERE party_id = ?')
      .all(p.id);
    return { id: p.id, label: p.label, guests };
  });

  res.json({ parties });
});

app.post('/api/rsvp/submit', (req, res) => {
  const content = readContent();
  if (content.rsvp && content.rsvp.isOpen === false) {
    return res.status(403).json({ error: 'RSVPs are closed' });
  }

  const { partyId, guests, songRequest, message } = req.body || {};
  if (!partyId || !Array.isArray(guests)) {
    return res.status(400).json({ error: 'partyId and guests[] are required' });
  }

  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
  if (!party) return res.status(404).json({ error: 'Party not found' });

  const validGuestIds = new Set(
    db.prepare('SELECT id FROM guests WHERE party_id = ?').all(partyId).map((g) => g.id)
  );

  const updateGuest = db.prepare(
    'UPDATE guests SET attending = ?, meal_choice = ?, dietary_notes = ? WHERE id = ? AND party_id = ?'
  );

  let anyAttending = false;
  const tx = db.transaction(() => {
    for (const g of guests) {
      if (!validGuestIds.has(g.id)) continue;
      const attending = g.attending ? 1 : 0;
      if (attending) anyAttending = true;
      updateGuest.run(attending, g.mealChoice || null, g.dietaryNotes || null, g.id, partyId);
    }
    db.prepare(
      'UPDATE parties SET attending = ?, song_request = ?, message = ?, responded_at = datetime(\'now\') WHERE id = ?'
    ).run(anyAttending ? 1 : 0, songRequest || null, message || null, partyId);
  });
  tx();

  res.json({ ok: true });
});

// ---------- Admin auth ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server has no ADMIN_PASSWORD configured' });
  }
  if (password && timingSafeEqual(password, ADMIN_PASSWORD)) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

// ---------- Admin: parties & guests ----------

function serializeParty(party) {
  const guests = db
    .prepare('SELECT * FROM guests WHERE party_id = ? ORDER BY id')
    .all(party.id);
  return { ...party, guests };
}

app.get('/api/admin/parties', requireAdmin, (req, res) => {
  const parties = db.prepare('SELECT * FROM parties ORDER BY label').all();
  res.json({ parties: parties.map(serializeParty) });
});

app.post('/api/admin/parties', requireAdmin, (req, res) => {
  const { label, maxGuests, notes, guests } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });

  const insertParty = db.prepare(
    'INSERT INTO parties (label, max_guests, notes) VALUES (?, ?, ?)'
  );
  const insertGuest = db.prepare(
    'INSERT INTO guests (party_id, first_name, last_name, is_child, invited_events) VALUES (?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    const info = insertParty.run(label, maxGuests || (guests || []).length || 1, notes || null);
    const partyId = info.lastInsertRowid;
    for (const g of guests || []) {
      insertGuest.run(
        partyId,
        g.firstName || '',
        g.lastName || '',
        g.isChild ? 1 : 0,
        g.invitedEvents || 'ceremony,reception'
      );
    }
    return partyId;
  });
  const partyId = tx();

  res.json({ party: serializeParty(db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId)) });
});

app.put('/api/admin/parties/:id', requireAdmin, (req, res) => {
  const { label, maxGuests, notes } = req.body || {};
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });

  db.prepare('UPDATE parties SET label = ?, max_guests = ?, notes = ? WHERE id = ?').run(
    label ?? party.label,
    maxGuests ?? party.max_guests,
    notes ?? party.notes,
    party.id
  );
  res.json({ party: serializeParty(db.prepare('SELECT * FROM parties WHERE id = ?').get(party.id)) });
});

app.delete('/api/admin/parties/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM parties WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/parties/:id/guests', requireAdmin, (req, res) => {
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });

  const { firstName, lastName, isChild, invitedEvents } = req.body || {};
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }
  const info = db
    .prepare(
      'INSERT INTO guests (party_id, first_name, last_name, is_child, invited_events) VALUES (?, ?, ?, ?, ?)'
    )
    .run(party.id, firstName, lastName, isChild ? 1 : 0, invitedEvents || 'ceremony,reception');

  res.json({ guest: db.prepare('SELECT * FROM guests WHERE id = ?').get(info.lastInsertRowid) });
});

app.put('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  const { firstName, lastName, isChild, invitedEvents } = req.body || {};
  db.prepare(
    'UPDATE guests SET first_name = ?, last_name = ?, is_child = ?, invited_events = ? WHERE id = ?'
  ).run(
    firstName ?? guest.first_name,
    lastName ?? guest.last_name,
    isChild === undefined ? guest.is_child : isChild ? 1 : 0,
    invitedEvents ?? guest.invited_events,
    guest.id
  );
  res.json({ guest: db.prepare('SELECT * FROM guests WHERE id = ?').get(guest.id) });
});

app.delete('/api/admin/guests/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Splits a delimited row, respecting double-quoted fields (handles commas/quotes
// inside a cell when pasted as CSV from a spreadsheet).
function splitDelimitedLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t').map((c) => c.trim());

  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

// Bulk import: accepts comma-separated CSV, or tab-separated text pasted
// directly from Excel/Sheets. Header row required:
// first_name,last_name,party_label,max_guests,is_child,invited_events
app.post('/api/admin/import-csv', requireAdmin, (req, res) => {
  const { csv } = req.body || {};
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'csv text is required' });
  }

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return res.status(400).json({ error: 'csv has no data rows' });

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const header = splitDelimitedLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const required = ['first_name', 'last_name', 'party_label'];
  for (const r of required) {
    if (!header.includes(r)) {
      return res.status(400).json({ error: `Missing required column: ${r}` });
    }
  }

  const idx = (name) => header.indexOf(name);
  const findParty = db.prepare('SELECT * FROM parties WHERE label = ?');
  const insertParty = db.prepare('INSERT INTO parties (label, max_guests, notes) VALUES (?, ?, ?)');
  const insertGuest = db.prepare(
    'INSERT INTO guests (party_id, first_name, last_name, is_child, invited_events) VALUES (?, ?, ?, ?, ?)'
  );
  const bumpMax = db.prepare('UPDATE parties SET max_guests = ? WHERE id = ?');

  let imported = 0;
  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const cols = splitDelimitedLine(raw, delimiter);

      const firstName = cols[idx('first_name')] || '';
      const lastName = cols[idx('last_name')] || '';
      const partyLabel = cols[idx('party_label')] || `${firstName} ${lastName}`;
      const isChild = idx('is_child') >= 0 ? /^(1|true|yes)$/i.test(cols[idx('is_child')] || '') : false;
      // Accept "ceremony;reception" (safe with comma-delimited CSV) or "ceremony,reception".
      const invitedEvents = (idx('invited_events') >= 0 ? cols[idx('invited_events')] || 'ceremony;reception' : 'ceremony;reception').replace(/;/g, ',');
      const maxGuestsCol = idx('max_guests') >= 0 ? parseInt(cols[idx('max_guests')], 10) : null;

      if (!firstName || !lastName) continue;

      let party = findParty.get(partyLabel);
      if (!party) {
        const info = insertParty.run(partyLabel, maxGuestsCol || 1, null);
        party = { id: info.lastInsertRowid };
      } else if (maxGuestsCol) {
        bumpMax.run(maxGuestsCol, party.id);
      }

      insertGuest.run(party.id, firstName, lastName, isChild ? 1 : 0, invitedEvents);
      imported++;
    }
  });
  tx();

  res.json({ ok: true, imported });
});

// RSVP export as CSV
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.label AS party_label, p.attending AS party_attending, p.song_request, p.message, p.responded_at,
              g.first_name, g.last_name, g.is_child, g.attending AS guest_attending, g.meal_choice, g.dietary_notes
       FROM parties p
       LEFT JOIN guests g ON g.party_id = p.id
       ORDER BY p.label, g.last_name`
    )
    .all();

  const header = [
    'party_label',
    'party_attending',
    'first_name',
    'last_name',
    'is_child',
    'guest_attending',
    'meal_choice',
    'dietary_notes',
    'song_request',
    'message',
    'responded_at',
  ];
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.party_label,
        r.party_attending,
        r.first_name,
        r.last_name,
        r.is_child,
        r.guest_attending,
        r.meal_choice,
        r.dietary_notes,
        r.song_request,
        r.message,
        r.responded_at,
      ]
        .map(escape)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="rsvps.csv"');
  res.send(lines.join('\n'));
});

app.listen(PORT, () => {
  console.log(`Wedding site running at http://localhost:${PORT}`);
});

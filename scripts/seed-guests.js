const fs = require('fs');
const path = require('path');
const db = require('../db');

const CSV_PATH = path.join(__dirname, '..', 'data', 'guests.csv');

function parseCsvLine(line) {
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
    } else if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM parties').get();
  if (existing.n > 0) {
    console.log(`Skipping seed: ${existing.n} party row(s) already exist.`);
    return;
  }

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);

  const findParty = db.prepare('SELECT id FROM parties WHERE label = ?');
  const insertParty = db.prepare('INSERT INTO parties (label, max_guests, notes) VALUES (?, ?, ?)');
  const insertGuest = db.prepare(
    'INSERT INTO guests (party_id, first_name, last_name, is_child, invited_events) VALUES (?, ?, ?, ?, ?)'
  );

  let parties = 0;
  let guests = 0;
  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const cols = parseCsvLine(raw);

      const firstName = cols[idx('first_name')] || '';
      const lastName = cols[idx('last_name')] || '';
      const partyLabel = cols[idx('party_label')] || `${firstName} ${lastName}`;
      const isChild = /^(1|true|yes)$/i.test(cols[idx('is_child')] || '');
      const invitedEvents = (cols[idx('invited_events')] || 'ceremony;reception').replace(/;/g, ',');
      const maxGuests = parseInt(cols[idx('max_guests')], 10) || 1;

      if (!firstName || !lastName) continue;

      let partyId = findParty.get(partyLabel)?.id;
      if (!partyId) {
        const info = insertParty.run(partyLabel, maxGuests, null);
        partyId = info.lastInsertRowid;
        parties++;
      }

      insertGuest.run(partyId, firstName, lastName, isChild ? 1 : 0, invitedEvents);
      guests++;
    }
  });
  tx();

  console.log(`Seeded ${parties} parties / ${guests} guests from ${path.relative(process.cwd(), CSV_PATH)}`);
}

seed();

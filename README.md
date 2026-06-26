# Annami & Robin's Wedding Website

A self-hosted wedding website with photo gallery, event details, travel info,
and a **guest-list-matched RSVP system** with a password-protected admin
dashboard for managing the guest list and viewing responses.

## Quick start

```bash
npm install
cp .env.example .env   # then edit .env — set ADMIN_PASSWORD and SESSION_SECRET
npm start
```

Visit `http://localhost:3000` for the public site and
`http://localhost:3000/admin.html` for the admin dashboard (log in with the
`ADMIN_PASSWORD` you set in `.env`).

Guest and RSVP data live in a SQLite file at `data/wedding.db`. It's created
automatically on first run and is gitignored — back it up before redeploying.

## Editing site content

All the text on the site (names, date, story, wedding party bios, schedule,
attire, travel/accommodation, registry, FAQ, gallery photos) lives in one
file: **`config/content.json`**. Edit it and refresh the page — no code
changes or restart needed, the site reads it live.

See **`QUESTIONNAIRE.md`** for the full list of content to fill in, organized
by section, matching the fields in `content.json`.

## Adding photos

Drop image files into `public/img/gallery/` and reference them by path
(e.g. `/img/gallery/my-photo.jpg`) in `content.json` — for the hero photo,
story timeline photos, wedding party headshots, attire inspiration photo,
and the `gallery.photos` array.

## Managing the guest list

RSVP is **guest-list matched**: guests type their name on the RSVP section
and pick their household from the matches, then RSVP for everyone in that
household at once (each person can be marked attending/not, with a meal
choice and dietary notes).

You load the guest list ahead of time via the admin dashboard:

- **Add one household at a time** with the "Add a Party / Household" form.
- **Bulk import via CSV** — paste rows with this header:
  ```
  first_name,last_name,party_label,max_guests,is_child,invited_events
  ```
  Give everyone in the same household the same `party_label` (e.g.
  "The Smith Family") to group them. `invited_events` can be
  `ceremony,reception` or just one of them, for guests only invited to part
  of the day.
- **Export all RSVPs as CSV** anytime from the dashboard, for caterers,
  seating charts, etc.

## Deployment

This is a Node.js app with a local SQLite file, so it needs a host that runs
a persistent Node process with a writable disk — e.g. a small VPS, or a
platform like Render, Railway, or Fly.io. It will **not** work on a static
host (like GitHub Pages) since the RSVP/admin features need the server.

Whatever you choose:
1. Set `ADMIN_PASSWORD` and `SESSION_SECRET` as environment variables (don't
   commit `.env`).
2. Make sure `data/` is on persistent storage so RSVPs survive redeploys.
3. Run `npm install && npm start` (or point your platform's start command at
   `node server.js`).

## Project structure

```
config/content.json   — all editable site copy
data/wedding.db        — SQLite database (guests, RSVPs) — gitignored
db.js                  — database schema/connection
server.js              — Express app: public site, RSVP API, admin API
public/                — static frontend
  index.html, css/style.css, js/main.js   — public site
  admin.html, css/admin.css, js/admin.js  — admin dashboard
QUESTIONNAIRE.md        — content to fill in, organized by section
```

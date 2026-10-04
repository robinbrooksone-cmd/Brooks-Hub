# Robin & Annami — Wedding Website

Built with Next.js (App Router) + Supabase. Recreates the design from the
`project/Robin & Annami Wedding.dc.html` bundle as a real, deployable site
with working RSVPs, a guest-facing prediction game (BrooksWay) with PayFast
payment, and a password-protected dashboard for Robin & Annami to manage
everything.

## Quick start (local)

This machine didn't have Node.js installed, so a local copy lives in
`../.tools/` (outside this folder) and `dev.sh` / `start.sh` use it
automatically — just run `./dev.sh`. If you'd rather use your own Node
install (recommended for normal use — get it from
[nodejs.org](https://nodejs.org) or Homebrew), the usual commands work too:

```bash
npm install
cp .env.local.example .env.local   # fill in values, see below
npm run dev
```

Open http://localhost:3000. The site works out of the box with **no
Supabase configured** — it falls back to a local JSON file
(`data/store.local.json`) so you can click through everything immediately.
That fallback is single-machine only; see below before sharing the link with
real guests.

## Before you invite guests: set up Supabase

Without a real database, each guest's RSVP only saves to *their own
browser* — you'd never see it. To fix that:

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run everything in `supabase/schema.sql`.
3. In Project Settings → API, copy the **Project URL** and the
   **`service_role` secret key**.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment
   (locally in `.env.local`; on Vercel under Project Settings → Environment
   Variables).

The whole site's data (RSVPs, guest list, seating, planner, BrooksWay slips)
lives as one JSON document in a single `site_state` table — simple by
design, plenty for a wedding site. The service role key is only ever used
server-side inside Next.js Server Actions; it's never sent to the browser,
so guests' names/phone numbers stay private.

## Admin dashboard

Go to `/admin` (also linked from the footer and mobile menu as "Bride
Dashboard"). It's protected by a PIN, set via `ADMIN_PIN` — **change it from
the default (`260526`) before going live**. From there you can:

- See every RSVP as it comes in
- Manage the guest list (add/remove households and members, switch sides)
- Track wedding to-dos and vendor payments
- Assign confirmed guests to tables
- Edit the "Us Through the Years" timeline — add/remove/reorder moments and their photos
- Edit BrooksWay's questions and answer options, launch each game when you're ready (it shows "Coming soon" to guests until then), set actual answers, reveal winners, and confirm slip payments
- Email every RSVP'd guest a "BrooksWay is open!" notification with one click
- Drag and drop real photo files (or paste a link) onto almost any slot on the site — hero, section covers, wedding party headshots, Story moments — no code changes, no hosting elsewhere needed
- Edit every piece of English/Afrikaans copy on the site from one searchable list, no code changes needed

## BrooksWay payments (PayFast)

The prediction game charges R50 a slip, paid through **PayFast**'s hosted
checkout — a real "Pay Now" flow (card, Instant EFT, and other SA payment
methods) with automatic confirmation, registered as an **Individual**
account (no company/CIPC registration needed).

How it works: guest builds a slip → gets redirected to PayFast's hosted
checkout page → pays → gets redirected back with a confirmation screen.
Behind the scenes, PayFast POSTs a webhook (**ITN** — Instant Transaction
Notification) to `/api/payfast/notify` the moment payment completes, which
verifies the signature, double-checks with PayFast that it's genuine, and
marks the slip paid automatically — no manual bank-checking needed. The
"Mark paid" button in `/admin` → BrooksWay still exists as a manual
fallback, just in case.

**Important**: the ITN webhook needs a real, publicly reachable HTTPS URL —
PayFast's servers can't reach `localhost`. So automatic confirmation only
actually works once this is deployed; locally you can still test the
checkout redirect itself with PayFast's sandbox (see below), you just won't
see the slip auto-confirm until it's live.

**Credentials are set from `/admin` → BrooksWay → PayFast Settings — not an
environment variable.** That means Robin & Annami can add their real
Merchant ID/Key themselves the moment their account is verified, with no
redeploy and no need to involve a developer.

To go live:
1. Sign up free at [payfast.io](https://www.payfast.io), choosing
   **Individual** as the account type — just your name, SA ID number, and
   the bank account you want payouts in.
2. Find your **Merchant ID** and **Merchant Key** under Settings →
   Integration.
3. In `/admin` → BrooksWay, paste them into the **PayFast Settings** panel.
   A Passphrase is optional but recommended (any string — must match what
   you set in PayFast's integration settings).
4. Tick **Use live payments** and hit Save. Checkout switches from sandbox
   to real payments immediately — the panel shows a clear LIVE/Sandbox
   status badge so it's always obvious which mode you're in.

Until real credentials are entered, checkout automatically uses PayFast's
public sandbox test merchant — fully clickable and testable (PayFast
publishes test card numbers for this), never touches real money.

## Launching BrooksWay & notifying guests

BrooksWay starts hidden — guests see a "Coming soon" card on `/games` for
each game until you turn it on. When you're ready (e.g. two weeks out):

1. Go to `/admin` → BrooksWay, review/edit the questions for each game.
2. Tap **Launch this game** for ceremony and/or reception.
3. Tap **Notify N guests** to email everyone who's RSVP'd (with an email on
   file) that predictions are open. It only emails guests who haven't
   already been notified, so it's safe to press again later if new RSVPs
   come in.

Notifications need a free [Resend](https://resend.com) account — sign up,
create an API key, and set `RESEND_API_KEY` (see `.env.local.example`). No
domain verification needed to start; it sends from a shared Resend test
address until you verify your own.

## Editing content

- **Photos**: from `/admin` → Photos (and Story, for the timeline), drag a
  photo file straight onto any slot — it uploads for real to Supabase
  Storage, no external hosting needed. You can also paste a link instead.
  Every slot starts empty ("No photo yet") until you add one — there are no
  bundled placeholder photos baked into the site anymore.
- **"Us Through the Years" timeline**: `/admin` → Story — add, remove,
  reorder, and set photos for as many moments as you like.
- **BrooksWay questions**: `/admin` → BrooksWay — edit question text and
  comma-separated answer options, add/remove/reorder questions.
- **English/Afrikaans copy**: `/admin` → Text — every piece of UI copy on
  the site (nav labels, headings, form text, everything in `lib/dict.ts`),
  searchable, editable in both languages, saves instantly. Content that
  lives in `lib/content.ts` instead (wedding party names/bios, FAQ, travel,
  contacts, banking details) still needs a code change — ask me, or edit
  that file directly.
- **Guest list**: seeded from `lib/roster.ts` on first run; after that, edit
  it live from `/admin` → Guest List (adding/removing there doesn't touch
  the seed file).
- **Theme colours**: CSS variables at the top of `app/globals.css`.

Photo uploads need Supabase Storage — same project as the rest of the data,
no extra signup. The `photos` bucket was created automatically; if you ever
recreate the Supabase project from scratch, re-run the bucket creation step
(see git history / ask me) before uploads will work.

## Deploying

Push this repo to GitHub and import it into [Vercel](https://vercel.com).
Add the environment variables from `.env.local.example` under Project
Settings → Environment Variables, then deploy. No other configuration
needed — Vercel builds Next.js projects automatically.

## Notes on the port from the design file

The original `.dc.html` file is a UI prototype (not real code) exported from
Claude Design, running its own bespoke templating runtime. This project
reimplements its visual design and behavior as a real Next.js app — same
layout, copy, colors, and flows, but with a proper backend, an admin login,
and payment integration instead of the prototype's local-storage-only,
click-through mockups. The seating tool is list/dropdown-based here rather
than the prototype's drag-and-drop floor plan, to keep the admin surface
simple and reliable; everything else (RSVP search-by-family, BrooksWay
game logic, bilingual copy, guest roster grouping) matches the original
prototype's behavior.

## Deploying

The live site deploys automatically from the `wedding-site-live` branch of
this repo (Vercel → Settings → Environments → Production → Branch Tracking):
push a change there and Vercel publishes it within a few minutes.

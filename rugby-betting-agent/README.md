# SA Rugby Betting Agent

An analysis agent for South African rugby betting markets (Betway, Sunbet, Supabets,
Hollywoodbets, World Sports Betting, and any other book you plug in). It ingests
odds, builds an independent "fair value" line for each match, and flags where a
specific bookmaker's price has drifted from that fair value — i.e. the gaps where
the market may be leaning too far under or over on a side.

**It only analyzes and reports. It never places, modifies, or automates a bet.**
That's a deliberate scope boundary, not a missing feature — see [Responsible use](#responsible-use).

## How it finds gaps

1. **Ingest** — pull decimal odds for upcoming rugby matches from every bookmaker
   you've wired up (odds API and/or scrapers), across `h2h`, `spreads`, and `totals`
   markets, and store every snapshot with a timestamp.
2. **De-vig each book** — every bookmaker's odds bake in a margin ("overround"). Each
   book's own set of prices is stripped of its margin independently using
   [Shin's method](https://en.wikipedia.org/wiki/Shin%27s_model) (`src/analysis/devig.js`),
   which corrects for favorite-longshot bias better than a naive normalization.
3. **Build consensus** — the de-vigged probabilities from every book covering a match
   are averaged into a "wisdom of the market" fair probability (`src/analysis/consensus.js`).
   This requires at least `MIN_BOOKMAKERS_FOR_CONSENSUS` independent books (default 2)
   before it's trusted for anything.
4. **Independent power rating** — a rugby-specific Elo model (`src/analysis/elo.js`), seeded
   from historical results, produces its own win-probability estimate with home advantage
   and a margin-of-victory multiplier. This means a flagged opportunity isn't purely "one
   book disagrees with the others" — the team-strength model has to (mostly) agree too.
5. **Blend** — consensus and Elo probabilities are combined into a single fair value per
   selection (`CONSENSUS_WEIGHT` / `ELO_WEIGHT`, default 65/35) (`src/analysis/fairValue.js`).
6. **Flag opportunities** — for every live price, compute the edge (`fair_prob * price - 1`)
   against the blended fair value, and require the price to also be a statistical outlier
   vs. the median across books (`EDGE_THRESHOLD_PCT`, `OUTLIER_THRESHOLD_PCT`). Both
   conditions must hold before something is reported — this is what separates "this book's
   price gap looks exploitable" from generic model noise (`src/analysis/valueFinder.js`).
7. **Report** — flagged opportunities are written to a daily Markdown/JSON report and
   served on a small local dashboard, each with a plain-language rationale, a confidence
   label, and a suggested max stake sized by fractional Kelly (capped, informational only).

## Setup

```bash
cd rugby-betting-agent
npm install
cp .env.example .env
npm run selfcheck   # verifies the core math (devig/Elo/Kelly) before you rely on it
```

### 1. Odds data (pick at least one)

**Odds API (recommended, works out of the box once you have a key)**
Sign up at an odds-data provider (e.g. [the-odds-api.com](https://the-odds-api.com)) and
set `ODDS_API_KEY` in `.env`. Verify `ODDS_API_SPORT_KEYS` and `ODDS_API_REGIONS` against
your account's `/v4/sports` listing — exact rugby tournament keys and South African
bookmaker coverage change by season and by plan, so don't assume the defaults in
`.env.example` are current.

**Bookmaker scrapers (optional, off by default, you fill in the selectors)**
`config/bookmakers.json` has one entry per SA bookmaker with placeholder CSS selectors.
Nothing scrapes until you (a) inspect that bookmaker's rugby odds page yourself and fill
in real selectors, (b) set that entry's `enabled: true`, and (c) set `SCRAPERS_ENABLED=true`
in `.env`. **Check the bookmaker's terms of service and robots.txt before enabling a
scraper against their site** — this repo doesn't warrant that scraping any given
bookmaker is permitted, and ToS violations are your risk to own, not something this
codebase decides for you.

### 2. Elo seed data

```bash
npm run seed-elo -- data/your-real-results.csv
```

`data/sample-results.csv` only contains **fictional placeholder rows** to document the
CSV format (`date,competition,home_team,away_team,home_score,away_score`) — it is not
real rugby history. Populate your own file from a results archive (rugby stats
provider, ESPN Scrum, Wikipedia match lists, etc.) before trusting the Elo half of the
model. Team names should match what your odds provider calls them, so the Elo blend
lines up automatically with `h2h` markets.

### 3. Run it

```bash
npm run ingest    # pull odds into the DB
npm run analyze   # recompute fair values + flag opportunities
npm run report    # write reports/latest.md and reports/latest.json
npm run serve     # dashboard at http://localhost:4100
npm run schedule  # run ingest -> analyze -> report daily at REPORT_TIME_CRON
```

`node src/cli.js pipeline` runs ingest → analyze → report once immediately (useful to
sanity-check the whole chain, or to call from your own cron/systemd unit instead of the
built-in scheduler).

## Data model

SQLite (`better-sqlite3`), file at `DB_PATH` (default `data/rugby-betting-agent.db`,
gitignored). `odds_snapshots` and `fair_values` are append-only history — every ingest/
analyze run adds new rows rather than overwriting, so you can see a match's price and
fair-value history over time, not just the latest snapshot. `value_opportunities` records
every flag ever raised, with the exact price, fair probability, edge, and rationale that
triggered it.

## Tuning

All thresholds live in `.env` (see `.env.example`): edge/outlier thresholds, consensus
vs. Elo weighting, Kelly cap, Elo K-factor and home advantage, minimum bookmakers
required before a consensus is trusted. Tighten `EDGE_THRESHOLD_PCT` /
`OUTLIER_THRESHOLD_PCT` if the daily report is too noisy; loosen them if it's too quiet
during early data collection.

## Responsible use

- **This tool does not place bets.** Every output is a report for you to review and act
  on manually, at the actual bookmaker, at the actual live price (which may have moved).
- Only bet with bookmakers licensed by South Africa's provincial gambling boards.
- Odds, lines, and your own bankroll are subject to change quickly — treat every
  "edge" figure as an estimate from a model, not a guarantee.
- The suggested stake sizes are capped fractional-Kelly figures for reference only, not
  financial advice. Never stake more than you can afford to lose, and consider
  self-exclusion tools if betting stops being fun.
- If gambling is becoming a problem, look up South Africa's National Responsible
  Gambling Programme helpline (search "NRGP South Africa helpline") — a specific
  number isn't quoted here since it couldn't be independently verified while writing
  this, and a wrong number in this context isn't a risk worth taking.

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

Two distinct kinds of gap get flagged, and the report keeps them separate because
they carry very different confidence:

- **Single-book mispricing** — one bookmaker's price stands out from its peers (or it's
  the only book quoting that selection). Strong signal: it doesn't require trusting any
  model, just that this book disagrees with the rest of the market.
- **Whole-market disagreement** — every tracked book agrees with each other, but an
  independent model (Elo, or the try-scorer model below) disagrees with all of them at
  once. This is the "market leaning too far under/over" case, and it's a bigger claim —
  our model vs. the market's collective wisdom — so it needs a higher edge bar
  (`MODEL_DIVERGENCE_THRESHOLD_PCT`, default 8%) and is always labeled `model-driven`.

## Player props (anytime/first try scorer)

Bookmakers often price a player generically by position rather than by how their team
actually creates tries — a hooker on a team with a dominant driving maul may get scored
a disproportionate share of team tries that a flat positional price doesn't reflect.
The props model is built to surface that pattern from data, not assume it:

1. **Team attack rate** — a team's rolling average tries scored per match
   (`src/analysis/propsModel.js`).
2. **Opponent defense factor** — the upcoming opponent's rolling tries *conceded*,
   relative to the league average (a leaky defense multiplies expected tries up).
3. **Expected team tries** = attack rate × opponent's defense factor.
4. **Player try share** — this specific player's historical share of his own team's
   tries (his tries ÷ his team's tries, over the same rolling window). This is the
   number that captures a driving-maul hooker's outsized share — if the data shows it,
   the model reflects it; if it doesn't, the model won't invent an edge.
5. **Expected player tries** = expected team tries × player's try share, converted to a
   scoring probability via a Poisson model: `P(scores >= 1) = 1 - e^-λ`.
6. This model probability is blended with a raw bookmaker consensus (`PROP_CONSENSUS_WEIGHT`
   / `PROP_MODEL_WEIGHT`, default 50/50). Prop markets are usually one-sided (only a "Yes"
   price, no "No" line to devig against), so unlike match markets this consensus is *not*
   de-vigged — it's flagged as `raw_consensus_no_devig` (or `raw_consensus+try_model` once
   the model contributes) so you know each book's margin is still baked in.

### Feeding it props data

```bash
npm run seed-tries -- data/your-team-tries.csv data/your-player-tries.csv
npm run ingest-props -- data/your-prop-odds.csv
```

`data/sample-team-tries.csv`, `data/sample-player-tries.csv`, and `data/sample-prop-odds.csv`
are **fictional placeholder data**, same as the Elo sample — they exist to document the
three CSV formats, not as real results or real odds:

- Team tries: `date,competition,team,opponent,tries_scored` — one row per team per match
  (a real match needs two rows, one per side).
- Player tries: `date,competition,team,player,position,tries` — one row per player per
  match they featured in.
- Prop odds: `date,home_team,away_team,competition,bookmaker,player,player_team,position,market,price`
  — `market` is one of `player_try_scorer_anytime` / `player_try_scorer_first` /
  `player_try_scorer_last`.

Player prop odds are realistically the hardest data source here: many odds-comparison
APIs have thin or no rugby prop coverage, and even where a bookmaker offers a try-scorer
market it's usually only readable off their own site — not something you can assume the
Odds API adapter or the bookmaker scrapers pull automatically. `npm run ingest-props` is
a manual/CSV entry point for exactly that reason: check a book's try-scorer market
yourself and log it, or point a scraper you've built at it and have it write this same
CSV shape. Team and player names must match what you use in the try-log CSVs (and in the
Elo results) for everything to link up automatically.

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

### Dashboard: finding and drilling into one match

The dashboard (`npm run serve`, `http://localhost:4100`) has a search box at the top —
type a team name (e.g. "England" or "Fiji") to find a specific fixture, including one
that's already kicked off or finished (the main list only shows upcoming matches, but
search isn't restricted to that). Click any match name to open its detail page
(`/match.html?id=<id>`), which shows:

- every flagged opportunity for that match (both `book_outlier` and `model_divergence`)
- the **full board** — every bookmaker's latest price on every market, not just the ones
  that cleared the flagging thresholds, so you can see why something wasn't flagged
- the blended fair value behind each selection, with the method used and how many books
  contributed
- complete price history (every snapshot ever ingested), for watching how a book's price
  moved as you re-run `ingest`

The same data is available directly via `GET /api/matches/search?team=...` and
`GET /api/matches/:id` if you want to script against it.

### Manual match odds

For fixtures the Odds API adapter and bookmaker scrapers don't reliably cover — smaller
or age-grade tournaments especially (see below) — there's a CSV entry point mirroring
the props one:

```bash
npm run ingest-match-odds -- data/your-match-odds.csv
```

Format: `date,home_team,away_team,competition,bookmaker,market,selection,line,price`
(`market` is `h2h` / `spreads` / `totals`; `selection` is a team name for h2h/spreads,
or `Over`/`Under` for totals). `data/sample-match-odds.csv` is fictional placeholder
data, same as everything else under `data/`.

## Age-grade competitions (U20 Rugby World Cup)

Nothing in the data model is specific to senior rugby — `competition` is just a free-text
field carried through matches, teams, and odds — so the U20 Rugby World Cup (or Currie
Cup U20s, Six Nations U20s, etc.) works the same way as any other competition. Two things
are genuinely different in practice, though:

- **Odds coverage is thin.** Mainstream odds-data APIs mostly don't carry a dedicated
  sport key for age-grade rugby, and check `/v4/sports` for your provider before assuming
  otherwise — `ODDS_API_SPORT_KEYS` in `.env.example` doesn't include a U20 key because
  none could be verified as reliably supported. Bookmakers that do list U20 markets often
  only have them close to kickoff, and may not offer props at all. `npm run
  ingest-match-odds` / `npm run ingest-props` (manual CSV) are the realistic path here,
  more so than for senior tests.
- **Team naming must disambiguate age grade.** This is the important one: team identity
  in this system is keyed by name alone (`getOrCreateTeam` in `src/db.js`), and Elo
  ratings, attack/defense rates, and player try-shares are all tracked per team name. A
  senior "South Africa" and the U20 "South Africa" are completely different teams with
  completely different squads — if you import both under the same name, their ratings
  and rosters get silently merged into one meaningless team. **Always suffix age-grade
  sides** (e.g. `South Africa U20`) consistently across every CSV you feed in — Elo
  results, try logs, and odds alike. `data/sample-match-odds.csv` shows this convention
  with a fictional South Africa U20 vs New Zealand U20 fixture.

## Data model

SQLite (`better-sqlite3`), file at `DB_PATH` (default `data/rugby-betting-agent.db`,
gitignored). `odds_snapshots` and `fair_values` are append-only history — every ingest/
analyze run adds new rows rather than overwriting, so you can see a match's price and
fair-value history over time, not just the latest snapshot. `value_opportunities` records
every flag ever raised, with the exact price, fair probability, edge, opportunity type
(`book_outlier` vs `model_divergence`), and rationale that triggered it. `players`,
`team_match_tries`, and `player_tries` hold the history that drives the props model.

## Tuning

All thresholds live in `.env` (see `.env.example`): edge/outlier/model-divergence
thresholds, consensus vs. Elo weighting, prop consensus vs. try-model weighting, Kelly
cap, Elo K-factor and home advantage, minimum bookmakers required before a consensus is
trusted (separately for match markets and the thinner prop markets). Tighten
`EDGE_THRESHOLD_PCT` / `OUTLIER_THRESHOLD_PCT` if the daily report is too noisy; loosen
them if it's too quiet during early data collection. `MODEL_DIVERGENCE_THRESHOLD_PCT` is
deliberately a higher bar — it's flagging disagreement with the whole market, not one book.

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

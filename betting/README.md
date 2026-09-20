# Value Board — Premier League props & parlays

A pricing engine and web board that runs Premier League fixtures through a
statistical model, compares the result against a Sportingbet-shaped price board,
and surfaces the selections where the model disagrees with the book.

```bash
npm install
npm run odds:sample     # build the sample price board
npm start               # board at http://localhost:3000/betting
npm run picks           # same thing in the terminal
npm test                # 42 model tests
```

---

## Read this first: where the data comes from

Two limitations, stated plainly, because they decide how much weight the output
can carry.

**1. The prices shipped here are a sample, not live Sportingbet odds.**
Sportingbet has no public odds API, and this build had no network access to
scrape one. `data/odds/sportingbet-2026-09-20.json` is stamped `source:"sample"`
and is *generated* — each line is the model's own probability, deliberately
perturbed to simulate a book holding a different opinion, with a realistic
margin applied. It exercises the whole pipeline honestly, but **every edge shown
against it is illustrative**. The UI and CLI both say so, loudly, until you
import a real board. See *Getting real prices in* below.

**2. Team and player rates are informed priors, not a fitted season sample.**
Per-90 rates, start probabilities and team rates are realistic estimates, not
scraped season-to-date numbers. They are plain per-game rates in flat JSON, so a
real stats table drops straight in. `startProb` is the single highest-value field
to refresh — team news an hour before kick-off moves player props more than any
other input.

The modelling is the durable part. The data is meant to be replaced.

---

## Getting real prices in

Three routes, all landing on the same normalised shape:

**Paste a coupon** — *Import odds* in the UI, or `POST /betting/api/odds/import`.
One line per selection:

```
bou-liv:total_corners:10.5 | over | 1.91
bou-liv:player_shots:salah:2 | over | 2.10
ful-mun:both_cards:1 | yes | 1.44
```

**Point at a feed** — set `ODDS_FEED_URL` (and `ODDS_API_KEY` if needed) and call
`fetchBoard()`. Any endpoint returning `{marketId, selection, odds}` works,
including a paid aggregator or your own scraper.

**Write the file** — drop a board at `data/odds/sportingbet-<date>.json`.

Market ids are stable and derived from the fixture, so they are safe to map
against once.

---

## What gets priced

| Group | Markets |
|---|---|
| Goals | Total goals 1.5–4.5, both teams to score, team totals |
| Corners | Total 8.5–12.5, team totals 3.5–6.5, **both teams 3/4/5+ corners** |
| Cards | Total 2.5–5.5, team totals, **both teams 1+/2+ bookings** |
| Shots | Total shots, total on target, team shots, team on target |
| Player | Shots 1–4+, shots on target 1–3+, **fouls committed 1–3+**, goals, to be booked |

Roughly 320 markets per fixture, ~1,280 across a four-game slate.

Player fouls are **fouls committed**, not fouls suffered — that is the market
being priced, and the distinction drives which players surface (holding
midfielders and full-backs, not the forwards who get kicked).

---

## How the model works

**Goals — Dixon-Coles bivariate Poisson.** Independent Poisson misprices 0-0,
1-0 and 1-1; the low-score correction fixes exactly those cells, which is where
under-2.5 and BTTS value lives.

**Counts — negative binomial, not Poisson.** Corners, cards and shots are
over-dispersed: variance exceeds the mean. Pricing them as Poisson
systematically under-prices the overs. Parameterised as `Var = μ + φμ²` because
φ is what you can calibrate from published mean/variance.

**"Both teams X+" — a real joint distribution.** This is the line worth getting
right. Both sides share a latent game-state factor — an open, stretched game
gives both teams corners; a strict referee books both sides — so the two counts
are *correlated*. The model gives each match a shared Gamma frailty `Z`:

```
H | Z ~ NB(μ_H·Z, φ_resid)     A | Z ~ NB(μ_A·Z, φ_resid)
```

Conditional on `Z` the sides are independent, so the joint is a quadrature over
`Z`. Integrating `Z` back out leaves each marginal as exactly `NB(μ, φ_total)` —
the distribution calibrated to real data — while inducing genuine correlation.
Pricing these as `P(H≥x) · P(A≥x)` assumes independence and under-prices them.
Every "both teams" line on the board reports what independence *would* have said,
so the difference is visible.

**Player props — a mixture over minutes, not a point estimate.** A 0.7-to-start
forward has a real 30% chance of contributing nothing, and that mass at zero is
what makes "over 0.5 shots on target" cheaper than `rate × minutes` implies.
Each player is a weighted mixture over start/subbed/cameo/unused scenarios.

**Bookings — derived from fouls, not quoted directly.** Each foul carries a
per-foul card hazard scaled by referee strictness and the player's own
recklessness, plus a small base rate for non-foul bookings:

```
P(booked) = 1 − (1 − base) · E[(1 − q)^F]
```

The expectation runs over the whole foul distribution, not its mean — the
players who get booked are the ones having a bad day.

**Fair prices — margin removed before any comparison.** Skipping this makes
almost everything look like value. Three methods: proportional, power, and Shin.
Power is the default on wide markets (player props run 13–16% overround) because
it puts proportionally more of the margin on longshots, matching how books
actually price. Tight main lines use proportional.

**Picks must clear two bars.** Edge is measured against the de-vigged *fair*
price, but you are paid at the *offered* price. A selection can beat the fair
price and still lose money once the margin is handed over, so a pick needs
positive edge **and** positive EV. On the sample board that filter removes about
three quarters of the positive-edge selections.

**Staking — quarter Kelly.** `f* = (p·o − 1)/(o − 1)`, scaled by 0.25.

---

## Parlays

Cross-match and same-game are genuinely different products, and the tool treats
them differently.

**Accumulator (one leg per match).** Different matches are independent, so the
true probability *is* the product and multiplying the odds *is* correct. These
get a real expected value.

**Same-game.** Nothing here is independent. Legs run through a Gaussian copula
with a correlation matrix built from market families, direction, and — critically
— player identity. "Shots" and "shots on target" correlate at 0.72 for the *same*
player and about 0.11 for two different players; conflating those inflates
same-game probabilities enormously.

**Same-game slips deliberately do not show an expected value.** The book prices
the correlation in, so it will never pay the product of the legs, and quoting EV
against a price nobody offers is fiction. Instead the slip reports the
**break-even price** — the shortest odds at which it is still worth taking. Enter
the real price the book offers and a true EV appears.

Searching thousands of combinations by simulation would be too slow, so the
search ranks candidates with an analytic pairwise approximation (exact for two
legs, within ~0.1% on realistic slips) and re-prices the finalists by Monte
Carlo with a fixed seed.

---

## Layout

```
betting/
├── data/            league baselines, teams, players, referees, fixtures, odds/
├── src/
│   ├── lib/stats.js       distributions, frailty quadrature, copula helpers
│   ├── model/             goals (Dixon-Coles), counts (joint), players, markets
│   ├── pricing/           devig, edge/Kelly, parlay optimiser
│   ├── adapters/          Sportingbet board: file, paste, HTTP
│   ├── engine.js          slate assembly
│   └── cli.js
├── public/          dashboard
├── test/run.js      42 tests
└── routes.js        mounted at /betting
```

## API

| Endpoint | Purpose |
|---|---|
| `GET /betting/api/picks` | Fixtures, expectations and ranked picks |
| `GET /betting/api/slate` | Same, plus the full market tree |
| `POST /betting/api/parlay` | Price a slip (correlation-adjusted) |
| `POST /betting/api/parlay/auto` | Build best accumulator / same-game slip |
| `POST /betting/api/odds/import` | Import a real board |

## CLI

```bash
npm run picks -- --min-edge=5 --category="Player props" --top=30
npm run picks -- --match=ful-mun --bankroll=250
```

---

## Worth knowing before you stake

- Correlation values are judgement-calibrated, not fitted. They are the most
  valuable thing to replace with numbers from real match data.
- Fill in the referee in `data/fixtures.json`. It is `null` by default, which
  means league-average, and it moves every card and foul market.
- Refresh `startProb` when line-ups are confirmed.
- Model output, not advice. 18+ · [begambleaware.org](https://www.begambleaware.org)

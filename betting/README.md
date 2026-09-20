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

**2. Squad data is gated, and gated shut by default.**
Player markets are only as good as the roster behind them, and a confident pick
on a player who has left the club is worse than no pick at all. Each player
carries a `verifiedAt` date; the engine compares it against the last transfer
window close and, if the squad has not been confirmed since, **player markets
are priced but withheld from every recommendation** and the warning is rendered
in red. Team and match markets are unaffected.

```bash
node betting/scripts/import-squad.js --status          # what is gated and why
node betting/scripts/import-squad.js liverpool roster.txt
node betting/scripts/import-squad.js --verify          # lift the gate
```

This gate exists because of a real failure: the model priced and recommended
props for players who had moved on in the previous window, and nothing in the
pipeline objected, because every layer downstream assumes the roster is right.
`_knownGaps` in `players.json` records arrivals known to be missing — they are
deliberately *not* invented, since fabricating per-90 numbers for a new signing
swaps one class of error for another.

**3. FotMob integration is built, but must run where FotMob is reachable.**
`src/adapters/fotmob.js` maps FotMob's API into this model's schema: squads,
season stats converted to per-90 rates, functional roles inferred from position
*and* output, confirmed line-ups and referee appointments. Run it from a machine
with open egress:

```bash
node betting/scripts/fetch-fotmob.js --probe            # is it reachable?
node betting/scripts/fetch-fotmob.js --date=2026-09-20 --lineups
node betting/scripts/fetch-fotmob.js --from-file=saved.json --team=liverpool
```

The mappers are **pure functions**, deliberately separated from the transport,
so the offline path produces identical output: open FotMob in a browser,
devtools → Network → the `/api/` request → Copy Response, save it, and feed it
in with `--from-file`. That path is covered by tests against realistic payload
shapes, including the grouped/flat stat containers and the formation-grid
nesting for starters.

Three details worth knowing:

- **A thin minutes sample is rejected, not extrapolated.** Under 270 minutes the
  adapter returns no rates and lets the role archetype supply the baseline. Two
  goals in 95 minutes is not a 1.9-per-90 striker.
- **Roles come from output, not just position.** A right winger taking 3.1 shots
  per 90 is an inside forward; one putting in 3.4 crosses is a traditional
  winger. Position alone cannot separate them, and the difference is a factor of
  two in shots.
- **Card proneness is measured, not guessed** — yellows per foul against the
  league norm, damped and bounded so a small sample cannot produce a 2× multiplier.

FotMob publishes no documented API and its shapes change without notice, so
every mapper probes several candidate paths and throws an error naming the keys
it *did* see rather than returning empty data. Silent empties are how a squad
ends up half-populated and the model starts pricing a phantom bench. Check
FotMob's terms before pointing an automated fetch at them; the `--from-file`
path exists partly for that reason.

**4. Team and player rates are informed priors, not a fitted season sample.**
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
| Player · attacking | Shots 1–4+, shots on target 1–3+, goals, assists, chances created, box touches, attacking-third touches, offsides |
| Player · carrying | Dribbles attempted, successful dribbles, crosses, times dispossessed, **fouls won** |
| Player · duels | **Fouls committed 1–3+**, to be booked, to be sent off, aerial duels won |
| Player · defending | Tackles, tackles won, interceptions, clearances, defensive actions, goalkeeper saves |
| Player · possession | Touches, passes attempted, passes completed, progressive passes |

Roughly 1,380 markets per fixture, ~5,500 across a four-game slate. Every
market also carries its underlying expectation, so the expected-value view
(expected shots, expected fouls, expected tackles) is available alongside the
1+/2+/3+ probabilities.

Player fouls are **fouls committed**; fouls won is a separate market. The
distinction matters — one surfaces holding midfielders and full-backs, the
other surfaces the ball-carriers who get kicked.

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
Each player is a weighted mixture over start/subbed/cameo/unused scenarios, with
role-aware substitution profiles (centre-backs finish games, pressing forwards
get hooked), shifted earlier by a short turnaround or a game likely settled
early. The model reports P(60+), P(75+), P(90) and the expected substitution
minute, not just expected minutes.

**Functional roles, not raw positions.** Only a handful of stats are known per
player; the other twenty-odd metrics come from a functional role archetype —
inverted winger, holding midfielder, aggressive stopper, wing-back, and sixteen
others. A traditional winger and an inverted winger are both "wide" but differ
by a factor of two in shots and invert in crosses, so position alone predicts
neither. The archetype is scaled by a quality multiplier inferred from the stats
that *are* known, **damped at 50%**: a forward who shoots 25% more than his
archetype is a better forward, but he does not touch the ball 25% more often.
Inference never crosses groups — shooting more says nothing about passing volume
or tackling — because that is how a partially-known player turns into a wholly
fictional one.

**Shots on target is a chain, not a rate.**

```
expected shots  ×  P(on target)   =  expected shots on target
expected SOT    ×  conversion     =  expected goals
```

Each link is then reconciled against the team projection, so the chain holds
together *and* the squad still adds up to the team total.

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

## Team ↔ player: both directions, reconciled

The system runs top-down into the player layer and back up again, and the two
views are made to agree:

```
TOP-DOWN    team expected shots  ×  involvement share  →  player expected shots
BOTTOM-UP   Σ player booking probabilities  →  team cards  →  match cards
```

Run naively these disagree, and a board where the strikers' shot props add up to
more shots than the team total is quietly incoherent. So for every metric that
exists at both levels (shots, SOT, goals, fouls, cards) the model computes both
views, grosses the player aggregate up for squad members not listed, blends
them, and rescales the players onto the blend.

The diagnostics are **reported, not hidden** — squad coverage, the player
aggregate, the team projection, the blend and the scaling factor applied. A
large reconciliation factor is a signal that the player data or the team rating
is wrong, and it is the check most likely to catch a bad input.

Cards are built *last* for this reason: the team card projection is a blend of
the top-down team rating and the sum of individual booking probabilities, which
is the chain that actually generates a card.

## Matchups

A full-back's foul rate is not a property of the full-back alone. Facing a
4.5-dribble winger is a different afternoon from facing a wide playmaker who
keeps the ball moving.

Wide attackers are paired against the opposing defender on the mirrored flank,
central forwards shared across the centre-backs, weighted by expected minutes.
Dribble volume and the pace gap then shade the defender's fouls and tackles, and
the attacker's fouls won and dribble success.

The duel is resolved in **two passes** — defender first, then attacker using the
defender's *adjusted* rate. A foul in a duel is one event seen from two ends: if
the matchup makes the defender foul more, the attacker he is marking must draw
correspondingly more. Using raw season rates on both sides breaks that
conservation.

The dribble-volume reference is position-specific (full-backs face ~2.8 take-ons,
centre-backs ~1.0). A single league-wide reference made every centre-back look
unusually calm and every full-back unusually harassed.

## Game state

`P(trailing)` comes out of the Dixon-Coles score matrix as a chase index. A side
expected to chase shoots and crosses more; a side protecting a lead fouls and
clears more. `P(margin ≥ 3)` feeds the minutes model, because a settled game
means earlier substitutions.

The full chain, as it actually runs:

```
Sunderland 38% possession        →  more time defending
→ centre-backs face City's forwards  →  duel volume up
→ Ballard expected fouls 1.67        →  card probability 24%
→ Sunderland team cards up           →  match total cards up
```

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
│   ├── model/
│   │   ├── goals.js        Dixon-Coles bivariate goals
│   │   ├── counts.js       joint corners/cards/shots via shared frailty
│   │   ├── roles.js        role archetype → complete per-90 profile
│   │   ├── minutes.js      expected minutes, P(60+/75+/90), sub timing
│   │   ├── involvement.js  shares, possession, two-way reconciliation
│   │   ├── matchups.js     positional duels and game state
│   │   ├── squad.js        the projection chain for one team
│   │   ├── playerEvents.js the player market layer
│   │   └── markets.js      fixture assembly
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
| `GET /betting/api/players/:matchId` | Full player projection chain and duel map |
| `POST /betting/api/odds/import` | Import a real board |

## CLI

```bash
npm run picks -- --min-edge=5 --category="Player props" --top=30
npm run picks -- --match=ful-mun --bankroll=250
npm run picks -- --players=mci-sun     # projection chain for one fixture
npm run picks -- --players               # every fixture
npm run picks -- --fair                  # fair prices, no odds board needed
npm run picks -- --fair --required-edge=8
node betting/scripts/themed-parlay.js --legs=4   # themed slip, N legs per game
```

### Themed slips

`themed-parlay.js` builds a slip from a chosen set of market families — both-teams
corners, both-teams cards, player shots on target, player fouls — taking N legs
per fixture, one per theme, never two on the same player, and only on players in
the predicted XI.

Each leg is drawn from a **probability band** rather than simply taking the
strongest: a 90% leg adds almost nothing to a slip but still carries the
bookmaker's margin, and a 25% leg turns the slip into a lottery ticket. Player
legs resting on real per-90 data are preferred over role archetypes and tagged
`[data]` / `[archetype]` so the difference is visible.

Each fixture's slip is priced through the copula and reported as a break-even
price; across fixtures the legs are independent, so combining the per-game slips
multiplies honestly.

### Comparing against a coupon by hand

`--fair` is the mode for when you have Sportingbet open on your phone but no
machine-readable odds. It prints every market with both sides, the model's
probability, and a **TAKE AT** price — the shortest odds worth backing once a
margin of safety is applied. If the coupon pays more than TAKE AT, it is a bet;
if less, pass.

Rows are ranked by `4p(1-p) × dataQuality`, not by how extreme the model's view
is. A 13%-to-hit line is where the model is least reliable and the bookmaker's
margin heaviest, so surfacing those first would be actively unhelpful. Each
market family is also capped, otherwise player shots alone (four lines × two
dozen players) would crowd every other market off the sheet.

---

## Worth knowing before you stake

- Correlation values, role archetype baselines and matchup sensitivities are
  judgement-calibrated, not fitted. They are the most valuable things to replace
  with numbers from real event data.
- Watch the reconciliation factors in the player view. Anything far from 1.00
  means the player data and the team rating disagree, and one of them is wrong.
- **Re-verify squads after every transfer window.** The gate will tell you, but
  it only knows about window dates listed in `src/model/squadStatus.js`.
- Tests deliberately select players by role and property, never by name. A test
  pinned to a named player breaks the moment a roster is refreshed.
- Fill in the referee in `data/fixtures.json`. It is `null` by default, which
  means league-average, and it moves every card and foul market.
- Refresh `startProb` when line-ups are confirmed.
- Model output, not advice. 18+ · [begambleaware.org](https://www.begambleaware.org)

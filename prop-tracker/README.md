# NFL Prop Tracker

A single-page local web app that tracks prop-bet slips against live NFL box
scores. Node + Express serves one static page and proxies ESPN's public JSON
API server-side, so the browser never makes a cross-origin call.

```bash
cd prop-tracker
npm install
npm run inspect     # confirm ESPN's response shape (do this first, see below)
npm start           # http://localhost:3100
```

No API key, no account, nothing to configure.

## Check the shape first

**`npm run inspect` is the step to run before trusting anything else.** ESPN's
summary endpoint doesn't return named stat fields — each category returns
parallel arrays and the athlete rows are positional strings:

```
labels : ["CAR","YDS","AVG","TD","LONG"]
stats  : ["14","65","4.6","0","12"]        <- Derrick Henry, 65 rushing yards
```

So "rushing yards" means *index 1 of the rushing category*, and if ESPN ever
reorders a column the numbers silently become wrong rather than absent. The
inspector dumps a full response to `debug/` and prints every category's
`keys`/`labels`/`text` arrays next to the index each tracked stat resolved to:

```
  category "rushing"  <-- tracked
    keys   : ["rushingAttempts","rushingYards","yardsPerRushAttempt",...]
    labels : ["CAR","YDS","AVG","TD","LONG"]
    sample : Derrick Henry
    stats  : ["14","65","4.6","0","12"]
      rush_yds  -> index 1    label YDS    sample value "65"
```

The parser resolves each column three ways, most reliable first: the semantic
`keys[]` entry (`rushingYards`), then the display `labels[]` entry (`YDS`),
then `text` split on commas. `/api/debug/shape` reports which one won for each
stat on the most recent parse, so a shape change is visible at runtime rather
than being inferred from bad numbers.

> The machine this was built on couldn't reach `site.api.espn.com` (blocked by
> a network egress policy), so the parser was written against ESPN's documented
> response shape and verified against fixtures reproducing it, not against a
> live pull. Run `npm run inspect` once on your own machine to confirm the real
> payload matches before relying on the numbers.

Also available: `npm run demo` runs the whole app against the fixture slate, so
you can see the UI mid-week or off-season without a live game.

## Your slips

Everything lives in **`slips.json`**, re-read on every request — edit it and hit
Refresh, no restart needed.

```json
{ "player": "Derrick Henry", "team": "BAL", "stat": "rush_yds", "line": 80 }
```

| field | meaning |
|---|---|
| `player` | Matched against ESPN's athlete names. Apostrophes, periods, hyphens, accents and Jr./Sr./III are all normalised away, so `Ja'Marr Chase`, `Amon-Ra St. Brown` and `De'Von Achane` match as written. |
| `stat` | One of `pass_yds`, `pass_td`, `rush_yds`, `rec_yds`, `rec`. |
| `line` | The number to reach. A `30+` prop is `"line": 30` and hits at **>= 30**. |
| `team` | Display hint only — it links a leg to its game before kickoff so you get a start time. The real team comes from the box score once the game is live, so a stale hint here can't break matching. |
| `aliases` | Optional extra spellings, if ESPN lists someone unusually. |
| `placeholder` | `true` for a leg you haven't filled in. Never scored; a slip can't read as WON while one is present. |

Add more slips by appending to the `slips` array — the page renders each as its
own card.

## How a leg is scored

| status | meaning |
|---|---|
| **hit** | value >= line. Once hit, it stays hit. |
| **live** | game in progress, still short of the line. Shows how much is left. |
| **miss** | game **final** and short of the line. |
| **not started** | game hasn't kicked off, or the player has no box-score line yet. |

A player who appears in a box score but not in a given category has a genuine
zero for it (a QB with no carries). A player absent from every box score has no
value at all, and is never scored as a miss while his game is unfinished.

A slip is **dead** as soon as any leg misses, **won** when every leg hits, and
**alive** otherwise.

## Refresh and failure behaviour

Polls every 30 seconds (`POLL_MS` to change), plus a manual Refresh button and a
countdown to the next poll. The tab catches up immediately when you return to it
rather than waiting out the timer.

The server keeps the last good response. If a poll fails, the page keeps showing
that data with an amber banner and the timestamp of what you're looking at —
it never blanks out. One game's box score failing doesn't sink the rest of the
slate; those legs just report no line yet.

Completed games are cached permanently (their stats can't change) and games that
haven't kicked off are never requested, so a full slate settles down to one
scoreboard call plus one call per in-progress game.

## Endpoints

| route | purpose |
|---|---|
| `GET /api/state` | Evaluated slips + games. `?date=YYYYMMDD` for another slate. |
| `GET /api/debug/shape` | How each stat column resolved on the last parse. |
| `GET /api/debug/scoreboard` | Raw ESPN scoreboard passthrough. |
| `GET /api/debug/summary/:eventId` | Raw ESPN summary passthrough. |

## Tests

```bash
npm test
```

Boots the server against a stubbed ESPN and checks parsing and scoring
end-to-end: column resolution via both `keys[]` and `labels[]`, a player split
across category blocks merging into one line, the `>=` boundary, final-vs-live
miss logic, players absent from the slate, and that a failed poll serves the
last good data with `stale: true`.

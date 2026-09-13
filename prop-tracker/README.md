# NFL Prop Tracker

A dashboard that tracks your prop bets against live NFL box scores. Type in
your legs, leave it open, and watch the numbers move.

## Start it

**Double-click `start.command`** (macOS/Linux) or **`start.bat`** (Windows).
The dashboard opens in your browser.

That's it — there's nothing to install and no dependencies. It needs Node 18 or
newer, which you can get from [nodejs.org](https://nodejs.org) if you don't have
it; the launcher will tell you if it's missing.

From a terminal, `node server.js` does the same thing.

## Add a bet

Click **"+ Add a betslip"** and type one leg per line, however you'd say it:

```
Josh Allen 35 rush yards
Ja'Marr Chase 80 rec yards
DeVonta Smith 4 catches
Saquon Barkley anytime td
C.J. Stroud over 9.5 rushing yards
```

You can also paste the slip itself, straight off the bookmaker, game and score
lines included:

```
80+ Receiving Yards By The Player - Including Overtime: George Pickens - Yes
New York Giants - Dallas Cowboys
21-3   2nd Quarter 4:51
```

Both work, and they can be mixed in one paste. Whatever you type is read back to
you before you save, so you can see it was understood. Fill in the name, stake,
odds and payout if you want them on the card, then **Save slip**. It starts
tracking on the next refresh, within 30 seconds.

It understands rushing, receiving and passing yards; receptions; passing
touchdowns; and anytime touchdown scorer. If a line is genuinely ambiguous —
`Tony Pollard 50 yards` doesn't say *which* yards — it says so instead of
guessing. **Under** and **No** props are refused rather than inverted.

The **×** on a slip header removes it.

## What you're looking at

Each leg shows the live number against your line, how far there is to go, and
the score and clock of the game it's in.

| | |
|---|---|
| **HIT** | Reached your number. Stays hit. |
| **live** | Game in progress, still short — shows how much is left. |
| **missed** | Game **finished** short of the number. |
| **not started** | Kickoff hasn't happened, or he has no box-score line yet. |

A slip is **dead** the moment any leg misses, **won** when every leg hits, and
**alive** until then. It refreshes every 30 seconds on its own; there's a manual
Refresh button and a countdown to the next one.

If a refresh fails, the page keeps showing the last good numbers with an amber
banner and the time they were from — it never blanks out on you.

## Reference

### The slips that are loaded

Three Sunbet parlays, R100 stake each:

| slip | legs | coupon | placed |
|---|---|---|---|
| Thirteenfold | 13 | 13082243446 | 06 Sep 2026 19:48 |
| Eightfold | 8 | 13106780082 | 12 Sep 2026 18:52 |
| Eighteenfold | 18 | 13106847752 | 12 Sep 2026 19:05 |

Odds and payout are recorded for the Thirteenfold (589.0, R58,899.59). The other
two show "payout not recorded" until you fill in `odds` and `payout`.

### Editing slips by hand

Everything lives in **`slips.json`**, re-read on every request — you can also
edit it directly and hit Refresh, no restart needed.

```json
{ "player": "Derrick Henry", "team": "BAL", "stat": "rush_yds", "line": 80 }
```

| field | meaning |
|---|---|
| `player` | Matched against ESPN's athlete names. Apostrophes, periods, hyphens, accents and Jr./Sr./III are all normalised away, so `Ja'Marr Chase`, `C.J. Stroud`, `Harold Fannin Jr.` and `Amon-Ra St. Brown` match as written. |
| `stat` | One of `pass_yds`, `pass_td`, `rush_yds`, `rush_td`, `rec_yds`, `rec`, `rec_td`, `any_td`. |
| `line` | The number to reach. A `30+` prop is `"line": 30` and hits at **>= 30**. An `Over 9.5` prop is `"line": 9.5`. |
| `label` | Optional display override, for props the "N+ stat" phrasing doesn't fit — `"anytime TD"`, `"over 9.5 rush yds"`. |
| `team` | Display hint only — it links a leg to its game before kickoff so you get a start time. One abbreviation (`"BAL"`), or **both sides of the matchup** (`["MIN","GB"]`) when you know the game but not which side the player is on. The real team comes from the box score once the game is live, so a stale hint here can't break matching. |
| `aliases` | Optional extra spellings, if ESPN lists someone unusually. |
| `placeholder` | `true` for a leg you haven't filled in. Never scored; a slip can't read as WON while one is present. |

Add more slips by appending to the `slips` array — the page renders each as its
own card. The same player can carry two different props on one slip (the
Eighteenfold has Stefon Diggs twice) and legs can repeat across slips.

### Off-season moves and roster resolution

Hand-written `team` hints rot. A player changes teams and the hint quietly
points at the wrong game — which is exactly what happened here: five of these
players moved in the 2026 off-season.

So the app doesn't trust the hints. On startup it pulls ESPN's team list and all
32 rosters, builds a name-to-team index, and caches it for 12 hours. A player's
team is then resolved from three sources, most authoritative first:

1. **the box score** he actually appears in (once his game is live),
2. **ESPN's current roster**,
3. the **hint** in `slips.json`.

When the hint disagrees with the roster, the roster wins and the page says so in
an amber banner naming the player and both teams — so a stale hint is visible
rather than silently misleading. If the roster fetch fails, legs fall back to the
hints and nothing else is affected; live stats never depend on it.

The header shows the index size (`32 players on 20 rosters`) so you can see it
loaded.

The hints in `slips.json` are already corrected for the 2026 moves:

| player | was | now |
|---|---|---|
| Kyler Murray | ARI | MIN |
| Isaiah Likely | BAL | NYG |
| Stefon Diggs | NE | WAS |
| Ja'Kobi Lane | — | BAL (2026 draft, R3 #80) |
| Keenan Allen | LAC | IND |

### Anytime touchdown scorer

`any_td` is derived, not read from a column: it's rushing + receiving + kick
return + punt return touchdowns. A **passing** touchdown belongs to the receiver,
not the thrower, so it's deliberately excluded — use `pass_td` for a "2+ TD
passes" prop. Defensive and fumble-recovery touchdowns aren't counted, which is
a real if unlikely gap for a skill-position player.

### How a leg is scored, exactly

| status | meaning |
|---|---|
| **hit** | value >= line. Once hit, it stays hit. |
| **live** | game in progress, still short of the line. Shows how much is left. |
| **miss** | game **final** and short of the line. |
| **not started** | game hasn't kicked off, or the player has no box-score line yet. |

Zeroes are handled deliberately. A player who appears in a box score but not in a
given category has a genuine zero for it (a QB with no carries). A player absent
from *every* box score has no value yet while his game is unfinished — he is
never scored as a miss on that basis. Once his game is **final**, never having
appeared really does mean zero, whether he was inactive or simply never touched
the ball, and the leg says which it can't distinguish.

A slip is **dead** as soon as any leg misses, **won** when every leg hits, and
**alive** otherwise.

Because the app accepts writes, it listens on **127.0.0.1** by default rather
than every interface. Set `HOST=0.0.0.0` if you deliberately want it reachable
from another device on your network.

### Refresh and failure behaviour

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

### Endpoints

| route | purpose |
|---|---|
| `GET /api/state` | Evaluated slips + games. `?date=YYYYMMDD` for another slate. |
| `GET /api/debug/shape` | How each stat column resolved on the last parse. |
| `GET /api/debug/scoreboard` | Raw ESPN scoreboard passthrough. |
| `POST /api/slips/parse` | Parse pasted betslip text without saving (drives the preview). |
| `POST /api/slips` | Parse pasted text and append it as a slip. |
| `DELETE /api/slips/:id` | Remove a slip. |
| `GET /api/debug/summary/:eventId` | Raw ESPN summary passthrough. |

Roster resolution costs 33 requests once every 12 hours. A poll costs one
scoreboard request plus one per in-progress game.

### Tests

```bash
npm test
```

Boots the server against a stubbed ESPN and checks parsing and scoring
end-to-end: column resolution via both `keys[]` and `labels[]`, a player split
across category blocks merging into one line, the `>=` boundary, a decimal
`Over 9.5` line, anytime-TD derivation, receptions vs yards column separation,
final-vs-live miss logic, matchup-level team hints, players absent from the
slate, the one-scoreboard-plus-live-games request budget, roster resolution
overriding a stale hint, betslip parsing of all three slips verbatim, rejection
of unsupported markets, and that a failed poll serves the last good data with
`stale: true`.


### If the numbers look wrong

ESPN's summary endpoint doesn't return named stat fields — each category returns
parallel arrays, and the athlete rows are positional strings:

```
labels : ["CAR","YDS","AVG","TD","LONG"]
stats  : ["14","65","4.6","0","12"]        <- Derrick Henry, 65 rushing yards
```

So "rushing yards" means *index 1 of the rushing category*. The parser resolves
each column three ways, most reliable first — the semantic `keys[]` entry
(`rushingYards`), then the display `labels[]` entry (`YDS`), then `text` split on
commas — and `/api/debug/shape` reports which one won, so a reshuffle at ESPN's
end shows up as a mismatch rather than as quietly wrong numbers.

`npm run inspect` dumps a full response to `debug/` and prints every category's
arrays next to the index each tracked stat resolved to:

```
  category "rushing"  <-- tracked
    keys   : ["rushingAttempts","rushingYards","yardsPerRushAttempt",...]
    labels : ["CAR","YDS","AVG","TD","LONG"]
    sample : Derrick Henry
    stats  : ["14","65","4.6","0","12"]
      rush_yds  -> index 1    label YDS    sample value "65"
```

Run it if a number ever looks off, and send me the output.

> The machine this was built on couldn't reach `site.api.espn.com` (blocked by a
> network egress policy), so the parser was written against ESPN's documented
> response shape and verified against fixtures reproducing it, not against a live
> pull.

`npm run demo` runs the whole app against a fixture slate, so you can see the UI
mid-week or off-season without a live game.

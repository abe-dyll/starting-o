# NFL Divisional-Round Daily Puzzle — Design (v2)

## Relationship to the original spec

This supersedes the game mechanic, architecture, and API design in
`2026-07-07-nfl-starter-guessing-game-design.md`. That spec's "endless
random team+year, one-shot guess" game and local Express server are
replaced entirely by what's below: a Wordle-style daily puzzle hosted on
Vercel with zero player setup. Four already-built modules carry forward
with only small changes (noted per-module below); everything else in the
original spec (the local server, in-memory round store, live per-request
fetch, and single-shot grading flow) is replaced.

## Summary

Every day, the same puzzle is shown to every visitor: one team, drawn from
that day's deterministically-selected NFL season's four divisional-round
playoff winners (2000–present). The player has 5 rounds to guess that
team's five starting offensive skill players (QB, RB, WR1, WR2, TE), with
progressively more hints revealed each round. Correct guesses lock in
immediately and keep showing their hints. Score is out of 1000, weighted
heavily toward guessing early. A "Share results" button copies a
Wordle-style plain-text summary for texting.

## Goals / Non-goals

- Goal: zero setup for players — visit the URL, play, nothing to install.
- Goal: one shared daily puzzle (same for everyone, changes at local
  midnight... actually server-day boundary — see Puzzle Selection).
- Goal: run entirely on Vercel's free serverless tier — no database, no
  paid external services.
- Non-goal: user accounts, historical puzzle archive/replay, or league/
  friend leaderboards (may be worth revisiting later, out of scope now).
- Non-goal: perfectly official depth-chart accuracy — "starter" is still
  the stat-leader heuristic from the original spec (highest attempts/
  carries/targets that season), now extended to two WR slots.

## Architecture

Static frontend + Vercel serverless functions, no Express, no database:

- **Frontend:** static HTML/CSS/JS in `public/`, served by Vercel's static
  hosting. Vanilla JS, no framework — same choice as the original spec,
  still appropriate at this scope.
- **Backend:** two Vercel Node serverless functions, `api/puzzle.js` (GET)
  and `api/guess.js` (POST). Each is a plain Vercel request handler, not
  wrapped in Express — there's no benefit to the extra layer for two
  routes.
- **Data:** a single static JSON file (`data/puzzles.json`), produced
  ahead of time by a one-time pull script and committed to git. The
  running app never makes an outbound network call — it only reads this
  bundled file plus the current date.
- **State:** none, server-side. A signed token carried by the client
  encodes the player's progress through today's puzzle (see Statelessness
  below). Local development uses `vercel dev`, which runs the same
  serverless functions locally that run in production.

## Data Pipeline (one-time pull script)

`scripts/pull-data.js` — run manually (`npm run pull-data`), not part of
the deployed app. Re-run once a year to add the newest completed season;
existing entries in `data/puzzles.json` are unaffected by a re-run since
each season's divisional-round result never changes.

For each season from 2000 through the most recently *completed* season:

1. Fetch `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv`
   once (covers all seasons in one file). Filter rows where
   `game_type === "DIV"`. For each such row, the winner is whichever of
   `home_team`/`away_team` has the higher score (playoff games cannot
   end in a tie). This yields exactly 4 (season, team) pairs per season.
2. For each winning (season, team) pair, fetch that season's
   `player_stats_{season}.csv` (same source and shape as the original
   spec) and compute starters using the existing aggregation logic
   (`computeTeamStarters`, from the original Task 4), **extended so WR
   returns the top 2 players by summed `targets` instead of the top 1**.
   QB (top `attempts`), RB (top `carries`), and TE (top `targets` among
   TEs) are unchanged.
3. For each of the 5 resulting starters, fetch
   `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv`
   and look up that player's `jersey_number`, `height` (inches, convert
   to `feet'inches"` for display), and `weight`. Join by matching
   `player_stats`'s `player_id` column against `rosters`'s `gsis_id`
   column (both are nflverse's canonical player ID in this ecosystem);
   **the pull script must verify this join actually matches during
   implementation** (spot-check a handful of known players) and fall
   back to matching on normalized full name if `player_id`/`gsis_id`
   don't align for a given row. If a roster row exists for multiple
   weeks in that season, prefer the row whose `week` is closest to (at
   or before) that season's divisional-round game week; otherwise use
   any available row for that player/season.
4. Write `data/puzzles.json`: an array, one entry per (season, team) pair
   (~104 entries total: ~26 seasons × 4 teams), sorted by season then
   team code for stable ordering. Each entry:

```json
{
  "season": 2013,
  "team": "DEN",
  "teamName": "Denver Broncos",
  "slots": {
    "QB": { "name": "Peyton Manning", "jersey": 18, "height": "6'5\"", "weight": 230, "stat": "450 attempts" },
    "RB": { "name": "Knowshon Moreno", "jersey": 27, "height": "5'11\"", "weight": 220, "stat": "241 carries" },
    "WR1": { "name": "Demaryius Thomas", "jersey": 88, "height": "6'3\"", "weight": 229, "stat": "142 targets" },
    "WR2": { "name": "Eric Decker", "jersey": 87, "height": "6'3\"", "weight": 214, "stat": "133 targets" },
    "TE": { "name": "Julius Thomas", "jersey": 80, "height": "6'5\"", "weight": 250, "stat": "110 targets" }
  }
}
```

This file is small (well under 1MB — roughly 100 entries × 5 small
player objects) and is committed to git; no gitignore/setup-step tradeoff
needed.

## Puzzle Selection (deterministic by date)

`pickTodaysPuzzle(puzzles, date)`: compute
`dayIndex = daysSinceEpoch(date) % puzzles.length` using a fixed epoch
(e.g. 2026-01-01), and return `puzzles[dayIndex]`. This cycles through
every (season, team) pair before repeating. The mapping from a given
calendar date to a given puzzle is allowed to shift when `puzzles.json`
grows after an annual refresh — there's no requirement that a specific
past date always maps to the same puzzle forever, only that "today" is
the same for every visitor on a given day. `daysSinceEpoch` uses UTC date
boundaries, so the puzzle changes at UTC midnight for all players
simultaneously.

## Game Mechanic

**Slots (fixed order):** QB, RB, WR1, WR2, TE — exactly 5 per puzzle.

**5 rounds, hints are cumulative** (each round adds one new hint on top
of everything already revealed for that slot; nothing is taken away):

| Round | New hint revealed |
|-------|--------------------|
| 1 | none |
| 2 | jersey number, height/weight, season stat |
| 3 | last name initial |
| 4 | first name initial |
| 5 | full first name (last name stays hidden until guessed correctly) |

**Guess matching:** reuses `isMatch(guess, answer)` from the original
spec's Task 5 (`nameMatch.js`) unchanged — fuzzy match on normalized
name, no rework needed.

**Locking:** once a slot is guessed correctly, it locks in immediately:
no more guessing needed for it, and it continues to display whatever
hints had been revealed for it (jersey/height/weight/stat once shown) so
the board doesn't feel like it loses information.

**Submission:** each round, the client shows one text input per
still-unsolved slot (already-solved slots show their locked-in,
hint-annotated display instead of an input). All inputs for the round
are submitted together in one action — grading happens for the whole
round at once, not per keystroke or per field.

**Game end:** the game ends when either (a) all 5 slots are solved, or
(b) round 5's guesses have been graded — whichever happens first. After
that, no more guessing; the results/share screen shows instead.

## Scoring

Per slot, points are awarded based on the round it was first solved in:

| Round solved | Points |
|---|---|
| 1 | 200 |
| 2 | 100 |
| 3 | 50 |
| 4 | 25 |
| 5 | 10 |
| never | 0 |

Total score = sum across the 5 slots. Maximum possible: 1000 (all 5
solved in round 1).

## API

Two Vercel serverless functions. No server-side storage of any kind —
today's puzzle is derived from the current date server-side on every
request (never trusted from the client), and a player's progress is
carried entirely in a client-held signed token.

### `GET /api/puzzle`

No request body. Server computes today's puzzle via
`pickTodaysPuzzle`. Response:

```json
{
  "team": "DEN",
  "teamName": "Denver Broncos",
  "season": 2013,
  "round": 1,
  "slots": {
    "QB": { "solved": false, "hints": {} },
    "RB": { "solved": false, "hints": {} },
    "WR1": { "solved": false, "hints": {} },
    "WR2": { "solved": false, "hints": {} },
    "TE": { "solved": false, "hints": {} }
  },
  "roundToken": "opaque-signed-string"
}
```

`roundToken` encodes `{ puzzleDayIndex, solved: { QB: null, RB: null,
WR1: null, WR2: null, TE: null }, currentRound: 1 }`, HMAC-signed with a
server-only secret (`ROUND_SECRET` env var). No encryption is needed —
the token only carries the *player's own* progress (which they can
already see on screen), not the answer key, so there's nothing
confidential to hide; the signature exists purely to stop a client from
forging progress (e.g. claiming round-1 success on every slot).

### `POST /api/guess`

Request: `{ "roundToken": "...", "guesses": { "QB": "...", "RB": "..." } }`
(only still-unsolved slots need entries; extra/missing keys are ignored).

Server: verifies the token's signature (reject with `400` if invalid/
tampered) and that its `puzzleDayIndex` matches today's computed puzzle
(reject with `409` — "puzzle has changed" — if not, e.g. a token from a
previous day). Grades each submitted guess with `isMatch` against the
real answer from `data/puzzles.json`. Newly-correct slots get
`solved: currentRound`. `currentRound` advances by 1 regardless of how
many slots were solved this round. Computes the next round's cumulative
hints for any still-unsolved slots.

Response:

```json
{
  "results": {
    "QB": { "correct": true, "name": "Peyton Manning", "pointsAwarded": 200 },
    "RB": { "correct": false, "hints": { "jersey": 27, "height": "5'11\"", "weight": 220, "stat": "241 carries" } }
  },
  "round": 2,
  "score": 200,
  "gameOver": false,
  "roundToken": "new-opaque-signed-string"
}
```

When `gameOver` is `true` (round 5 graded, or all slots solved early),
`results` includes the real name for every slot (including any that were
never solved), and the response omits `roundToken` (nothing further to
submit).

## Frontend

**Persistence across reloads:** the frontend stores `{ roundToken,
renderState }` in `localStorage`. On load, if a stored token exists, the
frontend restores the board from `renderState` instead of calling
`GET /api/puzzle` again (avoiding a wasted round trip); if the frontend
detects the puzzle has changed (see below), it clears storage and starts
fresh.

**Layout — football field, responsive:** the puzzle board is a
football-field-styled panel built with CSS grid (named grid areas,
relative units — no fixed pixel positioning), so the same structural
layout reflows between mobile and desktop without horizontal scrolling:

- Line of scrimmage row: WR1 (wide left) — gap — QB (center) — TE and
  WR2 bunched together on the right side.
- Backfield: RB positioned directly below QB.

Each slot renders either an editable text input (unsolved) or a
locked-in display showing the name plus whatever hints have been
revealed for it (solved).

**Share results:** once `gameOver` is true, a "Share results" button
copies plain text to the clipboard (via `navigator.clipboard.writeText`)
formatted as:

```
[Game Name] — Jul 7
Score: 575/1000
🟢 QB  🟡 RB  🟢 WR1  🟠 WR2  🔴 TE
Play today's puzzle: [site URL]
```

(🟢=200 + 🟡=100 + 🟢=200 + 🟠=50 + 🔴=25 = 575, shown here so the example
is internally consistent with the point table above.)

Circle color maps to the round a slot was solved in: 🟢 round 1, 🟡
round 2, 🟠 round 3, 🔴 round 4, ⚪ round 5, ⚫ never solved. Plain text
(no images) so it pastes cleanly into any text/SMS app.

## Error Handling

- `data/puzzles.json` fails to load or is empty at runtime (shouldn't
  happen since it's bundled, but defensively): `GET /api/puzzle` responds
  `500` with a plain error message; frontend shows a generic "something
  went wrong, try reloading" state.
- Invalid/tampered `roundToken` on `POST /api/guess`: `400`.
- `roundToken` for a stale day (puzzle has since rotated): `409`;
  frontend clears its stored state and re-fetches `GET /api/puzzle`.

## Testing

- Unit tests: `pickTodaysPuzzle` determinism (same date → same puzzle,
  full cycle before repeating); the extended `computeTeamStarters` (top-2
  WR by targets, ties broken consistently); `roundToken` sign/verify
  round-trip and tamper detection (flipped byte → rejected); the guess-
  grading logic (locking, per-slot point values, `currentRound`
  advancement, early game-over when all 5 solved, forced game-over after
  round 5).
- Pull script: unit test the CSV-join logic (schedules → winners,
  player_stats → starters, rosters → bio fields) against small fixture
  CSVs, including the `player_id`/`gsis_id` join-key verification noted
  above.
- Manual end-to-end: run `vercel dev`, play a full puzzle across all 5
  rounds, confirm cumulative hints appear correctly, confirm locked slots
  keep showing their hints, confirm the share text matches the format
  above and pastes correctly, and check the field layout at a narrow
  (mobile) and wide (desktop) viewport for the WR1/QB/TE+WR2/RB
  arrangement with no horizontal scrolling.

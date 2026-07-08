# NFL Starter Guessing Game — Design

> **Superseded.** This design (local Express server, endless random
> team+year, one-shot guesses) was replaced by
> [`2026-07-07-nfl-divisional-daily-puzzle-design.md`](2026-07-07-nfl-divisional-daily-puzzle-design.md)
> before the frontend/final tasks below were built. Kept for history —
> do not implement against this version.

## Summary

A local full-stack web app. Each round, the app picks a random NFL team and
season (2000–present), and the user tries to guess the team's starting
QB, RB, WR, and TE for that season by typing player names. Data comes live
from the public [nflverse](https://github.com/nflverse/nflverse-data)
player stats release (no API key required).

## Goals / Non-goals

- Goal: a fun, replayable quiz with real historical NFL data, scored by
  streak, run locally in a browser.
- Goal: "starter" is derived from real season stat volume, not hand-curated.
- Non-goal: official depth-chart accuracy. The stat-leader heuristic (below)
  is a proxy and will occasionally surface a committee back or a
  midseason QB change winner rather than the "true" Week 1 starter.
- Non-goal: multiplayer, accounts, or persistence beyond the local browser
  (`localStorage`) and in-memory server cache.

## Architecture

Small full-stack app, single process:

- **Backend:** Node.js + Express. Serves the static frontend and a small
  JSON API. Owns all fetching/aggregation of nflverse data and the
  answer key for each round (never sent to the client up front).
- **Frontend:** a single static HTML page + vanilla JS (no framework
  needed for this scope). Calls the backend API via `fetch`.

Rationale: nflverse's data is hosted as GitHub release assets, which do
not send CORS headers (confirmed via direct request during design), so a
purely static/client-only page cannot fetch it directly from a browser.
A tiny backend sidesteps this by fetching server-side.

## Data pipeline (backend)

- Source: `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_{year}.csv`
  — confirmed to exist for every year from 2000 through the present.
- This is **weekly**-granularity data (one row per player per week per
  season). On first request for a given year, fetch and parse the CSV,
  then cache the parsed rows in memory for the life of the server process
  (subsequent rounds for the same year are instant, no refetch).
- Aggregate to season totals per `(player, recent_team)`, filtering to
  `season_type == "REG"` only (regular season, excludes playoffs).
- Relevant columns: `player_display_name`, `position`, `recent_team`,
  `season`, `week`, `season_type`, `attempts` (QB), `carries` (RB),
  `targets` (WR/TE).
- "Starter" per position for a given team-season = the player with the
  highest aggregated stat for that position:
  - QB → most `attempts`
  - RB → most `carries`
  - WR → most `targets`
  - TE → most `targets`
- Team identity (abbreviation + which teams exist) is derived directly
  from whichever `recent_team` values appear in that season's data. This
  naturally handles relocations/renames (e.g. SD→LAC, OAK→LV, STL→LA) and
  expansion (e.g. Texans absent before 2002) without a hardcoded team
  list.
- Valid year range for random selection: 2000 through the most recently
  *completed* NFL regular season (i.e. exclude a season that's still
  in progress).

## Backend API

### `GET /api/round`

Picks a random year in the valid range, fetches/aggregates that year's
data (cached after first use), picks a random team present in that
year's data, computes the QB/RB/WR/TE leaders, stores the answer key
in an in-memory `Map<roundId, answers>`, and returns:

```json
{ "roundId": "uuid", "team": "DEN", "teamName": "Denver Broncos", "year": 2013 }
```

Answers are never included in this response.

### `POST /api/round/:roundId/guess`

Body: `{ "QB": "...", "RB": "...", "WR": "...", "TE": "..." }` (free text,
any subset of positions may be blank).

For each position, normalize both the guess and the real player's
display name (lowercase, strip accents/punctuation, drop suffixes like
Jr./Sr./II/III/IV), then judge a match as correct if either:
- normalized last names match exactly, or
- overall normalized-string similarity (edit-distance ratio) is above a
  fixed threshold (~0.82).

Response:

```json
{
  "score": 3,
  "results": {
    "QB": { "correct": true,  "answer": "Peyton Manning" },
    "RB": { "correct": false, "answer": "Knowshon Moreno" },
    "WR": { "correct": true,  "answer": "Demaryius Thomas" },
    "TE": { "correct": true,  "answer": "Julius Thomas" }
  }
}
```

Rounds are one-shot: after grading, the round is removed from the map.
If `roundId` is unknown/already graded, respond `404`.

## Frontend

Single static page:

- Header: "Guess the starters: `{year} {teamName}`"
- Four labeled text inputs: QB, RB, WR, TE
- "Submit" button → calls the guess endpoint, then reveals per-position
  ✅/❌ with the real answer next to each input.
- Running score and streak (consecutive rounds with 4/4 correct),
  persisted in `localStorage` so they survive a page reload.
- "Next round" button → calls `GET /api/round` again and resets inputs.

## Error handling

- nflverse fetch fails (network error, GitHub outage, unexpected 404 for
  a year believed valid): `GET /api/round` responds `502` with a plain
  error message. Frontend shows "Couldn't load a round — try again" and
  a retry button; no crash, no partial round shown.
- Malformed/missing `roundId` on guess submission: `404`.
- CSV parsing errors (unexpected schema change upstream): logged
  server-side, surfaced to the client as the same generic 502 fetch
  error above.

## Testing

- Backend: unit tests for the aggregation logic (given sample CSV rows,
  correct team-season leader is picked) and the name-matching function
  (handles exact match, punctuation/accent differences, suffixes,
  clearly-wrong names) using a lightweight test runner (e.g. `node:test`,
  no extra dependency needed).
- Manual end-to-end check: run the app, play a few real rounds against
  known historical rosters to sanity-check the "starter" heuristic
  before considering the feature done.

# NFL Starter Guessing Game Implementation Plan

> **Superseded after Task 8.** Tasks 1-8 below were implemented, then
> reworked or removed by
> [`2026-07-07-nfl-divisional-daily-puzzle.md`](2026-07-07-nfl-divisional-daily-puzzle.md)
> (see that plan's Task 1 for exactly what was kept/changed/deleted).
> Tasks 9-10 below were never implemented. Kept for history only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local full-stack app where each round shows a random NFL team+season and the user free-types guesses for the starting QB/RB/WR/TE, graded against real nflverse stat data.

**Architecture:** Node.js + Express backend (serves a static frontend and a small JSON API, owns all data fetching/aggregation and the answer key) plus a single static HTML/vanilla-JS page frontend that talks to the API via `fetch`.

**Tech Stack:** Node.js (>=18, for global `fetch` and `node:test`), Express, `csv-parse`. No frontend framework, no database (in-memory caches/state only).

## Global Constraints

- Data source URL pattern: `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_{year}.csv` (weekly-granularity rows).
- Valid random year range: 2000 through the most recently *completed* NFL regular season (exclude an in-progress season).
- Filter all aggregation to `season_type === "REG"` (regular season only, excludes playoffs).
- Starter heuristic per position, by summed season stat for that team: QB → most `attempts`, RB → most `carries`, WR → most `targets`, TE → most `targets`.
- Team identity/list per season is derived from whatever `recent_team` values appear in that season's fetched data — never a hardcoded team roster list (only abbreviation→full-name display strings are hardcoded).
- `GET /api/round` response shape: `{ roundId, team, teamName, year }` — never includes answers.
- `POST /api/round/:roundId/guess` request body: `{ QB, RB, WR, TE }` (any may be blank); response shape: `{ score, results: { QB: {correct, answer}, RB: {...}, WR: {...}, TE: {...} } }`.
- Rounds are one-shot: grading a round removes it from the in-memory store; regrading an unknown/already-graded `roundId` returns `404`.
- Name matching: normalize (strip accents/punctuation, lowercase, drop suffixes Jr./Sr./II/III/IV), then match if normalized last names are equal, or overall similarity (1 − normalized Levenshtein distance) is ≥ 0.82.
- nflverse fetch failure → backend responds `502` with a plain error message; frontend shows a retry affordance, never a partial/crashed round.
- Frontend persists running score/streak in `localStorage` so it survives page reloads.

---

## File Structure

- `package.json` — dependencies (`express`, `csv-parse`), `start`/`test` scripts, `engines.node >= 18`.
- `server/app.js` — `createApp({ game, roundStore })`: builds the Express app (static file serving + routes). No `listen()` call (testable in isolation).
- `server/index.js` — real entry point: wires concrete dependencies and calls `app.listen()`.
- `server/teams.js` — static `{ [abbreviation]: fullName }` lookup table for display names.
- `server/nflverseClient.js` — `createNflverseClient({ fetchImpl })`: fetches + parses a season's CSV, caches parsed rows per year in memory.
- `server/aggregate.js` — `computeTeamStarters(rows)`: pure function, weekly rows in, `{ [team]: { QB, RB, WR, TE } }` starters out.
- `server/nameMatch.js` — `normalizeName(name)`, `isMatch(guess, answer)`.
- `server/rounds.js` — `createRoundStore({ idGenerator })`: in-memory round answer-key store, `createRound(...)` / `gradeRound(roundId, guesses)`.
- `server/game.js` — `createGame({ nflverseClient, roundStore, teams, now, random })`: orchestrates year/team picking and round creation.
- `public/index.html` — quiz UI markup.
- `public/app.js` — frontend logic (fetch round, submit guesses, render results, score/streak in `localStorage`).
- `public/styles.css` — basic styling.
- `README.md` — install/run instructions.
- Test files live next to their module: `server/app.test.js`, `server/nflverseClient.test.js`, `server/aggregate.test.js`, `server/nameMatch.test.js`, `server/rounds.test.js`, `server/game.test.js`.

---

### Task 1: Project scaffolding + health check

**Files:**
- Create: `package.json`
- Create: `server/app.js`
- Create: `server/index.js`
- Create: `server/app.test.js`
- Create: `README.md`
- Create: `public/index.html` (placeholder)

**Interfaces:**
- Produces: `createApp()` → Express `app` instance, exported from `server/app.js` as `module.exports = { createApp }`. Serves static files from `public/` and exposes `GET /health` → `200 { status: "ok" }`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nfl-starter-guessing-game",
  "version": "1.0.0",
  "private": true,
  "description": "Guess the starting QB/RB/WR/TE for a random NFL team and season.",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Write the failing test for the health check**

Create `server/app.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');

test('GET /health returns ok status', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './app'` (or similar, since `server/app.js` doesn't exist yet).

- [ ] **Step 5: Create `public/index.html` placeholder**

```html
<!doctype html>
<html>
  <head><title>NFL Starter Guessing Game</title></head>
  <body><p>Coming soon.</p></body>
</html>
```

- [ ] **Step 6: Implement `server/app.js`**

```js
const express = require('express');
const path = require('path');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 7: Implement `server/index.js`**

```js
const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`NFL starter guessing game running at http://localhost:${PORT}`);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 1 passing test.

- [ ] **Step 9: Write `README.md`**

```markdown
# NFL Starter Guessing Game

Guess the starting QB, RB, WR, and TE for a random NFL team and season.

## Run

\`\`\`
npm install
npm start
\`\`\`

Then open http://localhost:3000 in a browser.

## Test

\`\`\`
npm test
\`\`\`
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json server/app.js server/app.test.js server/index.js public/index.html README.md
git commit -m "feat: scaffold Express app with health check"
```

---

### Task 2: Team abbreviation lookup table

**Files:**
- Create: `server/teams.js`
- Create: `server/teams.test.js`

**Interfaces:**
- Produces: `module.exports` is a plain object `{ [abbreviation: string]: fullName: string }`, e.g. `teams.DEN === 'Denver Broncos'`. Covers every abbreviation nflverse uses from 2000–present, including relocated/renamed franchises (`SD`, `LAC`, `OAK`, `LV`, `STL`, `LA`, `RAM`, `RAI`, `WAS`, `SL`) — later tasks look up whatever abbreviation appears in the data, so any historical code not covered would render as its raw abbreviation instead of crashing (`teams[code] || code` at the call site in Task 7).

- [ ] **Step 1: Write the failing test**

Create `server/teams.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const teams = require('./teams');

test('maps common and historical team abbreviations to full names', () => {
  assert.equal(teams.DEN, 'Denver Broncos');
  assert.equal(teams.SD, 'San Diego Chargers');
  assert.equal(teams.LAC, 'Los Angeles Chargers');
  assert.equal(teams.OAK, 'Oakland Raiders');
  assert.equal(teams.LV, 'Las Vegas Raiders');
  assert.equal(teams.STL, 'St. Louis Rams');
  assert.equal(teams.LA, 'Los Angeles Rams');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './teams'`.

- [ ] **Step 3: Implement `server/teams.js`**

```js
module.exports = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  JAC: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams',
  STL: 'St. Louis Rams',
  RAM: 'Los Angeles Rams',
  LAC: 'Los Angeles Chargers',
  SD: 'San Diego Chargers',
  LV: 'Las Vegas Raiders',
  OAK: 'Oakland Raiders',
  RAI: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
  WSH: 'Washington Commanders',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 2 passing tests total.

- [ ] **Step 5: Commit**

```bash
git add server/teams.js server/teams.test.js
git commit -m "feat: add team abbreviation to full name lookup"
```

---

### Task 3: nflverse CSV client

**Files:**
- Create: `server/nflverseClient.js`
- Create: `server/nflverseClient.test.js`
- Modify: `package.json` (add `csv-parse` dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createNflverseClient({ fetchImpl } = {})` → `{ fetchSeasonStats(year: number): Promise<WeeklyRow[]> }`, where `WeeklyRow = { playerDisplayName: string, position: string, recentTeam: string, season: number, week: number, seasonType: string, attempts: number, carries: number, targets: number }`. Results are cached in memory per `year` for the life of the client instance. Throws an `Error` if the HTTP response is not `ok`. Later tasks (`game.js`) call `fetchSeasonStats(year)` and pass the resulting rows straight into `computeTeamStarters`.

- [ ] **Step 1: Add `csv-parse` dependency**

Run: `npm install csv-parse`
Expected: `package.json` `dependencies` now includes `csv-parse`, no errors.

- [ ] **Step 2: Write the failing tests**

Create `server/nflverseClient.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNflverseClient } = require('./nflverseClient');

const SAMPLE_CSV = [
  'player_display_name,position,recent_team,season,week,season_type,attempts,carries,targets',
  'Peyton Manning,QB,DEN,2013,1,REG,30,0,0',
  'Peyton Manning,QB,DEN,2013,2,REG,28,0,0',
  'Knowshon Moreno,RB,DEN,2013,1,REG,0,15,3',
].join('\n');

function fakeFetchImpl(responseText, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    text: async () => responseText,
  });
}

test('fetchSeasonStats parses CSV rows into typed objects', async () => {
  const client = createNflverseClient({ fetchImpl: fakeFetchImpl(SAMPLE_CSV) });
  const rows = await client.fetchSeasonStats(2013);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    playerDisplayName: 'Peyton Manning',
    position: 'QB',
    recentTeam: 'DEN',
    season: 2013,
    week: 1,
    seasonType: 'REG',
    attempts: 30,
    carries: 0,
    targets: 0,
  });
});

test('fetchSeasonStats caches results per year (fetchImpl called once)', async () => {
  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fakeFetchImpl(SAMPLE_CSV)(...args);
  };
  const client = createNflverseClient({ fetchImpl: countingFetch });

  await client.fetchSeasonStats(2013);
  await client.fetchSeasonStats(2013);

  assert.equal(callCount, 1);
});

test('fetchSeasonStats throws on a non-ok response', async () => {
  const client = createNflverseClient({ fetchImpl: fakeFetchImpl('', { ok: false, status: 404 }) });

  await assert.rejects(() => client.fetchSeasonStats(1899), /404/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './nflverseClient'`.

- [ ] **Step 4: Implement `server/nflverseClient.js`**

```js
const { parse } = require('csv-parse/sync');

function createNflverseClient({ fetchImpl = fetch } = {}) {
  const cache = new Map();

  async function fetchSeasonStats(year) {
    if (cache.has(year)) {
      return cache.get(year);
    }

    const url = `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${year}.csv`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`nflverse fetch failed for year ${year}: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const records = parse(csvText, { columns: true, skip_empty_lines: true });

    const rows = records.map((record) => ({
      playerDisplayName: record.player_display_name,
      position: record.position,
      recentTeam: record.recent_team,
      season: Number(record.season),
      week: Number(record.week),
      seasonType: record.season_type,
      attempts: Number(record.attempts) || 0,
      carries: Number(record.carries) || 0,
      targets: Number(record.targets) || 0,
    }));

    cache.set(year, rows);
    return rows;
  }

  return { fetchSeasonStats };
}

module.exports = { createNflverseClient };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 5 passing tests total.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/nflverseClient.js server/nflverseClient.test.js
git commit -m "feat: add nflverse season stats client with caching"
```

---

### Task 4: Aggregate weekly rows into team-season starters

**Files:**
- Create: `server/aggregate.js`
- Create: `server/aggregate.test.js`

**Interfaces:**
- Consumes: `WeeklyRow` shape produced by `server/nflverseClient.js` (Task 3).
- Produces: `computeTeamStarters(rows: WeeklyRow[]): Record<string, { QB: {name, value} | null, RB: {name, value} | null, WR: {name, value} | null, TE: {name, value} | null }>`. Pure function, no I/O. Task 7 (`game.js`) calls this directly on the array returned by `fetchSeasonStats`.

- [ ] **Step 1: Write the failing tests**

Create `server/aggregate.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTeamStarters } = require('./aggregate');

test('picks the QB with the most summed attempts per team', () => {
  const rows = [
    { playerDisplayName: 'Peyton Manning', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 30, carries: 0, targets: 0 },
    { playerDisplayName: 'Peyton Manning', position: 'QB', recentTeam: 'DEN', season: 2013, week: 2, seasonType: 'REG', attempts: 28, carries: 0, targets: 0 },
    { playerDisplayName: 'Brock Osweiler', position: 'QB', recentTeam: 'DEN', season: 2013, week: 3, seasonType: 'REG', attempts: 5, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.deepEqual(starters.DEN.QB, { name: 'Peyton Manning', value: 58 });
});

test('picks RB by carries and WR/TE by targets independently per team', () => {
  const rows = [
    { playerDisplayName: 'Knowshon Moreno', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 15, targets: 3 },
    { playerDisplayName: 'Montee Ball', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 5, targets: 1 },
    { playerDisplayName: 'Demaryius Thomas', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 10 },
    { playerDisplayName: 'Julius Thomas', position: 'TE', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 8 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.RB.name, 'Knowshon Moreno');
  assert.equal(starters.DEN.WR.name, 'Demaryius Thomas');
  assert.equal(starters.DEN.TE.name, 'Julius Thomas');
});

test('excludes non-REG rows and keeps teams independent', () => {
  const rows = [
    { playerDisplayName: 'Playoff Only Guy', position: 'QB', recentTeam: 'DEN', season: 2013, week: 20, seasonType: 'POST', attempts: 40, carries: 0, targets: 0 },
    { playerDisplayName: 'Regular Season Guy', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 10, carries: 0, targets: 0 },
    { playerDisplayName: 'Other Team QB', position: 'QB', recentTeam: 'SEA', season: 2013, week: 1, seasonType: 'REG', attempts: 25, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.QB.name, 'Regular Season Guy');
  assert.equal(starters.SEA.QB.name, 'Other Team QB');
});

test('leaves a position null for a team with no qualifying rows', () => {
  const rows = [
    { playerDisplayName: 'Some QB', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 10, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.RB, null);
  assert.equal(starters.DEN.WR, null);
  assert.equal(starters.DEN.TE, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './aggregate'`.

- [ ] **Step 3: Implement `server/aggregate.js`**

```js
const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function statFor(row) {
  if (row.position === 'QB') return row.attempts;
  if (row.position === 'RB') return row.carries;
  return row.targets; // WR, TE
}

function computeTeamStarters(rows) {
  const totals = new Map(); // key: team|position|player -> { name, team, position, value }

  for (const row of rows) {
    if (row.seasonType !== 'REG') continue;
    if (!TRACKED_POSITIONS.includes(row.position)) continue;

    const key = `${row.recentTeam}|${row.position}|${row.playerDisplayName}`;
    const value = statFor(row);
    const existing = totals.get(key);

    if (existing) {
      existing.value += value;
    } else {
      totals.set(key, {
        name: row.playerDisplayName,
        team: row.recentTeam,
        position: row.position,
        value,
      });
    }
  }

  const starters = {};

  for (const total of totals.values()) {
    if (!starters[total.team]) {
      starters[total.team] = { QB: null, RB: null, WR: null, TE: null };
    }
    const current = starters[total.team][total.position];
    if (!current || total.value > current.value) {
      starters[total.team][total.position] = { name: total.name, value: total.value };
    }
  }

  return starters;
}

module.exports = { computeTeamStarters };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 passing tests total.

- [ ] **Step 5: Commit**

```bash
git add server/aggregate.js server/aggregate.test.js
git commit -m "feat: aggregate weekly stats into team-season starters"
```

---

### Task 5: Name normalization and fuzzy matching

**Files:**
- Create: `server/nameMatch.js`
- Create: `server/nameMatch.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `normalizeName(name: string): string` and `isMatch(guess: string, answer: string): boolean`. Task 6 (`rounds.js`) calls `isMatch(guesses[position], answer)` to grade each position.

- [ ] **Step 1: Write the failing tests**

Create `server/nameMatch.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, isMatch } = require('./nameMatch');

test('normalizeName lowercases, strips punctuation/accents, and drops suffixes', () => {
  assert.equal(normalizeName("Ja'Marr Chase"), 'jamarr chase');
  assert.equal(normalizeName('Odell Beckham Jr.'), 'odell beckham');
  assert.equal(normalizeName('Amon-Ra St. Brown'), 'amonra st brown');
});

test('isMatch is true for an exact name', () => {
  assert.equal(isMatch('Peyton Manning', 'Peyton Manning'), true);
});

test('isMatch is true ignoring punctuation and case', () => {
  assert.equal(isMatch('jamarr chase', "Ja'Marr Chase"), true);
});

test('isMatch is true ignoring a Jr./Sr./III suffix', () => {
  assert.equal(isMatch('Odell Beckham', 'Odell Beckham Jr.'), true);
});

test('isMatch is true for a minor typo via similarity threshold', () => {
  assert.equal(isMatch('Patrick Mahomess', 'Patrick Mahomes'), true);
});

test('isMatch is false for a clearly different player', () => {
  assert.equal(isMatch('Tom Brady', 'Aaron Rodgers'), false);
});

test('isMatch is false for a blank guess', () => {
  assert.equal(isMatch('', 'Peyton Manning'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './nameMatch'`.

- [ ] **Step 3: Implement `server/nameMatch.js`**

```js
const SUFFIX_PATTERN = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(SUFFIX_PATTERN, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}

function similarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function lastNameOf(normalized) {
  const parts = normalized.split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
}

const SIMILARITY_THRESHOLD = 0.82;

function isMatch(guess, answer) {
  if (!guess || !answer) return false;

  const normGuess = normalizeName(guess);
  const normAnswer = normalizeName(answer);
  if (!normGuess || !normAnswer) return false;

  const guessLastName = lastNameOf(normGuess);
  const answerLastName = lastNameOf(normAnswer);
  if (guessLastName && guessLastName === answerLastName) return true;

  return similarity(normGuess, normAnswer) >= SIMILARITY_THRESHOLD;
}

module.exports = { normalizeName, isMatch };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 16 passing tests total.

- [ ] **Step 5: Commit**

```bash
git add server/nameMatch.js server/nameMatch.test.js
git commit -m "feat: add name normalization and fuzzy matching"
```

---

### Task 6: Round store (answer key + grading)

**Files:**
- Create: `server/rounds.js`
- Create: `server/rounds.test.js`

**Interfaces:**
- Consumes: `isMatch` from `server/nameMatch.js` (Task 5).
- Produces: `createRoundStore({ idGenerator } = {})` → `{ createRound({ team, teamName, year, starters }): { roundId, team, teamName, year }, gradeRound(roundId, guesses): { score, results } | null }`, where `starters` is the per-team object shape produced by `computeTeamStarters` (Task 4) and `guesses` is `{ QB?, RB?, WR?, TE? }`. Task 7 (`game.js`) calls `createRound`; Task 8 (routes) calls `gradeRound`.

- [ ] **Step 1: Write the failing tests**

Create `server/rounds.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoundStore } = require('./rounds');

const STARTERS = {
  QB: { name: 'Peyton Manning', value: 58 },
  RB: { name: 'Knowshon Moreno', value: 20 },
  WR: { name: 'Demaryius Thomas', value: 10 },
  TE: { name: 'Julius Thomas', value: 8 },
};

function storeWithFixedId(id) {
  return createRoundStore({ idGenerator: () => id });
}

test('createRound returns a round DTO without exposing answers', () => {
  const store = storeWithFixedId('round-1');

  const round = store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  assert.deepEqual(round, { roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 });
});

test('gradeRound scores correct and incorrect guesses and reveals answers', () => {
  const store = storeWithFixedId('round-2');
  store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  const result = store.gradeRound('round-2', {
    QB: 'Peyton Manning',
    RB: 'wrong guy',
    WR: 'Demaryius Thomas',
    TE: '',
  });

  assert.equal(result.score, 2);
  assert.deepEqual(result.results.QB, { correct: true, answer: 'Peyton Manning' });
  assert.deepEqual(result.results.RB, { correct: false, answer: 'Knowshon Moreno' });
  assert.deepEqual(result.results.WR, { correct: true, answer: 'Demaryius Thomas' });
  assert.deepEqual(result.results.TE, { correct: false, answer: 'Julius Thomas' });
});

test('gradeRound is one-shot: a second grade of the same round returns null', () => {
  const store = storeWithFixedId('round-3');
  store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  store.gradeRound('round-3', { QB: 'Peyton Manning', RB: '', WR: '', TE: '' });
  const second = store.gradeRound('round-3', { QB: 'Peyton Manning', RB: '', WR: '', TE: '' });

  assert.equal(second, null);
});

test('gradeRound returns null for an unknown roundId', () => {
  const store = storeWithFixedId('round-4');

  assert.equal(store.gradeRound('does-not-exist', {}), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './rounds'`.

- [ ] **Step 3: Implement `server/rounds.js`**

```js
const crypto = require('crypto');
const { isMatch } = require('./nameMatch');

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function createRoundStore({ idGenerator = () => crypto.randomUUID() } = {}) {
  const rounds = new Map();

  function createRound({ team, teamName, year, starters }) {
    const roundId = idGenerator();
    rounds.set(roundId, { team, teamName, year, starters });
    return { roundId, team, teamName, year };
  }

  function gradeRound(roundId, guesses) {
    const round = rounds.get(roundId);
    if (!round) return null;
    rounds.delete(roundId);

    const results = {};
    let score = 0;

    for (const position of POSITIONS) {
      const starter = round.starters[position];
      const answer = starter ? starter.name : null;
      const correct = Boolean(answer) && isMatch(guesses[position], answer);
      if (correct) score += 1;
      results[position] = { correct, answer };
    }

    return { score, results };
  }

  return { createRound, gradeRound };
}

module.exports = { createRoundStore };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 20 passing tests total.

- [ ] **Step 5: Commit**

```bash
git add server/rounds.js server/rounds.test.js
git commit -m "feat: add in-memory round store with one-shot grading"
```

---

### Task 7: Game orchestration (year/team picking)

**Files:**
- Create: `server/game.js`
- Create: `server/game.test.js`

**Interfaces:**
- Consumes: `fetchSeasonStats` from `server/nflverseClient.js` (Task 3), `computeTeamStarters` from `server/aggregate.js` (Task 4), `teams` lookup from `server/teams.js` (Task 2), `createRound` from `server/rounds.js` (Task 6).
- Produces: `createGame({ nflverseClient, roundStore, teams, now, random }) → { startNewRound(): Promise<{ roundId, team, teamName, year }>, lastCompletedSeason(): number, pickRandomYear(): number }`. Task 8 (routes) calls `game.startNewRound()` inside the `GET /api/round` handler.

- [ ] **Step 1: Write the failing tests**

Create `server/game.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./game');
const { createRoundStore } = require('./rounds');

const ROWS_2013 = [
  { playerDisplayName: 'Peyton Manning', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 30, carries: 0, targets: 0 },
];

function fixedDate(isoString) {
  return () => new Date(isoString);
}

function fixedRandom(value) {
  return () => value;
}

test('lastCompletedSeason returns prior year when current month is March or later', () => {
  const game = createGame({
    nflverseClient: { fetchSeasonStats: async () => [] },
    roundStore: createRoundStore(),
    teams: {},
    now: fixedDate('2026-07-07'),
  });

  assert.equal(game.lastCompletedSeason(), 2025);
});

test('lastCompletedSeason returns two years back when current month is Jan/Feb', () => {
  const game = createGame({
    nflverseClient: { fetchSeasonStats: async () => [] },
    roundStore: createRoundStore(),
    teams: {},
    now: fixedDate('2026-01-15'),
  });

  assert.equal(game.lastCompletedSeason(), 2024);
});

test('pickRandomYear stays within [2000, lastCompletedSeason]', () => {
  const game = createGame({
    nflverseClient: { fetchSeasonStats: async () => [] },
    roundStore: createRoundStore(),
    teams: {},
    now: fixedDate('2026-07-07'),
    random: fixedRandom(0),
  });

  assert.equal(game.pickRandomYear(), 2000);
});

test('startNewRound fetches the picked year, computes starters, and creates a round', async () => {
  const game = createGame({
    nflverseClient: { fetchSeasonStats: async () => ROWS_2013 },
    roundStore: createRoundStore({ idGenerator: () => 'fixed-round-id' }),
    teams: { DEN: 'Denver Broncos' },
    now: fixedDate('2014-03-01'), // lastCompletedSeason = 2013
    random: fixedRandom(0),
  });

  const round = await game.startNewRound();

  assert.equal(round.roundId, 'fixed-round-id');
  assert.equal(round.team, 'DEN');
  assert.equal(round.teamName, 'Denver Broncos');
  assert.equal(typeof round.year, 'number');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './game'`.

- [ ] **Step 3: Implement `server/game.js`**

```js
const { computeTeamStarters } = require('./aggregate');

function createGame({ nflverseClient, roundStore, teams, now = () => new Date(), random = Math.random }) {
  function lastCompletedSeason() {
    const date = now();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    return month >= 3 ? year - 1 : year - 2;
  }

  function pickRandomYear() {
    const min = 2000;
    const max = lastCompletedSeason();
    return min + Math.floor(random() * (max - min + 1));
  }

  function pickRandomTeam(startersByTeam) {
    const teamCodes = Object.keys(startersByTeam);
    const index = Math.floor(random() * teamCodes.length);
    return teamCodes[index];
  }

  async function startNewRound() {
    const year = pickRandomYear();
    const rows = await nflverseClient.fetchSeasonStats(year);
    const startersByTeam = computeTeamStarters(rows);
    const teamCode = pickRandomTeam(startersByTeam);
    const teamName = teams[teamCode] || teamCode;

    return roundStore.createRound({
      team: teamCode,
      teamName,
      year,
      starters: startersByTeam[teamCode],
    });
  }

  return { startNewRound, lastCompletedSeason, pickRandomYear };
}

module.exports = { createGame };
```

- [ ] **Step 4: Run tests to verify they pass**

Note: `startNewRound` calls `random()` twice per round (once for the year, once for the team). The `ROWS_2013` fixture returns the same rows regardless of which year is requested, so a single fixed `random` value drives both picks deterministically.

Run: `npm test`
Expected: PASS — 24 passing tests total.

- [ ] **Step 5: Commit**

```bash
git add server/game.js server/game.test.js
git commit -m "feat: add game orchestration for picking year/team and starting rounds"
```

---

### Task 8: Wire the API routes into the app

**Files:**
- Modify: `server/app.js`
- Modify: `server/index.js`
- Create: `server/app.integration.test.js`

**Interfaces:**
- Consumes: `createGame` (Task 7), `createRoundStore` (Task 6), `createNflverseClient` (Task 3), `teams` (Task 2).
- Produces: `createApp({ game, roundStore })` now also exposes `GET /api/round` and `POST /api/round/:roundId/guess` per the Global Constraints response shapes. This is the last server-side task — `server/index.js` after this wires real dependencies end-to-end.

- [ ] **Step 1: Write the failing integration tests**

Create `server/app.integration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');
const { createRoundStore } = require('./rounds');

function fakeGame(overrides = {}) {
  return {
    startNewRound: async () => ({ roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 }),
    ...overrides,
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('GET /api/round returns a round without answers', async () => {
  const app = createApp({ game: fakeGame(), roundStore: createRoundStore() });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 });
  });
});

test('GET /api/round returns 502 when the game throws', async () => {
  const app = createApp({
    game: fakeGame({ startNewRound: async () => { throw new Error('nflverse down'); } }),
    roundStore: createRoundStore(),
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round`);
    assert.equal(res.status, 502);
  });
});

test('POST /api/round/:roundId/guess grades a known round', async () => {
  const roundStore = createRoundStore({ idGenerator: () => 'round-2' });
  roundStore.createRound({
    team: 'DEN',
    teamName: 'Denver Broncos',
    year: 2013,
    starters: {
      QB: { name: 'Peyton Manning', value: 58 },
      RB: { name: 'Knowshon Moreno', value: 20 },
      WR: { name: 'Demaryius Thomas', value: 10 },
      TE: { name: 'Julius Thomas', value: 8 },
    },
  });
  const app = createApp({ game: fakeGame(), roundStore });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round/round-2/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ QB: 'Peyton Manning', RB: '', WR: '', TE: '' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.score, 1);
    assert.equal(body.results.QB.correct, true);
  });
});

test('POST /api/round/:roundId/guess returns 404 for an unknown round', async () => {
  const app = createApp({ game: fakeGame(), roundStore: createRoundStore() });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round/does-not-exist/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ QB: '', RB: '', WR: '', TE: '' }),
    });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createApp` doesn't accept `{ game, roundStore }` / routes don't exist (404s where 200/502 expected).

- [ ] **Step 3: Modify `server/app.js`**

```js
const express = require('express');
const path = require('path');

function createApp({ game, roundStore } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/round', async (req, res) => {
    try {
      const round = await game.startNewRound();
      res.json(round);
    } catch (err) {
      res.status(502).json({ error: 'Could not load round data. Please try again.' });
    }
  });

  app.post('/api/round/:roundId/guess', (req, res) => {
    const { roundId } = req.params;
    const guesses = req.body || {};
    const result = roundStore.gradeRound(roundId, guesses);

    if (!result) {
      return res.status(404).json({ error: 'Round not found or already graded.' });
    }

    res.json(result);
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Modify `server/index.js`**

```js
const { createApp } = require('./app');
const { createNflverseClient } = require('./nflverseClient');
const { createRoundStore } = require('./rounds');
const { createGame } = require('./game');
const teams = require('./teams');

const nflverseClient = createNflverseClient();
const roundStore = createRoundStore();
const game = createGame({ nflverseClient, roundStore, teams });

const app = createApp({ game, roundStore });
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`NFL starter guessing game running at http://localhost:${PORT}`);
});
```

- [ ] **Step 5: Update `server/app.test.js`'s health check call to pass empty dependencies**

The existing `GET /health` test calls `createApp()` with no arguments. Since `/health` doesn't touch `game`/`roundStore`, this still works unchanged — confirm by running the full suite next.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 28 passing tests total.

- [ ] **Step 7: Commit**

```bash
git add server/app.js server/index.js server/app.integration.test.js
git commit -m "feat: wire round API routes into the Express app"
```

---

### Task 9: Frontend UI

**Files:**
- Modify: `public/index.html`
- Create: `public/app.js`
- Create: `public/styles.css`

**Interfaces:**
- Consumes: `GET /api/round` and `POST /api/round/:roundId/guess` from Task 8, per the Global Constraints response shapes.
- Produces: a working browser UI. No further tasks depend on this one.

- [ ] **Step 1: Replace `public/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>NFL Starter Guessing Game</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="game">
      <h1>Guess the starters</h1>
      <p id="round-heading" class="round-heading">Loading a round…</p>

      <form id="guess-form">
        <label>
          QB
          <input type="text" id="guess-QB" autocomplete="off" />
          <span class="result" id="result-QB"></span>
        </label>
        <label>
          RB
          <input type="text" id="guess-RB" autocomplete="off" />
          <span class="result" id="result-RB"></span>
        </label>
        <label>
          WR
          <input type="text" id="guess-WR" autocomplete="off" />
          <span class="result" id="result-WR"></span>
        </label>
        <label>
          TE
          <input type="text" id="guess-TE" autocomplete="off" />
          <span class="result" id="result-TE"></span>
        </label>
        <button type="submit" id="submit-btn">Submit</button>
      </form>

      <button type="button" id="next-btn" hidden>Next round</button>
      <button type="button" id="retry-btn" hidden>Retry</button>

      <p class="stats">Score: <span id="score-total">0</span>/<span id="score-max">0</span> &middot; Streak: <span id="streak">0</span></p>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/styles.css`**

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 480px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.round-heading {
  font-size: 1.1rem;
  font-weight: bold;
}

form label {
  display: block;
  margin-bottom: 0.75rem;
}

form input {
  display: block;
  width: 100%;
  padding: 0.4rem;
  margin-top: 0.2rem;
  box-sizing: border-box;
}

.result {
  display: inline-block;
  margin-top: 0.2rem;
  font-size: 0.9rem;
}

.result.correct { color: #1a7f37; }
.result.incorrect { color: #b91c1c; }

.stats {
  margin-top: 1.5rem;
  font-weight: bold;
}
```

- [ ] **Step 3: Create `public/app.js`**

```js
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

const roundHeading = document.getElementById('round-heading');
const form = document.getElementById('guess-form');
const nextBtn = document.getElementById('next-btn');
const retryBtn = document.getElementById('retry-btn');
const submitBtn = document.getElementById('submit-btn');
const scoreTotalEl = document.getElementById('score-total');
const scoreMaxEl = document.getElementById('score-max');
const streakEl = document.getElementById('streak');

let currentRoundId = null;

function loadStats() {
  const raw = localStorage.getItem('nfl-guess-stats');
  return raw ? JSON.parse(raw) : { total: 0, max: 0, streak: 0 };
}

function saveStats(stats) {
  localStorage.setItem('nfl-guess-stats', JSON.stringify(stats));
}

function renderStats(stats) {
  scoreTotalEl.textContent = stats.total;
  scoreMaxEl.textContent = stats.max;
  streakEl.textContent = stats.streak;
}

function resetForm() {
  for (const position of POSITIONS) {
    document.getElementById(`guess-${position}`).value = '';
    document.getElementById(`guess-${position}`).disabled = false;
    const resultEl = document.getElementById(`result-${position}`);
    resultEl.textContent = '';
    resultEl.className = 'result';
  }
  submitBtn.hidden = false;
  nextBtn.hidden = true;
}

async function startRound() {
  retryBtn.hidden = true;
  roundHeading.textContent = 'Loading a round…';
  form.hidden = true;

  try {
    const res = await fetch('/api/round');
    if (!res.ok) throw new Error('fetch failed');
    const round = await res.json();

    currentRoundId = round.roundId;
    roundHeading.textContent = `Guess the starters: ${round.year} ${round.teamName}`;
    form.hidden = false;
    resetForm();
  } catch (err) {
    roundHeading.textContent = "Couldn't load a round.";
    retryBtn.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const guesses = {};
  for (const position of POSITIONS) {
    guesses[position] = document.getElementById(`guess-${position}`).value;
  }

  const res = await fetch(`/api/round/${currentRoundId}/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(guesses),
  });

  if (!res.ok) {
    roundHeading.textContent = "Couldn't grade that round.";
    retryBtn.hidden = false;
    return;
  }

  const { score, results } = await res.json();

  for (const position of POSITIONS) {
    const { correct, answer } = results[position];
    const input = document.getElementById(`guess-${position}`);
    const resultEl = document.getElementById(`result-${position}`);
    input.disabled = true;
    resultEl.textContent = correct ? `✅ ${answer}` : `❌ ${answer}`;
    resultEl.className = `result ${correct ? 'correct' : 'incorrect'}`;
  }

  const stats = loadStats();
  stats.total += score;
  stats.max += POSITIONS.length;
  stats.streak = score === POSITIONS.length ? stats.streak + 1 : 0;
  saveStats(stats);
  renderStats(stats);

  submitBtn.hidden = true;
  nextBtn.hidden = false;
});

nextBtn.addEventListener('click', startRound);
retryBtn.addEventListener('click', startRound);

renderStats(loadStats());
startRound();
```

- [ ] **Step 4: Manually verify in a browser**

Run: `npm start`
Open: `http://localhost:3000`
Expected: a round loads showing a team/year heading, four inputs can be filled in and submitted, each shows ✅/❌ with the real answer, "Next round" loads a new round, and the score/streak line updates and survives a page reload.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add frontend UI for the guessing game"
```

---

### Task 10: End-to-end manual verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the fully wired app from Tasks 1–9.
- Produces: confidence that the "starter" heuristic and full flow hold up against real, known historical rosters, per the spec's Testing section.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm test`
Expected: PASS — all tests (28+) green.

- [ ] **Step 2: Start the app and play at least 5 rounds spanning different eras**

Run: `npm start`, open `http://localhost:3000`, and use the browser's dev tools network tab or just note the displayed `{year} {teamName}` for each round.

For each round, before submitting, recall (or look up) that team's actual starting QB/RB/WR/TE for that season and compare to what the app reveals after grading. Specifically try to land on (reload until you hit, or trust random sampling across ~10 rounds) at least one team/year from each bucket:
- A team with a clear, well-known starter at every position (sanity check the heuristic works in the easy case).
- A team involved in a relocation/rename within the 2000–present window (e.g. a season while they were still `SD`/`OAK`/`STL`) — confirm the displayed `teamName` matches the historically correct franchise name for that season, not the modern one.
- A team from a season with a notable in-season QB change or RB committee — confirm the app's pick is defensible as "the player with the most volume," even if it's not the Week 1 starter, and that this matches the documented non-goal in the spec.

Expected: in every case, the revealed answers are real players who actually played that position for that team in that season (spot-checked against your own knowledge), the team name is era-correct, and no round ever shows a JavaScript error in the browser console.

- [ ] **Step 3: Verify the error path**

Temporarily edit `server/nflverseClient.js`'s URL template to an invalid year format (e.g. append `zzz` to the URL) to force a fetch failure, restart the server, reload the page.
Expected: the UI shows "Couldn't load a round." with a visible "Retry" button, not a blank page or console-only error. Revert the temporary edit afterward.

Run: `git diff server/nflverseClient.js`
Expected: no output (confirms the temporary edit was fully reverted before moving on).

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
```

Expected: `nothing to commit, working tree clean` (Tasks 1–9 already committed everything; this step is just confirmation, not a new commit).

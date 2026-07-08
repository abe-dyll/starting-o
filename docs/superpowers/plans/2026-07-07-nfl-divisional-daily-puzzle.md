# NFL Divisional Daily Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-hosted, zero-setup daily puzzle: guess one divisional-round-winning team's 5 starting skill players (QB, RB, WR1, WR2, TE) across 5 progressively-hinted rounds.

**Architecture:** Static frontend (`public/`) + two Vercel serverless functions (`api/puzzle.js`, `api/guess.js`), no Express, no database. A one-time (annually rerun) pull script produces a small static `data/puzzles.json` committed to git. Player progress is carried entirely in an HMAC-signed token the client holds — no server-side state.

**Tech Stack:** Node.js (>=18, for global `fetch` and `node:test`), `csv-parse` (pull script only), Node's built-in `crypto` (token signing). No new runtime dependencies for the deployed app.

## Global Constraints

- Data sources (all free, no API key): `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv` (divisional-round winners: `game_type === "DIV"`, winner = higher of `home_score`/`away_score`); `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_{year}.csv` (season stat leaders, same shape as before); `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{year}.csv` (jersey/height/weight/names, columns include `gsis_id`, `jersey_number`, `height`, `weight`, `full_name`, `first_name`, `last_name`, `team`, `season`, `week`).
- Season range: 2000 through the most recently *completed* season (month >= 3 → year-1, else year-2, same heuristic as before).
- Starter heuristic per team-season: QB → most `attempts`, RB → most `carries`, WR1/WR2 → top 2 by `targets`, TE → most `targets` among TEs. `season_type === "REG"` only.
- Slots, fixed order: `QB`, `RB`, `WR1`, `WR2`, `TE` — exactly 5 per puzzle.
- Hints are cumulative across rounds: R1 none; R2 adds jersey/height/weight/stat; R3 adds last-name initial; R4 adds first-name initial; R5 adds full first name.
- Once a slot is correctly guessed it locks in permanently for that puzzle and keeps showing its revealed hints.
- Scoring per slot by round solved: R1=200, R2=100, R3=50, R4=25, R5=10, never=0. Max total 1000.
- Game ends when all 5 slots are solved OR round 5 has been graded, whichever first.
- `GET /api/puzzle` response: `{ team, teamName, season, round: 1, slots: { <SLOT>: {solved:false, hints:{}} }, roundToken }`.
- `POST /api/guess` request: `{ roundToken, guesses: { <SLOT>: "..." } }`. Response: `{ results, round, score, gameOver, roundToken? }` (`roundToken` omitted when `gameOver`).
- `roundToken` is HMAC-signed (not encrypted — it carries only the player's own progress, not the answer key) using `process.env.ROUND_SECRET`. Invalid/tampered token → `400`. Token's puzzle day doesn't match today → `409`.
- Puzzle selection is deterministic by UTC date: `dayIndex = ((daysSinceEpoch(date) % puzzles.length) + puzzles.length) % puzzles.length` from a fixed epoch, cycling through every puzzle before repeating.
- Share text (plain, clipboard-copyable) format:
  ```
  [Game Name] — Jul 7
  Score: 575/1000
  🟢 QB  🟡 RB  🟢 WR1  🟠 WR2  🔴 TE
  Play today's puzzle: [site URL]
  ```
  Emoji by round solved: 🟢=1, 🟡=2, 🟠=3, 🔴=4, ⚪=5, ⚫=never.
- Layout: line-of-scrimmage row is WR1 (wide left) — QB (center) — TE+WR2 (bunched, right); backfield row is RB directly below QB. Responsive via CSS grid with relative units, no horizontal scrolling.
- Node is installed at `C:\Program Files\nodejs` but is not on PATH by default in Bash tool sessions on this machine — every task needing `node`/`npm` must prefix commands with `export PATH="/c/Program Files/nodejs:$PATH" && `.

---

## File Structure

Reusing modules from the prior plan (`docs/superpowers/plans/2026-07-07-nfl-starter-guessing-game.md`), relocated from `server/` to `lib/` since there's no more Express server:

- `lib/teams.js` — **unchanged**, moved from `server/teams.js`.
- `lib/nameMatch.js` — **unchanged**, moved from `server/nameMatch.js`.
- `lib/aggregate.js` — moved from `server/aggregate.js`, **extended** so `computeTeamStarters` returns `{QB, RB, WR1, WR2, TE}` (WR1/WR2 = top 2 by targets) instead of `{QB, RB, WR, TE}`.

Removed entirely (superseded): `server/app.js`, `server/app.test.js`, `server/app.integration.test.js`, `server/index.js`, `server/rounds.js`, `server/rounds.test.js`, `server/nflverseClient.js`, `server/nflverseClient.test.js`, `server/game.js`, `server/game.test.js`, and the now-empty `server/` directory.

New:

- `lib/hints.js` — `hintsForRound(slot, round)`, `splitName(fullName)`.
- `lib/roundToken.js` — `sign(payload, secret)`, `verify(token, secret)`.
- `lib/puzzleSelector.js` — `daysSinceEpoch(date)`, `pickTodaysPuzzle(puzzles, date)`.
- `lib/grading.js` — `gradeRound({puzzle, tokenState, guesses})`, exports `SLOTS`, `POINTS_BY_ROUND`.
- `lib/puzzleHandler.js` — `buildInitialPuzzleResponse({puzzles, now, secret})`.
- `lib/guessHandler.js` — `buildGuessResponse({puzzles, now, secret, roundToken, guesses})`.
- `scripts/pull-data.js` — one-time (annually rerun) pull+join script; exports `buildPuzzles`, `findDivisionalWinners`, `selectRosterInfo`, `formatHeight`, `statLabel` for testing; runs for real when invoked directly.
- `data/puzzles.json` — committed static output of the pull script.
- `api/puzzle.js` — thin Vercel handler wrapping `lib/puzzleHandler.js`.
- `api/guess.js` — thin Vercel handler wrapping `lib/guessHandler.js`.
- `public/shareText.js` — `formatShareText(...)`, isomorphic (works as a browser `<script>` global and as a Node-`require`-able module for tests).
- `public/index.html`, `public/styles.css`, `public/app.js` — frontend.
- `vercel.json` — `{ "outputDirectory": "public" }`.

---

### Task 1: Relocate reusable modules, remove superseded code

**Files:**
- Move: `server/teams.js` → `lib/teams.js`, `server/teams.test.js` → `lib/teams.test.js`
- Move: `server/nameMatch.js` → `lib/nameMatch.js`, `server/nameMatch.test.js` → `lib/nameMatch.test.js`
- Move: `server/aggregate.js` → `lib/aggregate.js`, `server/aggregate.test.js` → `lib/aggregate.test.js` (content unchanged in this task — extension happens in Task 2)
- Delete: `server/app.js`, `server/app.test.js`, `server/app.integration.test.js`, `server/index.js`, `server/rounds.js`, `server/rounds.test.js`, `server/nflverseClient.js`, `server/nflverseClient.test.js`, `server/game.js`, `server/game.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `lib/teams.js` (unchanged export, a plain `{abbreviation: fullName}` object), `lib/nameMatch.js` (unchanged: `normalizeName(name)`, `isMatch(guess, answer)`), `lib/aggregate.js` (unchanged in this task: `computeTeamStarters(rows)` still returns `{QB, RB, WR, TE}` — Task 2 changes this).

- [ ] **Step 1: Move the three reusable modules and their tests with git mv**

```bash
git mv server/teams.js lib/teams.js
git mv server/teams.test.js lib/teams.test.js
git mv server/nameMatch.js lib/nameMatch.js
git mv server/nameMatch.test.js lib/nameMatch.test.js
git mv server/aggregate.js lib/aggregate.js
git mv server/aggregate.test.js lib/aggregate.test.js
```

- [ ] **Step 2: Delete the superseded Express/live-fetch/in-memory-store files**

```bash
git rm server/app.js server/app.test.js server/app.integration.test.js server/index.js server/rounds.js server/rounds.test.js server/nflverseClient.js server/nflverseClient.test.js server/game.js server/game.test.js
```

- [ ] **Step 3: Confirm the `server/` directory is now empty and remove it**

Run: `ls server/ 2>&1`
Expected: `No such file or directory` (git removes now-empty directories automatically after the moves/removals above — if `server/` still exists and is empty, run `rmdir server`).

- [ ] **Step 4: Update `package.json`: remove the obsolete `start` script**

The current `scripts` block is:

```json
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test"
  },
```

Change it to:

```json
  "scripts": {
    "test": "node --test"
  },
```

(A `dev` script for `vercel dev` is added later in Task 12, once the Vercel-specific files exist.)

- [ ] **Step 5: Run the full test suite to confirm the move didn't break anything**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS — the same tests that passed before (health-check-related tests are gone since `server/app.test.js` was deleted; the `lib/*.test.js` tests should all still pass unchanged since only their file location moved).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: relocate reusable modules to lib/, remove superseded Express/live-fetch/in-memory-store code"
```

---

### Task 2: Extend `lib/aggregate.js` for two WR slots

**Files:**
- Modify: `lib/aggregate.js`
- Modify: `lib/aggregate.test.js`

**Interfaces:**
- Consumes: nothing new (still a pure function over `WeeklyRow[]`, same input shape as before).
- Produces: `computeTeamStarters(rows)` now returns `Record<string, { QB: {name,value}|null, RB: {name,value}|null, WR1: {name,value}|null, WR2: {name,value}|null, TE: {name,value}|null }>` — **note the shape change from `{QB,RB,WR,TE}` to `{QB,RB,WR1,WR2,TE}`**. Task 8 (`scripts/pull-data.js`) is the only later task that calls this function, and it uses the new `WR1`/`WR2` keys directly.

- [ ] **Step 1: Rewrite `lib/aggregate.test.js` for the new shape**

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

test('picks RB by carries, top-2 WR by targets, and TE by targets independently per team', () => {
  const rows = [
    { playerDisplayName: 'Knowshon Moreno', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 15, targets: 3 },
    { playerDisplayName: 'Montee Ball', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 5, targets: 1 },
    { playerDisplayName: 'Demaryius Thomas', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 10 },
    { playerDisplayName: 'Eric Decker', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 8 },
    { playerDisplayName: 'Wes Welker', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 4 },
    { playerDisplayName: 'Julius Thomas', position: 'TE', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 8 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.RB.name, 'Knowshon Moreno');
  assert.equal(starters.DEN.WR1.name, 'Demaryius Thomas');
  assert.equal(starters.DEN.WR2.name, 'Eric Decker');
  assert.equal(starters.DEN.TE.name, 'Julius Thomas');
});

test('WR2 is null when a team has fewer than two qualifying WRs', () => {
  const rows = [
    { playerDisplayName: 'Only WR', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 5 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.WR1.name, 'Only WR');
  assert.equal(starters.DEN.WR2, null);
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
  assert.equal(starters.DEN.WR1, null);
  assert.equal(starters.DEN.WR2, null);
  assert.equal(starters.DEN.TE, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — the top-2-WR and WR2-null tests fail because `computeTeamStarters` doesn't yet produce `WR1`/`WR2` keys (still produces `WR`).

- [ ] **Step 3: Rewrite `lib/aggregate.js`**

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

  const byTeam = new Map(); // team -> { QB: [...], RB: [...], WR: [...], TE: [...] }

  for (const total of totals.values()) {
    if (!byTeam.has(total.team)) {
      byTeam.set(total.team, { QB: [], RB: [], WR: [], TE: [] });
    }
    byTeam.get(total.team)[total.position].push({ name: total.name, value: total.value });
  }

  const sortDesc = (list) => [...list].sort((a, b) => b.value - a.value);
  const starters = {};

  for (const [team, positions] of byTeam.entries()) {
    const qbList = sortDesc(positions.QB);
    const rbList = sortDesc(positions.RB);
    const wrList = sortDesc(positions.WR);
    const teList = sortDesc(positions.TE);

    starters[team] = {
      QB: qbList[0] || null,
      RB: rbList[0] || null,
      WR1: wrList[0] || null,
      WR2: wrList[1] || null,
      TE: teList[0] || null,
    };
  }

  return starters;
}

module.exports = { computeTeamStarters };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/aggregate.js lib/aggregate.test.js
git commit -m "feat: extend aggregate.js to return top-2 WR slots"
```

---

### Task 3: Cumulative hint computation

**Files:**
- Create: `lib/hints.js`
- Create: `lib/hints.test.js`

**Interfaces:**
- Consumes: nothing (pure function over a plain `slot` object `{name, jersey, height, weight, stat}`).
- Produces: `hintsForRound(slot, round)` → a hints object, cumulative per the Global Constraints hint schedule. Also exports `splitName(fullName)` → `{firstName, lastName}`. Task 6 (`lib/grading.js`) and Task 10 (`lib/puzzleHandler.js`) both call `hintsForRound`.

- [ ] **Step 1: Write the failing tests**

Create `lib/hints.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { hintsForRound, splitName } = require('./hints');

const SLOT = { name: 'Peyton Manning', jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' };

test('splitName splits on whitespace, first and last token', () => {
  assert.deepEqual(splitName('Peyton Manning'), { firstName: 'Peyton', lastName: 'Manning' });
});

test('round 1 has no hints', () => {
  assert.deepEqual(hintsForRound(SLOT, 1), {});
});

test('round 2 reveals jersey, height, weight, and stat', () => {
  assert.deepEqual(hintsForRound(SLOT, 2), { jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' });
});

test('round 3 adds last-name initial on top of round 2 hints', () => {
  assert.deepEqual(hintsForRound(SLOT, 3), { jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts', lastInitial: 'M' });
});

test('round 4 adds first-name initial on top of round 3 hints', () => {
  assert.deepEqual(hintsForRound(SLOT, 4), { jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts', lastInitial: 'M', firstInitial: 'P' });
});

test('round 5 adds the full first name on top of round 4 hints', () => {
  assert.deepEqual(hintsForRound(SLOT, 5), { jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts', lastInitial: 'M', firstInitial: 'P', firstName: 'Peyton' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './hints'`.

- [ ] **Step 3: Implement `lib/hints.js`**

```js
function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts[parts.length - 1] || '',
  };
}

function hintsForRound(slot, round) {
  if (round <= 1) return {};

  const hints = {
    jersey: slot.jersey,
    height: slot.height,
    weight: slot.weight,
    stat: slot.stat,
  };
  if (round === 2) return hints;

  const { firstName, lastName } = splitName(slot.name);
  hints.lastInitial = lastName.charAt(0);
  if (round === 3) return hints;

  hints.firstInitial = firstName.charAt(0);
  if (round === 4) return hints;

  hints.firstName = firstName;
  return hints; // round >= 5
}

module.exports = { hintsForRound, splitName };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/hints.js lib/hints.test.js
git commit -m "feat: add cumulative hint computation"
```

---

### Task 4: Signed round-progress token

**Files:**
- Create: `lib/roundToken.js`
- Create: `lib/roundToken.test.js`

**Interfaces:**
- Consumes: nothing (uses Node's built-in `crypto`).
- Produces: `sign(payload, secret)` → opaque string token. `verify(token, secret)` → the original payload object if valid, or `null` if the token is malformed, tampered, or signed with a different secret. Task 10 and Task 11 both call `sign`/`verify`.

- [ ] **Step 1: Write the failing tests**

Create `lib/roundToken.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sign, verify } = require('./roundToken');

const SECRET = 'test-secret';
const PAYLOAD = { dayIndex: 5, solved: { QB: 1, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 2 };

test('sign then verify returns the original payload', () => {
  const token = sign(PAYLOAD, SECRET);
  assert.deepEqual(verify(token, SECRET), PAYLOAD);
});

test('verify rejects a token signed with a different secret', () => {
  const token = sign(PAYLOAD, SECRET);
  assert.equal(verify(token, 'wrong-secret'), null);
});

test('verify rejects a tampered payload', () => {
  const token = sign(PAYLOAD, SECRET);
  const [payloadB64, signature] = token.split('.');
  const tampered = `${payloadB64}x.${signature}`;
  assert.equal(verify(tampered, SECRET), null);
});

test('verify rejects a tampered signature', () => {
  const token = sign(PAYLOAD, SECRET);
  const [payloadB64, signature] = token.split('.');
  const tampered = `${payloadB64}.${signature}x`;
  assert.equal(verify(tampered, SECRET), null);
});

test('verify rejects a malformed token', () => {
  assert.equal(verify('not-a-real-token', SECRET), null);
  assert.equal(verify('', SECRET), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './roundToken'`.

- [ ] **Step 3: Implement `lib/roundToken.js`**

```js
const crypto = require('crypto');

function sign(payload, secret) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verify(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/roundToken.js lib/roundToken.test.js
git commit -m "feat: add HMAC-signed round-progress token"
```

---

### Task 5: Deterministic daily puzzle selection

**Files:**
- Create: `lib/puzzleSelector.js`
- Create: `lib/puzzleSelector.test.js`

**Interfaces:**
- Consumes: nothing (pure function over a plain array and a `Date`).
- Produces: `daysSinceEpoch(date)` → integer. `pickTodaysPuzzle(puzzles, date)` → `{ puzzle, dayIndex }`, throws if `puzzles` is empty. Task 10 and Task 11 both call `pickTodaysPuzzle`.

- [ ] **Step 1: Write the failing tests**

Create `lib/puzzleSelector.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { daysSinceEpoch, pickTodaysPuzzle, EPOCH } = require('./puzzleSelector');

test('daysSinceEpoch returns 0 on the epoch date itself', () => {
  assert.equal(daysSinceEpoch(new Date(EPOCH)), 0);
});

test('daysSinceEpoch returns 1 exactly one UTC day later', () => {
  assert.equal(daysSinceEpoch(new Date(EPOCH + 24 * 60 * 60 * 1000)), 1);
});

test('pickTodaysPuzzle is deterministic for the same date', () => {
  const puzzles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const date = new Date('2026-07-07T15:00:00Z');

  const first = pickTodaysPuzzle(puzzles, date);
  const second = pickTodaysPuzzle(puzzles, date);

  assert.deepEqual(first, second);
});

test('pickTodaysPuzzle cycles through every puzzle before repeating', () => {
  const puzzles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const startDay = daysSinceEpoch(new Date('2026-07-07T00:00:00Z'));

  const seenIds = new Set();
  for (let offset = 0; offset < puzzles.length; offset += 1) {
    const date = new Date(EPOCH + (startDay + offset) * 24 * 60 * 60 * 1000);
    const { puzzle } = pickTodaysPuzzle(puzzles, date);
    seenIds.add(puzzle.id);
  }

  assert.equal(seenIds.size, puzzles.length);
});

test('pickTodaysPuzzle throws on an empty puzzle list', () => {
  assert.throws(() => pickTodaysPuzzle([], new Date()));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './puzzleSelector'`.

- [ ] **Step 3: Implement `lib/puzzleSelector.js`**

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 0, 1); // 2026-01-01 UTC, fixed reference point

function daysSinceEpoch(date) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((utcMidnight - EPOCH) / MS_PER_DAY);
}

function pickTodaysPuzzle(puzzles, date) {
  if (!puzzles || puzzles.length === 0) {
    throw new Error('no puzzles available');
  }

  const dayIndex = ((daysSinceEpoch(date) % puzzles.length) + puzzles.length) % puzzles.length;
  return { puzzle: puzzles[dayIndex], dayIndex };
}

module.exports = { daysSinceEpoch, pickTodaysPuzzle, EPOCH };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/puzzleSelector.js lib/puzzleSelector.test.js
git commit -m "feat: add deterministic daily puzzle selection"
```

---

### Task 6: Round grading logic

**Files:**
- Create: `lib/grading.js`
- Create: `lib/grading.test.js`

**Interfaces:**
- Consumes: `isMatch` from `lib/nameMatch.js` (Task 1), `hintsForRound` from `lib/hints.js` (Task 3).
- Produces: `gradeRound({ puzzle, tokenState, guesses })` → `{ results, round, score, gameOver, newTokenState }`, where `puzzle = { season, team, teamName, slots: { QB: {name,jersey,height,weight,stat}, ... } }`, `tokenState = { dayIndex, solved: {QB: number|null, ...}, currentRound }`, `guesses = { QB?, RB?, WR1?, WR2?, TE? }`. `newTokenState` is `null` when `gameOver` is `true`. Also exports `SLOTS` (`['QB','RB','WR1','WR2','TE']`) and `POINTS_BY_ROUND` (`{1:200,2:100,3:50,4:25,5:10}`). Task 10 and Task 11 (`lib/guessHandler.js`) call `gradeRound` and reuse `SLOTS`.

- [ ] **Step 1: Write the failing tests**

Create `lib/grading.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeRound } = require('./grading');

const PUZZLE = {
  season: 2013,
  team: 'DEN',
  teamName: 'Denver Broncos',
  slots: {
    QB: { name: 'Peyton Manning', jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' },
    RB: { name: 'Knowshon Moreno', jersey: 27, height: "5'11\"", weight: 220, stat: '241 carries' },
    WR1: { name: 'Demaryius Thomas', jersey: 88, height: "6'3\"", weight: 229, stat: '142 targets' },
    WR2: { name: 'Eric Decker', jersey: 87, height: "6'3\"", weight: 214, stat: '133 targets' },
    TE: { name: 'Julius Thomas', jersey: 80, height: "6'5\"", weight: 250, stat: '110 targets' },
  },
};

function freshTokenState(currentRound = 1) {
  return { dayIndex: 3, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound };
}

test('a correct round-1 guess scores 200 and locks the slot', () => {
  const result = gradeRound({
    puzzle: PUZZLE,
    tokenState: freshTokenState(1),
    guesses: { QB: 'Peyton Manning', RB: '', WR1: '', WR2: '', TE: '' },
  });

  assert.deepEqual(result.results.QB, { correct: true, name: 'Peyton Manning', pointsAwarded: 200 });
  assert.equal(result.score, 200);
  assert.equal(result.round, 2);
  assert.equal(result.gameOver, false);
  assert.equal(result.newTokenState.solved.QB, 1);
  assert.equal(result.newTokenState.currentRound, 2);
});

test('an incorrect guess returns hints for the next round instead of the name', () => {
  const result = gradeRound({
    puzzle: PUZZLE,
    tokenState: freshTokenState(1),
    guesses: { QB: 'wrong guy', RB: '', WR1: '', WR2: '', TE: '' },
  });

  assert.equal(result.results.QB.correct, false);
  assert.deepEqual(result.results.QB.hints, { jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' });
});

test('an already-solved slot stays locked and keeps scoring its original round', () => {
  const tokenState = { dayIndex: 3, solved: { QB: 1, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 3 };

  const result = gradeRound({
    puzzle: PUZZLE,
    tokenState,
    guesses: { RB: 'wrong', WR1: '', WR2: '', TE: '' },
  });

  assert.deepEqual(result.results.QB, { correct: true, name: 'Peyton Manning', pointsAwarded: 200 });
  assert.equal(result.score, 200);
});

test('game ends early once all 5 slots are solved, even before round 5', () => {
  const tokenState = { dayIndex: 3, solved: { QB: 1, RB: 1, WR1: 1, WR2: 1, TE: null }, currentRound: 2 };

  const result = gradeRound({
    puzzle: PUZZLE,
    tokenState,
    guesses: { TE: 'Julius Thomas' },
  });

  assert.equal(result.gameOver, true);
  assert.equal(result.newTokenState, null);
  assert.equal(result.score, 200 + 200 + 200 + 200 + 100);
});

test('game ends after round 5 is graded even if slots remain unsolved, revealing real names', () => {
  const tokenState = { dayIndex: 3, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 5 };

  const result = gradeRound({
    puzzle: PUZZLE,
    tokenState,
    guesses: { QB: 'wrong', RB: '', WR1: '', WR2: '', TE: '' },
  });

  assert.equal(result.gameOver, true);
  assert.equal(result.newTokenState, null);
  assert.deepEqual(result.results.RB, { correct: false, name: 'Knowshon Moreno' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './grading'`.

- [ ] **Step 3: Implement `lib/grading.js`**

```js
const { isMatch } = require('./nameMatch');
const { hintsForRound } = require('./hints');

const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const POINTS_BY_ROUND = { 1: 200, 2: 100, 3: 50, 4: 25, 5: 10 };
const LAST_ROUND = 5;

function gradeRound({ puzzle, tokenState, guesses }) {
  const currentRound = tokenState.currentRound;
  const solved = { ...tokenState.solved };
  const results = {};

  for (const slotName of SLOTS) {
    const slotData = puzzle.slots[slotName];
    const alreadySolvedRound = solved[slotName];

    if (alreadySolvedRound) {
      results[slotName] = {
        correct: true,
        name: slotData.name,
        pointsAwarded: POINTS_BY_ROUND[alreadySolvedRound],
      };
      continue;
    }

    const guess = guesses ? guesses[slotName] : undefined;
    const isCorrect = Boolean(guess) && isMatch(guess, slotData.name);

    if (isCorrect) {
      solved[slotName] = currentRound;
      results[slotName] = {
        correct: true,
        name: slotData.name,
        pointsAwarded: POINTS_BY_ROUND[currentRound],
      };
    } else {
      results[slotName] = {
        correct: false,
        hints: hintsForRound(slotData, currentRound + 1),
      };
    }
  }

  const allSolved = SLOTS.every((slotName) => solved[slotName]);
  const gameOver = allSolved || currentRound >= LAST_ROUND;

  const score = SLOTS.reduce((total, slotName) => {
    const solvedRound = solved[slotName];
    return solvedRound ? total + POINTS_BY_ROUND[solvedRound] : total;
  }, 0);

  if (gameOver) {
    for (const slotName of SLOTS) {
      if (!solved[slotName]) {
        results[slotName] = { correct: false, name: puzzle.slots[slotName].name };
      }
    }
  }

  return {
    results,
    round: gameOver ? currentRound : currentRound + 1,
    score,
    gameOver,
    newTokenState: gameOver ? null : { dayIndex: tokenState.dayIndex, solved, currentRound: currentRound + 1 },
  };
}

module.exports = { gradeRound, SLOTS, POINTS_BY_ROUND };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grading.js lib/grading.test.js
git commit -m "feat: add round grading and scoring logic"
```

---

### Task 7: Shareable results text

**Files:**
- Create: `public/shareText.js`
- Create: `public/shareText.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatShareText({ gameName, date, score, slotRounds, url })` → a plain-text string, per the Global Constraints share-text format. `slotRounds` is `{QB: number|null, RB: number|null, WR1: number|null, WR2: number|null, TE: number|null}`. This file is isomorphic: it works as a plain browser `<script>` (declaring a global `formatShareText`) and as a Node module via `require`. Task 13 (frontend `app.js`) calls the global `formatShareText` from the browser.

- [ ] **Step 1: Write the failing tests**

Create `public/shareText.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatShareText } = require('./shareText');

test('formats share text with correct emoji mapping and score, using UTC for the date', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 575,
    slotRounds: { QB: 1, RB: 2, WR1: 1, WR2: 3, TE: 4 },
    url: 'https://example.com',
  });

  assert.equal(
    text,
    "NFL Divisional Starters — Jul 7\nScore: 575/1000\n🟢 QB  🟡 RB  🟢 WR1  🟠 WR2  🔴 TE\nPlay today's puzzle: https://example.com"
  );
});

test('uses the never-solved emoji for a null round', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 200,
    slotRounds: { QB: 1, RB: null, WR1: null, WR2: null, TE: null },
    url: 'https://example.com',
  });

  assert.match(text, /⚫ RB/);
  assert.match(text, /⚫ WR1/);
  assert.match(text, /⚫ WR2/);
  assert.match(text, /⚫ TE/);
});

test('uses the round-5 emoji correctly', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 10,
    slotRounds: { QB: 5, RB: null, WR1: null, WR2: null, TE: null },
    url: 'https://example.com',
  });

  assert.match(text, /⚪ QB/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './shareText'`.

- [ ] **Step 3: Implement `public/shareText.js`**

```js
const EMOJI_BY_ROUND = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴', 5: '⚪' };
const NEVER_SOLVED_EMOJI = '⚫';
const SLOT_ORDER = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const MAX_SCORE = 1000;

function formatShareText({ gameName, date, score, slotRounds, url }) {
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const emojiLine = SLOT_ORDER.map((slot) => {
    const round = slotRounds[slot];
    const emoji = round ? EMOJI_BY_ROUND[round] : NEVER_SOLVED_EMOJI;
    return `${emoji} ${slot}`;
  }).join('  ');

  return [
    `${gameName} — ${dateLabel}`,
    `Score: ${score}/${MAX_SCORE}`,
    emojiLine,
    `Play today's puzzle: ${url}`,
  ].join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatShareText, EMOJI_BY_ROUND, NEVER_SOLVED_EMOJI, SLOT_ORDER, MAX_SCORE };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/shareText.js public/shareText.test.js
git commit -m "feat: add shareable results text formatting"
```

---

### Task 8: Build the one-time pull script

**Files:**
- Create: `scripts/pull-data.js`
- Create: `scripts/pull-data.test.js`

**Interfaces:**
- Consumes: `computeTeamStarters` from `lib/aggregate.js` (Task 2), `normalizeName` from `lib/nameMatch.js` (Task 1), `teams` from `lib/teams.js` (Task 1).
- Produces: `buildPuzzles({ fetchImpl, seasons })` → `Promise<Array<{season, team, teamName, slots}>>` (the exact shape written to `data/puzzles.json`). Also exports `findDivisionalWinners`, `selectRosterInfo`, `formatHeight`, `statLabel` for direct unit testing. When run directly (`node scripts/pull-data.js`), computes the real season range and writes `data/puzzles.json` using the real network `fetch`. Task 9 runs this for real; Task 10 and Task 11 read the `data/puzzles.json` it produces.

- [ ] **Step 1: Write the failing tests**

Create `scripts/pull-data.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPuzzles, findDivisionalWinners, selectRosterInfo, formatHeight, statLabel } = require('./pull-data');

const GAMES_CSV = [
  'season,game_type,week,home_team,home_score,away_team,away_score',
  '2013,DIV,20,DEN,24,SD,17',
  '2013,DIV,20,NE,43,IND,22',
  '2013,WC,18,DEN,0,0,0',
].join('\n');

const PLAYER_STATS_2013_CSV = [
  'player_id,player_display_name,position,recent_team,season,week,season_type,attempts,carries,targets',
  '00-0010346,Peyton Manning,QB,DEN,2013,1,REG,30,0,0',
  '00-0010346,Peyton Manning,QB,DEN,2013,2,REG,28,0,0',
  '00-0027702,Demaryius Thomas,WR,DEN,2013,1,REG,0,0,10',
  '00-0027942,Eric Decker,WR,DEN,2013,1,REG,0,0,8',
  '00-0026189,Knowshon Moreno,RB,DEN,2013,1,REG,0,15,3',
  '00-0028061,Julius Thomas,TE,DEN,2013,1,REG,0,0,7',
].join('\n');

const ROSTER_2013_CSV = [
  'gsis_id,full_name,first_name,last_name,team,season,week,jersey_number,height,weight',
  '00-0010346,Peyton Manning,Peyton,Manning,DEN,2013,19,18,77,230',
  '00-0027702,Demaryius Thomas,Demaryius,Thomas,DEN,2013,19,88,75,229',
  '00-0027942,Eric Decker,Eric,Decker,DEN,2013,19,87,75,214',
  '00-0026189,Knowshon Moreno,Knowshon,Moreno,DEN,2013,19,27,71,220',
  '00-0028061,Julius Thomas,Julius,Thomas,DEN,2013,19,80,77,250',
].join('\n');

function fakeFetchImpl(urlToText) {
  return async (url) => ({
    ok: true,
    status: 200,
    text: async () => urlToText(url),
  });
}

test('findDivisionalWinners picks the higher-scoring team from DIV rows only', () => {
  const records = [
    { season: '2013', game_type: 'DIV', week: '20', home_team: 'DEN', home_score: '24', away_team: 'SD', away_score: '17' },
    { season: '2013', game_type: 'WC', week: '18', home_team: 'DEN', home_score: '0', away_team: 'X', away_score: '0' },
  ];

  const winners = findDivisionalWinners(records);

  assert.deepEqual(winners, [{ season: 2013, team: 'DEN', week: 20 }]);
});

test('formatHeight converts inches to feet/inches display', () => {
  assert.equal(formatHeight(77), "6'5\"");
});

test('statLabel formats per-position stat text', () => {
  assert.equal(statLabel('QB', 450), '450 attempts');
  assert.equal(statLabel('RB', 241), '241 carries');
  assert.equal(statLabel('WR1', 142), '142 targets');
});

test('selectRosterInfo joins by gsis_id/player_id match', () => {
  const rosterRows = [
    { gsisId: '00-0010346', fullName: 'Peyton Manning', team: 'DEN', season: 2013, week: 19, jerseyNumber: '18', height: 77, weight: 230 },
  ];

  const result = selectRosterInfo(rosterRows, { playerId: '00-0010346', playerName: 'Peyton Manning', team: 'DEN', season: 2013, targetWeek: 20 });

  assert.equal(result.jerseyNumber, '18');
});

test('selectRosterInfo falls back to normalized-name match when the ID does not match', () => {
  const rosterRows = [
    { gsisId: 'different-id', fullName: 'Peyton Manning', team: 'DEN', season: 2013, week: 19, jerseyNumber: '18', height: 77, weight: 230 },
  ];

  const result = selectRosterInfo(rosterRows, { playerId: 'no-match', playerName: 'Peyton Manning', team: 'DEN', season: 2013, targetWeek: 20 });

  assert.equal(result.jerseyNumber, '18');
});

test('buildPuzzles joins schedules, stats, and rosters into one puzzle entry per divisional winner', async () => {
  const fetchImpl = fakeFetchImpl((url) => {
    if (url.includes('/schedules/')) return GAMES_CSV;
    if (url.includes('player_stats_2013')) return PLAYER_STATS_2013_CSV;
    if (url.includes('roster_2013')) return ROSTER_2013_CSV;
    throw new Error(`unexpected url in test: ${url}`);
  });

  const puzzles = await buildPuzzles({ fetchImpl, seasons: [2013] });

  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].season, 2013);
  assert.equal(puzzles[0].team, 'DEN');
  assert.equal(puzzles[0].teamName, 'Denver Broncos');
  assert.equal(puzzles[0].slots.QB.name, 'Peyton Manning');
  assert.equal(puzzles[0].slots.QB.jersey, 18);
  assert.equal(puzzles[0].slots.QB.height, "6'5\"");
  assert.equal(puzzles[0].slots.QB.stat, '58 attempts');
  assert.equal(puzzles[0].slots.WR1.name, 'Demaryius Thomas');
  assert.equal(puzzles[0].slots.WR2.name, 'Eric Decker');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './pull-data'`.

- [ ] **Step 3: Implement `scripts/pull-data.js`**

```js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { computeTeamStarters } = require('../lib/aggregate');
const { normalizeName } = require('../lib/nameMatch');
const teams = require('../lib/teams');

const GAMES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const PLAYER_STATS_URL = (year) => `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${year}.csv`;
const ROSTER_URL = (year) => `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`;

async function fetchCsv(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`fetch failed for ${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  return parse(text, { columns: true, skip_empty_lines: true });
}

function findDivisionalWinners(gameRecords) {
  const winners = [];
  for (const row of gameRecords) {
    if (row.game_type !== 'DIV') continue;
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);
    const winningTeam = homeScore > awayScore ? row.home_team : row.away_team;
    winners.push({ season: Number(row.season), team: winningTeam, week: Number(row.week) });
  }
  return winners;
}

function parsePlayerStatsRows(records) {
  return records.map((r) => ({
    playerId: r.player_id,
    playerDisplayName: r.player_display_name,
    position: r.position,
    recentTeam: r.recent_team,
    season: Number(r.season),
    week: Number(r.week),
    seasonType: r.season_type,
    attempts: Number(r.attempts) || 0,
    carries: Number(r.carries) || 0,
    targets: Number(r.targets) || 0,
  }));
}

function parseRosterRows(records) {
  return records.map((r) => ({
    gsisId: r.gsis_id,
    fullName: r.full_name,
    team: r.team,
    season: Number(r.season),
    week: Number(r.week) || 0,
    jerseyNumber: r.jersey_number,
    height: Number(r.height),
    weight: Number(r.weight),
  }));
}

function formatHeight(inches) {
  if (!inches) return null;
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function statLabel(position, value) {
  if (position === 'QB') return `${value} attempts`;
  if (position === 'RB') return `${value} carries`;
  return `${value} targets`; // WR1, WR2, TE
}

function selectRosterInfo(rosterRows, { playerId, playerName, team, season, targetWeek }) {
  const bySeason = rosterRows.filter((r) => r.season === season);
  let candidates = bySeason.filter((r) => r.gsisId === playerId);

  if (candidates.length === 0) {
    const normalizedTarget = normalizeName(playerName);
    candidates = bySeason.filter((r) => r.team === team && normalizeName(r.fullName) === normalizedTarget);
  }

  if (candidates.length === 0) return null;

  const atOrBefore = candidates.filter((r) => r.week <= targetWeek);
  const pool = atOrBefore.length > 0 ? atOrBefore : candidates;

  return pool.reduce((best, row) => (row.week > best.week ? row : best), pool[0]);
}

function attachPlayerId(statsRows, slotStarter, team, position) {
  if (!slotStarter) return null;
  const match = statsRows.find(
    (r) => r.recentTeam === team && r.position === position && r.playerDisplayName === slotStarter.name
  );
  return { ...slotStarter, playerId: match ? match.playerId : null };
}

function buildSlotEntry(starter, position, rosterRows, { team, season, targetWeek }) {
  if (!starter) return null;

  const rosterInfo = selectRosterInfo(rosterRows, {
    playerId: starter.playerId,
    playerName: starter.name,
    team,
    season,
    targetWeek,
  });

  return {
    name: starter.name,
    jersey: rosterInfo ? Number(rosterInfo.jerseyNumber) : null,
    height: rosterInfo ? formatHeight(rosterInfo.height) : null,
    weight: rosterInfo ? rosterInfo.weight : null,
    stat: statLabel(position, starter.value),
  };
}

async function buildPuzzles({ fetchImpl, seasons }) {
  const gameRecords = await fetchCsv(fetchImpl, GAMES_URL);
  const winners = findDivisionalWinners(gameRecords)
    .filter((w) => seasons.includes(w.season))
    .sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));

  const puzzles = [];
  const statsCache = new Map();
  const rosterCache = new Map();

  for (const winner of winners) {
    if (!statsCache.has(winner.season)) {
      const records = await fetchCsv(fetchImpl, PLAYER_STATS_URL(winner.season));
      statsCache.set(winner.season, parsePlayerStatsRows(records));
    }
    if (!rosterCache.has(winner.season)) {
      const records = await fetchCsv(fetchImpl, ROSTER_URL(winner.season));
      rosterCache.set(winner.season, parseRosterRows(records));
    }

    const statsRows = statsCache.get(winner.season);
    const rosterRows = rosterCache.get(winner.season);

    const starters = computeTeamStarters(statsRows)[winner.team];
    if (!starters) continue;

    const withIds = {
      QB: attachPlayerId(statsRows, starters.QB, winner.team, 'QB'),
      RB: attachPlayerId(statsRows, starters.RB, winner.team, 'RB'),
      WR1: attachPlayerId(statsRows, starters.WR1, winner.team, 'WR'),
      WR2: attachPlayerId(statsRows, starters.WR2, winner.team, 'WR'),
      TE: attachPlayerId(statsRows, starters.TE, winner.team, 'TE'),
    };

    const targetWeek = winner.week;
    const slots = {
      QB: buildSlotEntry(withIds.QB, 'QB', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      RB: buildSlotEntry(withIds.RB, 'RB', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      WR1: buildSlotEntry(withIds.WR1, 'WR1', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      WR2: buildSlotEntry(withIds.WR2, 'WR2', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      TE: buildSlotEntry(withIds.TE, 'TE', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
    };

    puzzles.push({
      season: winner.season,
      team: winner.team,
      teamName: teams[winner.team] || winner.team,
      slots,
    });
  }

  return puzzles;
}

module.exports = { buildPuzzles, findDivisionalWinners, selectRosterInfo, formatHeight, statLabel };

if (require.main === module) {
  (async () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const lastCompletedSeason = currentMonth >= 3 ? currentYear - 1 : currentYear - 2;

    const seasons = [];
    for (let year = 2000; year <= lastCompletedSeason; year += 1) {
      seasons.push(year);
    }

    const puzzles = await buildPuzzles({ fetchImpl: fetch, seasons });
    const outputPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(puzzles, null, 2));
    console.log(`Wrote ${puzzles.length} puzzles to ${outputPath}`);
  })();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pull-data.js scripts/pull-data.test.js
git commit -m "feat: add one-time pull script joining schedules, stats, and rosters"
```

---

### Task 9: Run the pull script for real and commit the data

**Files:**
- Create: `data/puzzles.json` (generated, not hand-written)

**Interfaces:**
- Consumes: `scripts/pull-data.js` (Task 8), run against the real nflverse endpoints over the real network.
- Produces: the committed `data/puzzles.json` that Task 10 and Task 11 read at runtime.

- [ ] **Step 1: Run the pull script for real**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node scripts/pull-data.js`
Expected: takes roughly a minute or two (one fetch for `games.csv`, plus one `player_stats` and one `roster` fetch per unique season from 2000 through the most recently completed season — around 50 network calls total). Prints `Wrote N puzzles to .../data/puzzles.json` where N is roughly 4× the number of seasons covered (4 divisional-round winners per season).

- [ ] **Step 2: Spot-check the output against known facts**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && node -e "const p = require('./data/puzzles.json'); const entry = p.find(x => x.season === 2013 && x.team === 'DEN'); console.log(JSON.stringify(entry, null, 2));"`
Expected: an entry showing the 2013 Denver Broncos (who won their divisional-round game that season) with `slots.QB.name` = `"Peyton Manning"` and a plausible jersey number (18), height (`6'5"`), weight (~230), and stat (a large pass-attempts number). If the QB, jersey, or height/weight look wrong or are `null` where they shouldn't be, treat this as a bug in `scripts/pull-data.js` (likely the `player_id`/`gsis_id` join) and report `DONE_WITH_CONCERNS` rather than committing bad data — do not silently proceed.

- [ ] **Step 3: Confirm the file size is reasonable**

Run: `ls -la data/puzzles.json`
Expected: well under 1MB (should be tens to a couple hundred KB).

- [ ] **Step 4: Commit**

```bash
git add data/puzzles.json
git commit -m "data: pull divisional-round-winner starter data (2000-present)"
```

---

### Task 10: Puzzle-start API

**Files:**
- Create: `lib/puzzleHandler.js`
- Create: `lib/puzzleHandler.test.js`
- Create: `api/puzzle.js`

**Interfaces:**
- Consumes: `pickTodaysPuzzle` from `lib/puzzleSelector.js` (Task 5), `hintsForRound` from `lib/hints.js` (Task 3), `sign` from `lib/roundToken.js` (Task 4), the committed `data/puzzles.json` (Task 9).
- Produces: `buildInitialPuzzleResponse({ puzzles, now, secret })` → the `GET /api/puzzle` response body shape from the Global Constraints. `api/puzzle.js` exports a Vercel-compatible `(req, res) => void` handler that wraps it with real dependencies (reads `data/puzzles.json` from disk, uses the real clock, reads `process.env.ROUND_SECRET`).

- [ ] **Step 1: Write the failing tests**

Create `lib/puzzleHandler.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInitialPuzzleResponse } = require('./puzzleHandler');

const PUZZLES = [
  {
    season: 2013,
    team: 'DEN',
    teamName: 'Denver Broncos',
    slots: {
      QB: { name: 'Peyton Manning', jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' },
      RB: { name: 'Knowshon Moreno', jersey: 27, height: "5'11\"", weight: 220, stat: '241 carries' },
      WR1: { name: 'Demaryius Thomas', jersey: 88, height: "6'3\"", weight: 229, stat: '142 targets' },
      WR2: { name: 'Eric Decker', jersey: 87, height: "6'3\"", weight: 214, stat: '133 targets' },
      TE: { name: 'Julius Thomas', jersey: 80, height: "6'5\"", weight: 250, stat: '110 targets' },
    },
  },
];

test('buildInitialPuzzleResponse returns round 1 with no hints and a valid token', () => {
  const response = buildInitialPuzzleResponse({
    puzzles: PUZZLES,
    now: () => new Date('2026-01-01T00:00:00Z'),
    secret: 'test-secret',
  });

  assert.equal(response.team, 'DEN');
  assert.equal(response.teamName, 'Denver Broncos');
  assert.equal(response.season, 2013);
  assert.equal(response.round, 1);
  assert.deepEqual(response.slots.QB, { solved: false, hints: {} });
  assert.equal(typeof response.roundToken, 'string');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './puzzleHandler'`.

- [ ] **Step 3: Implement `lib/puzzleHandler.js`**

```js
const { pickTodaysPuzzle } = require('./puzzleSelector');
const { hintsForRound } = require('./hints');
const { sign } = require('./roundToken');

const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];

function buildInitialPuzzleResponse({ puzzles, now, secret }) {
  const { puzzle, dayIndex } = pickTodaysPuzzle(puzzles, now());

  const slots = {};
  for (const slotName of SLOTS) {
    slots[slotName] = { solved: false, hints: hintsForRound(puzzle.slots[slotName], 1) };
  }

  const roundToken = sign(
    { dayIndex, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 1 },
    secret
  );

  return {
    team: puzzle.team,
    teamName: puzzle.teamName,
    season: puzzle.season,
    round: 1,
    slots,
    roundToken,
  };
}

module.exports = { buildInitialPuzzleResponse };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Implement the thin Vercel wrapper `api/puzzle.js`**

```js
const fs = require('fs');
const path = require('path');
const { buildInitialPuzzleResponse } = require('../lib/puzzleHandler');

module.exports = (req, res) => {
  try {
    const puzzlesPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    const puzzles = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8'));

    const response = buildInitialPuzzleResponse({
      puzzles,
      now: () => new Date(),
      secret: process.env.ROUND_SECRET,
    });

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: "Could not load today's puzzle. Please try again." });
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add lib/puzzleHandler.js lib/puzzleHandler.test.js api/puzzle.js
git commit -m "feat: add GET /api/puzzle handler"
```

---

### Task 11: Guess-grading API

**Files:**
- Create: `lib/guessHandler.js`
- Create: `lib/guessHandler.test.js`
- Create: `api/guess.js`

**Interfaces:**
- Consumes: `verify`/`sign` from `lib/roundToken.js` (Task 4), `gradeRound` from `lib/grading.js` (Task 6), `pickTodaysPuzzle` from `lib/puzzleSelector.js` (Task 5), the committed `data/puzzles.json` (Task 9).
- Produces: `buildGuessResponse({ puzzles, now, secret, roundToken, guesses })` → `{ status, body }` matching the `POST /api/guess` contract (200/400/409) from the Global Constraints. `api/guess.js` exports the Vercel-compatible handler wrapping it with real dependencies.

- [ ] **Step 1: Write the failing tests**

Create `lib/guessHandler.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGuessResponse } = require('./guessHandler');
const { sign } = require('./roundToken');
const { pickTodaysPuzzle } = require('./puzzleSelector');

const SECRET = 'test-secret';
const NOW = () => new Date('2026-01-01T00:00:00Z');

const PUZZLES = [
  {
    season: 2013,
    team: 'DEN',
    teamName: 'Denver Broncos',
    slots: {
      QB: { name: 'Peyton Manning', jersey: 18, height: "6'5\"", weight: 230, stat: '450 attempts' },
      RB: { name: 'Knowshon Moreno', jersey: 27, height: "5'11\"", weight: 220, stat: '241 carries' },
      WR1: { name: 'Demaryius Thomas', jersey: 88, height: "6'3\"", weight: 229, stat: '142 targets' },
      WR2: { name: 'Eric Decker', jersey: 87, height: "6'3\"", weight: 214, stat: '133 targets' },
      TE: { name: 'Julius Thomas', jersey: 80, height: "6'5\"", weight: 250, stat: '110 targets' },
    },
  },
];

function freshToken() {
  const { dayIndex } = pickTodaysPuzzle(PUZZLES, NOW());
  return sign({ dayIndex, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 1 }, SECRET);
}

test('grades a valid round and returns 200 with a new token', () => {
  const { status, body } = buildGuessResponse({
    puzzles: PUZZLES,
    now: NOW,
    secret: SECRET,
    roundToken: freshToken(),
    guesses: { QB: 'Peyton Manning', RB: '', WR1: '', WR2: '', TE: '' },
  });

  assert.equal(status, 200);
  assert.equal(body.results.QB.correct, true);
  assert.equal(body.round, 2);
  assert.equal(typeof body.roundToken, 'string');
});

test('rejects an invalid token with 400', () => {
  const { status, body } = buildGuessResponse({
    puzzles: PUZZLES,
    now: NOW,
    secret: SECRET,
    roundToken: 'not-a-real-token',
    guesses: {},
  });

  assert.equal(status, 400);
  assert.ok(body.error);
});

test('rejects a token for a different day with 409', () => {
  const staleToken = sign({ dayIndex: 999999, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 1 }, SECRET);

  const { status, body } = buildGuessResponse({
    puzzles: PUZZLES,
    now: NOW,
    secret: SECRET,
    roundToken: staleToken,
    guesses: {},
  });

  assert.equal(status, 409);
  assert.ok(body.error);
});

test('omits roundToken from the response when the game is over', () => {
  const { dayIndex } = pickTodaysPuzzle(PUZZLES, NOW());
  const round5Token = sign({ dayIndex, solved: { QB: null, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 5 }, SECRET);

  const { status, body } = buildGuessResponse({
    puzzles: PUZZLES,
    now: NOW,
    secret: SECRET,
    roundToken: round5Token,
    guesses: { QB: 'wrong', RB: '', WR1: '', WR2: '', TE: '' },
  });

  assert.equal(status, 200);
  assert.equal(body.gameOver, true);
  assert.equal(body.roundToken, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: FAIL — `Cannot find module './guessHandler'`.

- [ ] **Step 3: Implement `lib/guessHandler.js`**

```js
const { verify, sign } = require('./roundToken');
const { gradeRound } = require('./grading');
const { pickTodaysPuzzle } = require('./puzzleSelector');

function buildGuessResponse({ puzzles, now, secret, roundToken, guesses }) {
  const tokenState = verify(roundToken, secret);
  if (!tokenState) {
    return { status: 400, body: { error: 'Invalid or tampered round token.' } };
  }

  const { puzzle, dayIndex } = pickTodaysPuzzle(puzzles, now());
  if (tokenState.dayIndex !== dayIndex) {
    return { status: 409, body: { error: "Today's puzzle has changed. Please refresh." } };
  }

  const { results, round, score, gameOver, newTokenState } = gradeRound({ puzzle, tokenState, guesses: guesses || {} });

  const body = { results, round, score, gameOver };
  if (!gameOver) {
    body.roundToken = sign(newTokenState, secret);
  }

  return { status: 200, body };
}

module.exports = { buildGuessResponse };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 5: Implement the thin Vercel wrapper `api/guess.js`**

```js
const fs = require('fs');
const path = require('path');
const { buildGuessResponse } = require('../lib/guessHandler');

module.exports = (req, res) => {
  try {
    const puzzlesPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    const puzzles = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8'));

    const { roundToken, guesses } = req.body || {};

    const { status, body } = buildGuessResponse({
      puzzles,
      now: () => new Date(),
      secret: process.env.ROUND_SECRET,
      roundToken,
      guesses,
    });

    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong grading that round. Please try again.' });
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add lib/guessHandler.js lib/guessHandler.test.js api/guess.js
git commit -m "feat: add POST /api/guess handler"
```

---

### Task 12: Vercel deployment configuration

**Files:**
- Create: `vercel.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: local dev workflow via `vercel dev` and documented deployment/refresh steps. No code interfaces — this task is configuration and documentation.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "outputDirectory": "public"
}
```

- [ ] **Step 2: Add `vercel` as a dev dependency and add `dev`/`pull-data` scripts to `package.json`**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm install --save-dev vercel`
Expected: `vercel` added under `devDependencies`.

Update the `scripts` block to:

```json
  "scripts": {
    "test": "node --test",
    "dev": "vercel dev",
    "pull-data": "node scripts/pull-data.js"
  },
```

- [ ] **Step 3: Update `.gitignore` to exclude the local Vercel CLI cache**

Current `.gitignore`:

```
node_modules/
.claude/
```

Change to:

```
node_modules/
.claude/
.vercel/
```

- [ ] **Step 4: Rewrite `README.md`**

```markdown
# NFL Divisional Daily Puzzle

Guess the 5 starting skill players (QB, RB, WR1, WR2, TE) for one NFL
team that won its divisional-round playoff game — a new team each day,
picked from every divisional-round winner since 2000. 5 rounds, more
hints each round, fewer points the longer it takes.

## Play it

Visit the deployed site — no setup required.

## Develop locally

\`\`\`
npm install
npm run dev
\`\`\`

`npm run dev` runs `vercel dev`, which serves `public/` and the
`api/*.js` serverless functions locally, the same way they run in
production. This requires a one-time `vercel login` and `vercel link`
if you haven't connected this project to Vercel yet.

Set a `ROUND_SECRET` environment variable (any long random string) in
your Vercel project settings (and in a local `.env` file for `vercel
dev`, e.g. `ROUND_SECRET=some-long-random-string`) — it's used to sign
each player's round-progress token.

## Test

\`\`\`
npm test
\`\`\`

## Refresh the puzzle data (once a year, after the divisional round is played)

\`\`\`
npm run pull-data
git add data/puzzles.json
git commit -m "data: refresh divisional-round-winner starter data"
\`\`\`

This re-fetches every season 2000 through the most recently completed
one from nflverse's public data and regenerates `data/puzzles.json`.
Existing seasons' data doesn't change — this just adds the newest one.

## Deploy

Push to the branch connected to your Vercel project (per your existing
GitHub → Vercel setup) — Vercel builds and deploys automatically.
```

- [ ] **Step 5: Run the full test suite once more to confirm nothing broke**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS — all tests from every prior task.

- [ ] **Step 6: Commit**

```bash
git add vercel.json package.json package-lock.json .gitignore README.md
git commit -m "chore: add Vercel deployment config and update docs"
```

---

### Task 13: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

**Interfaces:**
- Consumes: `GET /api/puzzle` and `POST /api/guess` (Tasks 10-11) per their documented response shapes; `formatShareText` global from `public/shareText.js` (Task 7, already loaded via a `<script>` tag before `app.js`).
- Produces: the playable game. No further tasks depend on this one.

- [ ] **Step 1: Create `public/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NFL Divisional Daily Puzzle</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <h1 id="puzzle-heading">Loading today's puzzle…</h1>
      <div id="score-display">Score: 0/1000</div>

      <div class="field">
        <div class="field-row scrimmage">
          <div class="slot" id="slot-WR1">
            <label>WR1</label>
            <div class="slot-content" id="content-WR1"></div>
          </div>
          <div class="slot" id="slot-QB">
            <label>QB</label>
            <div class="slot-content" id="content-QB"></div>
          </div>
          <div class="slot-group">
            <div class="slot" id="slot-TE">
              <label>TE</label>
              <div class="slot-content" id="content-TE"></div>
            </div>
            <div class="slot" id="slot-WR2">
              <label>WR2</label>
              <div class="slot-content" id="content-WR2"></div>
            </div>
          </div>
        </div>
        <div class="field-row backfield">
          <div class="slot" id="slot-RB">
            <label>RB</label>
            <div class="slot-content" id="content-RB"></div>
          </div>
        </div>
      </div>

      <button type="button" id="submit-btn">Submit round</button>

      <div id="share-section" hidden>
        <button type="button" id="share-btn">Share results</button>
        <span id="share-status"></span>
      </div>
    </main>
    <script src="/shareText.js"></script>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/styles.css`**

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 640px;
  margin: 2rem auto;
  padding: 0 1rem;
}

#score-display {
  font-weight: bold;
  margin-bottom: 1rem;
}

.field {
  background: #2d5a27;
  color: white;
  border-radius: 8px;
  padding: 1.5rem 1rem;
  display: grid;
  gap: 1.5rem;
}

.field-row.scrimmage {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: start;
  gap: 0.5rem;
}

.field-row.scrimmage .slot:first-child {
  justify-self: start;
}

.field-row.scrimmage .slot:nth-child(2) {
  justify-self: center;
}

.slot-group {
  justify-self: end;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.field-row.backfield {
  display: flex;
  justify-content: center;
}

.slot {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 0.5rem;
  min-width: 7rem;
  text-align: center;
}

.slot label {
  display: block;
  font-weight: bold;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}

.slot input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem;
}

.hints {
  font-size: 0.75rem;
  margin-top: 0.3rem;
}

.solved {
  font-weight: bold;
}

#submit-btn {
  margin-top: 1.5rem;
  padding: 0.6rem 1.2rem;
}

@media (max-width: 480px) {
  .field-row.scrimmage {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .field-row.scrimmage .slot:first-child,
  .field-row.scrimmage .slot:nth-child(2) {
    justify-self: center;
  }

  .slot-group {
    justify-self: center;
  }

  .slot {
    min-width: 100%;
  }
}
```

- [ ] **Step 3: Create `public/app.js`**

```js
const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const STORAGE_KEY = 'nfl-puzzle-state';

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function loadStoredState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed.fetchedOnUtcDate !== todayUtcDateString()) return null;
  return parsed;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emptySlotStates() {
  const slots = {};
  for (const slot of SLOTS) {
    slots[slot] = { solved: false, name: null, hints: {}, roundSolved: null };
  }
  return slots;
}

let state = null;

async function fetchTodaysPuzzle() {
  const res = await fetch('/api/puzzle');
  if (!res.ok) throw new Error('failed to load puzzle');
  const data = await res.json();

  const slots = emptySlotStates();
  for (const slot of SLOTS) {
    slots[slot].hints = data.slots[slot].hints;
  }

  state = {
    fetchedOnUtcDate: todayUtcDateString(),
    team: data.team,
    teamName: data.teamName,
    season: data.season,
    round: data.round,
    roundToken: data.roundToken,
    slots,
    gameOver: false,
    score: 0,
  };
  saveState(state);
}

function formatHints(hints) {
  const parts = [];
  if (hints.jersey) parts.push(`#${hints.jersey}`);
  if (hints.height && hints.weight) parts.push(`${hints.height}, ${hints.weight}lbs`);
  if (hints.stat) parts.push(hints.stat);
  if (hints.lastInitial) parts.push(`Last initial: ${hints.lastInitial}.`);
  if (hints.firstInitial) parts.push(`First initial: ${hints.firstInitial}.`);
  if (hints.firstName) parts.push(`First name: ${hints.firstName}`);
  return parts.join(' · ');
}

function render() {
  document.getElementById('puzzle-heading').textContent =
    `${state.season} ${state.teamName} — Round ${state.round} of 5`;

  for (const slot of SLOTS) {
    const content = document.getElementById(`content-${slot}`);
    const slotState = state.slots[slot];

    if (slotState.solved) {
      content.innerHTML = `<div class="solved">${slotState.name}</div><div class="hints">${formatHints(slotState.hints)}</div>`;
    } else {
      content.innerHTML = `<input type="text" id="guess-${slot}" autocomplete="off" /><div class="hints">${formatHints(slotState.hints)}</div>`;
    }
  }

  document.getElementById('score-display').textContent = `Score: ${state.score}/1000`;

  const submitBtn = document.getElementById('submit-btn');
  const shareSection = document.getElementById('share-section');
  submitBtn.hidden = state.gameOver;
  shareSection.hidden = !state.gameOver;
}

async function submitRound() {
  const guesses = {};
  for (const slot of SLOTS) {
    if (!state.slots[slot].solved) {
      const input = document.getElementById(`guess-${slot}`);
      guesses[slot] = input ? input.value : '';
    }
  }

  const roundBeforeSubmit = state.round;

  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundToken: state.roundToken, guesses }),
  });

  if (res.status === 409) {
    localStorage.removeItem(STORAGE_KEY);
    await fetchTodaysPuzzle();
    render();
    return;
  }

  const data = await res.json();

  for (const slot of SLOTS) {
    const result = data.results[slot];
    if (result.correct && !state.slots[slot].solved) {
      state.slots[slot] = {
        solved: true,
        name: result.name,
        hints: state.slots[slot].hints,
        roundSolved: roundBeforeSubmit,
      };
    } else if (!result.correct && data.gameOver) {
      // Game over and this slot was never solved — reveal the real name
      // (so the board doesn't keep showing an empty input) without
      // crediting a round solved.
      state.slots[slot] = {
        solved: true,
        name: result.name,
        hints: state.slots[slot].hints,
        roundSolved: null,
      };
    } else if (!result.correct) {
      state.slots[slot].hints = result.hints;
    }
  }

  state.round = data.round;
  state.score = data.score;
  state.gameOver = data.gameOver;
  state.roundToken = data.roundToken || null;

  saveState(state);
  render();
}

function shareResults() {
  const slotRounds = {};
  for (const slot of SLOTS) {
    slotRounds[slot] = state.slots[slot].roundSolved;
  }

  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date(),
    score: state.score,
    slotRounds,
    url: location.origin,
  });

  navigator.clipboard.writeText(text);
  document.getElementById('share-status').textContent = 'Copied to clipboard!';
}

async function init() {
  const stored = loadStoredState();
  if (stored) {
    state = stored;
  } else {
    await fetchTodaysPuzzle();
  }
  render();

  document.getElementById('submit-btn').addEventListener('click', submitRound);
  document.getElementById('share-btn').addEventListener('click', shareResults);
}

init();
```

- [ ] **Step 4: Manually verify in a browser**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm run dev`

If `vercel dev` prompts for login/project linking and that isn't available in this environment, report `DONE_WITH_CONCERNS` noting manual browser verification couldn't be completed here — this step will be finished by the human running Task 14.

Otherwise, open the local URL it prints and confirm: the field layout shows WR1 wide left, QB center, TE+WR2 bunched right, RB below QB; typing a correct name and submitting locks that slot in and shows its hints; an incorrect guess reveals round-2-and-beyond hints as rounds progress; after round 5 (or once all 5 are solved) the submit button disappears and "Share results" appears; clicking it copies text matching the Global Constraints format; reloading the page mid-game restores progress from `localStorage` instead of restarting.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: add frontend UI with football-field layout"
```

---

### Task 14: End-to-end manual verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the fully wired app from Tasks 1-13.
- Produces: confidence the daily puzzle, hint progression, scoring, and share feature all work correctly end-to-end, and that the layout is genuinely responsive.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npm test`
Expected: PASS — every test from every task, green.

- [ ] **Step 2: Play a full puzzle via `npm run dev`**

Guess incorrectly on purpose for at least one slot in rounds 1-4 so you can observe hints accumulating (jersey/height/weight/stat in round 2, last initial added in round 3, first initial added in round 4, full first name added in round 5), then guess correctly in round 5 and confirm the game ends, revealing every remaining name and showing the correct final score per the point table (200/100/50/25/10 per slot by round solved).

- [ ] **Step 3: Verify persistence across a reload**

Mid-puzzle (before round 5), reload the browser page. Expected: the board resumes exactly where it was (same round, same locked-in slots) rather than restarting at round 1.

- [ ] **Step 4: Verify the share feature**

After finishing a puzzle, click "Share results," then paste the clipboard contents into a plain text field. Expected: it matches the format in the Global Constraints (game name — date, score line, one emoji+label per slot in QB/RB/WR1/WR2/TE order, a play-it link), and the emoji for each slot matches the round it was actually solved in (or ⚫ if never solved).

- [ ] **Step 5: Verify responsive layout**

With the browser's dev tools, check the field layout at a narrow (~375px) mobile width and a wide (~1200px) desktop width. Expected: at both sizes, WR1/QB/TE+WR2 remain visually distinguishable as left/center/right (or a sensible stacked equivalent on mobile) with RB below QB, and there is no horizontal scrollbar at either width.

- [ ] **Step 6: Verify the 409 stale-puzzle path**

This is hard to trigger naturally (it requires the calendar day to roll over mid-game), so instead: open the browser console mid-game and run `localStorage.setItem('nfl-puzzle-state', JSON.stringify({...JSON.parse(localStorage.getItem('nfl-puzzle-state')), roundToken: 'deliberately-invalid'}))`, then submit a round. Expected: the app detects the failure, clears storage, and reloads a fresh puzzle rather than showing a broken state or a raw error.

- [ ] **Step 7: Final confirmation**

Run: `git status`
Expected: `nothing to commit, working tree clean` (Tasks 1-13 already committed everything; this is just confirmation).

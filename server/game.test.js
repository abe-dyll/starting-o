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

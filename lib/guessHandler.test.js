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

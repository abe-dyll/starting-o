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

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

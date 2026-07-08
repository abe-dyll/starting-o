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

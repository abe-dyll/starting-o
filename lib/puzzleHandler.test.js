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

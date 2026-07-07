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

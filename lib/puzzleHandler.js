const { pickTodaysPuzzle } = require('./puzzleSelector');
const { hintsForRound } = require('./hints');
const { sign } = require('./roundToken');

const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];

// namesByPosition is the full-season real-player pool (built by
// scripts/pull-data.js from every player who recorded a stat that season,
// not just the 5 divisional-round-winner starters) — passed in rather than
// derived here, so the autocomplete list is much wider than just puzzle
// answers and never narrows down which name is correct for today.
function buildInitialPuzzleResponse({ puzzles, now, secret, namesByPosition }) {
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
    namesByPosition,
  };
}

module.exports = { buildInitialPuzzleResponse };

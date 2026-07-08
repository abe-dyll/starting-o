const { isMatch } = require('./nameMatch');
const { hintsForRound } = require('./hints');

const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const POINTS_BY_ROUND = { 1: 200, 2: 100, 3: 50, 4: 25, 5: 10 };
const LAST_ROUND = 5;

const WR_SLOTS = ['WR1', 'WR2'];

function gradeRound({ puzzle, tokenState, guesses }) {
  const currentRound = tokenState.currentRound;
  const solved = { ...tokenState.solved };

  // WR1/WR2 are interchangeable: a correct guess in either box counts
  // against whichever of the two real WR answers it matches, regardless
  // of which box it was typed into.
  const wrPool = WR_SLOTS.filter((slotName) => !solved[slotName]).map((slotName) => ({
    slotName,
    name: puzzle.slots[slotName].name,
  }));

  for (const boxName of WR_SLOTS) {
    if (solved[boxName]) continue;
    const guess = guesses ? guesses[boxName] : undefined;
    const matchIdx = wrPool.findIndex((candidate) => Boolean(guess) && isMatch(guess, candidate.name));
    if (matchIdx !== -1) {
      solved[wrPool[matchIdx].slotName] = currentRound;
      wrPool.splice(matchIdx, 1);
    }
  }

  // QB/RB/TE are matched directly against their own box's guess.
  for (const slotName of SLOTS) {
    if (WR_SLOTS.includes(slotName) || solved[slotName]) continue;
    const guess = guesses ? guesses[slotName] : undefined;
    if (Boolean(guess) && isMatch(guess, puzzle.slots[slotName].name)) {
      solved[slotName] = currentRound;
    }
  }

  const results = {};
  for (const slotName of SLOTS) {
    const slotData = puzzle.slots[slotName];
    const solvedRound = solved[slotName];

    results[slotName] = solvedRound
      ? {
          correct: true,
          name: slotData.name,
          pointsAwarded: POINTS_BY_ROUND[solvedRound],
          hints: hintsForRound(slotData, 2),
        }
      : {
          correct: false,
          hints: hintsForRound(slotData, currentRound + 1),
        };
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

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

const { verify, sign } = require('./roundToken');
const { gradeRound } = require('./grading');
const { pickTodaysPuzzle } = require('./puzzleSelector');

function buildGuessResponse({ puzzles, now, secret, roundToken, guesses }) {
  const tokenState = verify(roundToken, secret);
  if (!tokenState) {
    return { status: 400, body: { error: 'Invalid or tampered round token.' } };
  }

  const { puzzle, dayIndex } = pickTodaysPuzzle(puzzles, now());
  if (tokenState.dayIndex !== dayIndex) {
    return { status: 409, body: { error: "Today's puzzle has changed. Please refresh." } };
  }

  const { results, round, score, gameOver, newTokenState } = gradeRound({ puzzle, tokenState, guesses: guesses || {} });

  const body = { results, round, score, gameOver };
  if (!gameOver) {
    body.roundToken = sign(newTokenState, secret);
  }

  return { status: 200, body };
}

module.exports = { buildGuessResponse };

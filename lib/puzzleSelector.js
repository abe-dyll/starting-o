const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2026, 0, 1); // 2026-01-01 UTC, fixed reference point

function daysSinceEpoch(date) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((utcMidnight - EPOCH) / MS_PER_DAY);
}

function pickTodaysPuzzle(puzzles, date) {
  if (!puzzles || puzzles.length === 0) {
    throw new Error('no puzzles available');
  }

  const dayIndex = ((daysSinceEpoch(date) % puzzles.length) + puzzles.length) % puzzles.length;
  return { puzzle: puzzles[dayIndex], dayIndex };
}

module.exports = { daysSinceEpoch, pickTodaysPuzzle, EPOCH };

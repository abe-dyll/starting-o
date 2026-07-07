const SUFFIX_PATTERN = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(SUFFIX_PATTERN, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}

function similarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function lastNameOf(normalized) {
  const parts = normalized.split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
}

const SIMILARITY_THRESHOLD = 0.82;

function isMatch(guess, answer) {
  if (!guess || !answer) return false;

  const normGuess = normalizeName(guess);
  const normAnswer = normalizeName(answer);
  if (!normGuess || !normAnswer) return false;

  const guessLastName = lastNameOf(normGuess);
  const answerLastName = lastNameOf(normAnswer);
  if (guessLastName && guessLastName === answerLastName) return true;

  return similarity(normGuess, normAnswer) >= SIMILARITY_THRESHOLD;
}

module.exports = { normalizeName, isMatch };

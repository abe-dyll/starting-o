const crypto = require('crypto');
const { isMatch } = require('./nameMatch');

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function createRoundStore({ idGenerator = () => crypto.randomUUID() } = {}) {
  const rounds = new Map();

  function createRound({ team, teamName, year, starters }) {
    const roundId = idGenerator();
    rounds.set(roundId, { team, teamName, year, starters });
    return { roundId, team, teamName, year };
  }

  function gradeRound(roundId, guesses) {
    const round = rounds.get(roundId);
    if (!round) return null;
    rounds.delete(roundId);

    const results = {};
    let score = 0;

    for (const position of POSITIONS) {
      const starter = round.starters[position];
      const answer = starter ? starter.name : null;
      const correct = Boolean(answer) && isMatch(guesses[position], answer);
      if (correct) score += 1;
      results[position] = { correct, answer };
    }

    return { score, results };
  }

  return { createRound, gradeRound };
}

module.exports = { createRoundStore };

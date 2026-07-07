const fs = require('fs');
const path = require('path');
const { buildGuessResponse } = require('../lib/guessHandler');

module.exports = (req, res) => {
  try {
    const puzzlesPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    const puzzles = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8'));

    const { roundToken, guesses } = req.body || {};

    const { status, body } = buildGuessResponse({
      puzzles,
      now: () => new Date(),
      secret: process.env.ROUND_SECRET,
      roundToken,
      guesses,
    });

    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong grading that round. Please try again.' });
  }
};

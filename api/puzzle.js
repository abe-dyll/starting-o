const fs = require('fs');
const path = require('path');
const { buildInitialPuzzleResponse } = require('../lib/puzzleHandler');

module.exports = (req, res) => {
  try {
    const puzzlesPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    const puzzles = JSON.parse(fs.readFileSync(puzzlesPath, 'utf8'));

    const response = buildInitialPuzzleResponse({
      puzzles,
      now: () => new Date(),
      secret: process.env.ROUND_SECRET,
    });

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: "Could not load today's puzzle. Please try again." });
  }
};

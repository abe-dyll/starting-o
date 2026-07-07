const express = require('express');
const path = require('path');

function createApp({ game, roundStore } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/round', async (req, res) => {
    try {
      const round = await game.startNewRound();
      res.json(round);
    } catch (err) {
      res.status(502).json({ error: 'Could not load round data. Please try again.' });
    }
  });

  app.post('/api/round/:roundId/guess', (req, res) => {
    const { roundId } = req.params;
    const guesses = req.body || {};
    const result = roundStore.gradeRound(roundId, guesses);

    if (!result) {
      return res.status(404).json({ error: 'Round not found or already graded.' });
    }

    res.json(result);
  });

  return app;
}

module.exports = { createApp };

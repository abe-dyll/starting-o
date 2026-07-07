const { createApp } = require('./app');
const { createNflverseClient } = require('./nflverseClient');
const { createRoundStore } = require('./rounds');
const { createGame } = require('./game');
const teams = require('./teams');

const nflverseClient = createNflverseClient();
const roundStore = createRoundStore();
const game = createGame({ nflverseClient, roundStore, teams });

const app = createApp({ game, roundStore });
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`NFL starter guessing game running at http://localhost:${PORT}`);
});

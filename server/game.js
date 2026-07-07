const { computeTeamStarters } = require('./aggregate');

function createGame({ nflverseClient, roundStore, teams, now = () => new Date(), random = Math.random }) {
  function lastCompletedSeason() {
    const date = now();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    return month >= 3 ? year - 1 : year - 2;
  }

  function pickRandomYear() {
    const min = 2000;
    const max = lastCompletedSeason();
    return min + Math.floor(random() * (max - min + 1));
  }

  function pickRandomTeam(startersByTeam) {
    const teamCodes = Object.keys(startersByTeam);
    const index = Math.floor(random() * teamCodes.length);
    return teamCodes[index];
  }

  async function startNewRound() {
    const year = pickRandomYear();
    const rows = await nflverseClient.fetchSeasonStats(year);
    const startersByTeam = computeTeamStarters(rows);
    const teamCode = pickRandomTeam(startersByTeam);
    const teamName = teams[teamCode] || teamCode;

    return roundStore.createRound({
      team: teamCode,
      teamName,
      year,
      starters: startersByTeam[teamCode],
    });
  }

  return { startNewRound, lastCompletedSeason, pickRandomYear };
}

module.exports = { createGame };

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { computeTeamStarters } = require('../lib/aggregate');
const { normalizeName } = require('../lib/nameMatch');
const teams = require('../lib/teams');

const GAMES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const PLAYER_STATS_URL = (year) => `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${year}.csv`;
const ROSTER_URL = (year) => `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`;

async function fetchCsv(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`fetch failed for ${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  return parse(text, { columns: true, skip_empty_lines: true });
}

function findDivisionalWinners(gameRecords) {
  const winners = [];
  for (const row of gameRecords) {
    if (row.game_type !== 'DIV') continue;
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);
    const winningTeam = homeScore > awayScore ? row.home_team : row.away_team;
    winners.push({ season: Number(row.season), team: winningTeam, week: Number(row.week) });
  }
  return winners;
}

function parsePlayerStatsRows(records) {
  return records.map((r) => ({
    playerId: r.player_id,
    playerDisplayName: r.player_display_name,
    position: r.position,
    recentTeam: r.recent_team,
    season: Number(r.season),
    week: Number(r.week),
    seasonType: r.season_type,
    attempts: Number(r.attempts) || 0,
    carries: Number(r.carries) || 0,
    targets: Number(r.targets) || 0,
  }));
}

function parseRosterRows(records) {
  return records.map((r) => ({
    gsisId: r.gsis_id,
    fullName: r.full_name,
    team: r.team,
    season: Number(r.season),
    week: Number(r.week) || 0,
    jerseyNumber: r.jersey_number,
    height: Number(r.height),
    weight: Number(r.weight),
  }));
}

function formatHeight(inches) {
  if (!inches) return null;
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function statLabel(position, value) {
  if (position === 'QB') return `${value} attempts`;
  if (position === 'RB') return `${value} carries`;
  return `${value} targets`; // WR1, WR2, TE
}

function selectRosterInfo(rosterRows, { playerId, playerName, team, season, targetWeek }) {
  const bySeason = rosterRows.filter((r) => r.season === season);
  let candidates = bySeason.filter((r) => r.gsisId === playerId);

  if (candidates.length === 0) {
    const normalizedTarget = normalizeName(playerName);
    candidates = bySeason.filter((r) => r.team === team && normalizeName(r.fullName) === normalizedTarget);
  }

  if (candidates.length === 0) return null;

  const atOrBefore = candidates.filter((r) => r.week <= targetWeek);
  const pool = atOrBefore.length > 0 ? atOrBefore : candidates;

  return pool.reduce((best, row) => (row.week > best.week ? row : best), pool[0]);
}

function attachPlayerId(statsRows, slotStarter, team, position) {
  if (!slotStarter) return null;
  const match = statsRows.find(
    (r) => r.recentTeam === team && r.position === position && r.playerDisplayName === slotStarter.name
  );
  return { ...slotStarter, playerId: match ? match.playerId : null };
}

function buildSlotEntry(starter, position, rosterRows, { team, season, targetWeek }) {
  if (!starter) return null;

  const rosterInfo = selectRosterInfo(rosterRows, {
    playerId: starter.playerId,
    playerName: starter.name,
    team,
    season,
    targetWeek,
  });

  return {
    name: starter.name,
    jersey: rosterInfo ? Number(rosterInfo.jerseyNumber) : null,
    height: rosterInfo ? formatHeight(rosterInfo.height) : null,
    weight: rosterInfo ? rosterInfo.weight : null,
    stat: statLabel(position, starter.value),
  };
}

async function buildPuzzles({ fetchImpl, seasons }) {
  const gameRecords = await fetchCsv(fetchImpl, GAMES_URL);
  const winners = findDivisionalWinners(gameRecords)
    .filter((w) => seasons.includes(w.season))
    .sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));

  const puzzles = [];
  const statsCache = new Map();
  const rosterCache = new Map();

  for (const winner of winners) {
    if (!statsCache.has(winner.season)) {
      const records = await fetchCsv(fetchImpl, PLAYER_STATS_URL(winner.season));
      statsCache.set(winner.season, parsePlayerStatsRows(records));
    }
    if (!rosterCache.has(winner.season)) {
      const records = await fetchCsv(fetchImpl, ROSTER_URL(winner.season));
      rosterCache.set(winner.season, parseRosterRows(records));
    }

    const statsRows = statsCache.get(winner.season);
    const rosterRows = rosterCache.get(winner.season);

    const starters = computeTeamStarters(statsRows)[winner.team];
    if (!starters) continue;

    const withIds = {
      QB: attachPlayerId(statsRows, starters.QB, winner.team, 'QB'),
      RB: attachPlayerId(statsRows, starters.RB, winner.team, 'RB'),
      WR1: attachPlayerId(statsRows, starters.WR1, winner.team, 'WR'),
      WR2: attachPlayerId(statsRows, starters.WR2, winner.team, 'WR'),
      TE: attachPlayerId(statsRows, starters.TE, winner.team, 'TE'),
    };

    const targetWeek = winner.week;
    const slots = {
      QB: buildSlotEntry(withIds.QB, 'QB', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      RB: buildSlotEntry(withIds.RB, 'RB', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      WR1: buildSlotEntry(withIds.WR1, 'WR1', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      WR2: buildSlotEntry(withIds.WR2, 'WR2', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
      TE: buildSlotEntry(withIds.TE, 'TE', rosterRows, { team: winner.team, season: winner.season, targetWeek }),
    };

    puzzles.push({
      season: winner.season,
      team: winner.team,
      teamName: teams[winner.team] || winner.team,
      slots,
    });
  }

  return puzzles;
}

module.exports = { buildPuzzles, findDivisionalWinners, selectRosterInfo, formatHeight, statLabel };

if (require.main === module) {
  (async () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const lastCompletedSeason = currentMonth >= 3 ? currentYear - 1 : currentYear - 2;

    const seasons = [];
    for (let year = 2000; year <= lastCompletedSeason; year += 1) {
      seasons.push(year);
    }

    const puzzles = [];
    for (const year of seasons) {
      try {
        const seasonPuzzles = await buildPuzzles({ fetchImpl: fetch, seasons: [year] });
        puzzles.push(...seasonPuzzles);
      } catch (err) {
        console.warn(`Skipping season ${year}: ${err.message}`);
      }
    }

    const outputPath = path.join(__dirname, '..', 'data', 'puzzles.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(puzzles, null, 2));
    console.log(`Wrote ${puzzles.length} puzzles to ${outputPath}`);
  })();
}

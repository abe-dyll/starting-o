const { parse } = require('csv-parse/sync');

function createNflverseClient({ fetchImpl = fetch } = {}) {
  const cache = new Map();

  async function fetchSeasonStats(year) {
    if (cache.has(year)) {
      return cache.get(year);
    }

    const url = `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${year}.csv`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`nflverse fetch failed for year ${year}: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const records = parse(csvText, { columns: true, skip_empty_lines: true });

    const rows = records.map((record) => ({
      playerDisplayName: record.player_display_name,
      position: record.position,
      recentTeam: record.recent_team,
      season: Number(record.season),
      week: Number(record.week),
      seasonType: record.season_type,
      attempts: Number(record.attempts) || 0,
      carries: Number(record.carries) || 0,
      targets: Number(record.targets) || 0,
    }));

    cache.set(year, rows);
    return rows;
  }

  return { fetchSeasonStats };
}

module.exports = { createNflverseClient };

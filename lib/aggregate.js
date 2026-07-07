const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function statFor(row) {
  if (row.position === 'QB') return row.attempts;
  if (row.position === 'RB') return row.carries;
  return row.targets; // WR, TE
}

function computeTeamStarters(rows) {
  const totals = new Map(); // key: team|position|player -> { name, team, position, value }

  for (const row of rows) {
    if (row.seasonType !== 'REG') continue;
    if (!TRACKED_POSITIONS.includes(row.position)) continue;

    const key = `${row.recentTeam}|${row.position}|${row.playerDisplayName}`;
    const value = statFor(row);
    const existing = totals.get(key);

    if (existing) {
      existing.value += value;
    } else {
      totals.set(key, {
        name: row.playerDisplayName,
        team: row.recentTeam,
        position: row.position,
        value,
      });
    }
  }

  const starters = {};

  for (const total of totals.values()) {
    if (!starters[total.team]) {
      starters[total.team] = { QB: null, RB: null, WR: null, TE: null };
    }
    const current = starters[total.team][total.position];
    if (!current || total.value > current.value) {
      starters[total.team][total.position] = { name: total.name, value: total.value };
    }
  }

  return starters;
}

module.exports = { computeTeamStarters };

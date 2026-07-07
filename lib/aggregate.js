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

  const byTeam = new Map(); // team -> { QB: [...], RB: [...], WR: [...], TE: [...] }

  for (const total of totals.values()) {
    if (!byTeam.has(total.team)) {
      byTeam.set(total.team, { QB: [], RB: [], WR: [], TE: [] });
    }
    byTeam.get(total.team)[total.position].push({ name: total.name, value: total.value });
  }

  const sortDesc = (list) => [...list].sort((a, b) => b.value - a.value);
  const starters = {};

  for (const [team, positions] of byTeam.entries()) {
    const qbList = sortDesc(positions.QB);
    const rbList = sortDesc(positions.RB);
    const wrList = sortDesc(positions.WR);
    const teList = sortDesc(positions.TE);

    starters[team] = {
      QB: qbList[0] || null,
      RB: rbList[0] || null,
      WR1: wrList[0] || null,
      WR2: wrList[1] || null,
      TE: teList[0] || null,
    };
  }

  return starters;
}

module.exports = { computeTeamStarters };

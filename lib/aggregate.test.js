const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTeamStarters } = require('./aggregate');

test('picks the QB with the most summed attempts per team', () => {
  const rows = [
    { playerDisplayName: 'Peyton Manning', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 30, carries: 0, targets: 0 },
    { playerDisplayName: 'Peyton Manning', position: 'QB', recentTeam: 'DEN', season: 2013, week: 2, seasonType: 'REG', attempts: 28, carries: 0, targets: 0 },
    { playerDisplayName: 'Brock Osweiler', position: 'QB', recentTeam: 'DEN', season: 2013, week: 3, seasonType: 'REG', attempts: 5, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.deepEqual(starters.DEN.QB, { name: 'Peyton Manning', value: 58 });
});

test('picks RB by carries and WR/TE by targets independently per team', () => {
  const rows = [
    { playerDisplayName: 'Knowshon Moreno', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 15, targets: 3 },
    { playerDisplayName: 'Montee Ball', position: 'RB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 5, targets: 1 },
    { playerDisplayName: 'Demaryius Thomas', position: 'WR', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 10 },
    { playerDisplayName: 'Julius Thomas', position: 'TE', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 0, carries: 0, targets: 8 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.RB.name, 'Knowshon Moreno');
  assert.equal(starters.DEN.WR.name, 'Demaryius Thomas');
  assert.equal(starters.DEN.TE.name, 'Julius Thomas');
});

test('excludes non-REG rows and keeps teams independent', () => {
  const rows = [
    { playerDisplayName: 'Playoff Only Guy', position: 'QB', recentTeam: 'DEN', season: 2013, week: 20, seasonType: 'POST', attempts: 40, carries: 0, targets: 0 },
    { playerDisplayName: 'Regular Season Guy', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 10, carries: 0, targets: 0 },
    { playerDisplayName: 'Other Team QB', position: 'QB', recentTeam: 'SEA', season: 2013, week: 1, seasonType: 'REG', attempts: 25, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.QB.name, 'Regular Season Guy');
  assert.equal(starters.SEA.QB.name, 'Other Team QB');
});

test('leaves a position null for a team with no qualifying rows', () => {
  const rows = [
    { playerDisplayName: 'Some QB', position: 'QB', recentTeam: 'DEN', season: 2013, week: 1, seasonType: 'REG', attempts: 10, carries: 0, targets: 0 },
  ];

  const starters = computeTeamStarters(rows);

  assert.equal(starters.DEN.RB, null);
  assert.equal(starters.DEN.WR, null);
  assert.equal(starters.DEN.TE, null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPuzzles, findDivisionalWinners, selectRosterInfo, formatHeight, statLabel } = require('./pull-data');

const GAMES_CSV = [
  'season,game_type,week,home_team,home_score,away_team,away_score',
  '2013,DIV,20,DEN,24,SD,17',
  '2013,DIV,20,NE,43,IND,22',
  '2013,WC,18,DEN,0,0,0',
].join('\n');

const PLAYER_STATS_2013_CSV = [
  'player_id,player_display_name,position,recent_team,season,week,season_type,attempts,carries,targets',
  '00-0010346,Peyton Manning,QB,DEN,2013,1,REG,30,0,0',
  '00-0010346,Peyton Manning,QB,DEN,2013,2,REG,28,0,0',
  '00-0027702,Demaryius Thomas,WR,DEN,2013,1,REG,0,0,10',
  '00-0027942,Eric Decker,WR,DEN,2013,1,REG,0,0,8',
  '00-0026189,Knowshon Moreno,RB,DEN,2013,1,REG,0,15,3',
  '00-0028061,Julius Thomas,TE,DEN,2013,1,REG,0,0,7',
].join('\n');

const ROSTER_2013_CSV = [
  'gsis_id,full_name,first_name,last_name,team,season,week,jersey_number,height,weight',
  '00-0010346,Peyton Manning,Peyton,Manning,DEN,2013,19,18,77,230',
  '00-0027702,Demaryius Thomas,Demaryius,Thomas,DEN,2013,19,88,75,229',
  '00-0027942,Eric Decker,Eric,Decker,DEN,2013,19,87,75,214',
  '00-0026189,Knowshon Moreno,Knowshon,Moreno,DEN,2013,19,27,71,220',
  '00-0028061,Julius Thomas,Julius,Thomas,DEN,2013,19,80,77,250',
].join('\n');

function fakeFetchImpl(urlToText) {
  return async (url) => ({
    ok: true,
    status: 200,
    text: async () => urlToText(url),
  });
}

test('findDivisionalWinners picks the higher-scoring team from DIV rows only', () => {
  const records = [
    { season: '2013', game_type: 'DIV', week: '20', home_team: 'DEN', home_score: '24', away_team: 'SD', away_score: '17' },
    { season: '2013', game_type: 'WC', week: '18', home_team: 'DEN', home_score: '0', away_team: 'X', away_score: '0' },
  ];

  const winners = findDivisionalWinners(records);

  assert.deepEqual(winners, [{ season: 2013, team: 'DEN', week: 20 }]);
});

test('formatHeight converts inches to feet/inches display', () => {
  assert.equal(formatHeight(77), "6'5\"");
});

test('statLabel formats per-position stat text', () => {
  assert.equal(statLabel('QB', 450), '450 attempts');
  assert.equal(statLabel('RB', 241), '241 carries');
  assert.equal(statLabel('WR1', 142), '142 targets');
});

test('selectRosterInfo joins by gsis_id/player_id match', () => {
  const rosterRows = [
    { gsisId: '00-0010346', fullName: 'Peyton Manning', team: 'DEN', season: 2013, week: 19, jerseyNumber: '18', height: 77, weight: 230 },
  ];

  const result = selectRosterInfo(rosterRows, { playerId: '00-0010346', playerName: 'Peyton Manning', team: 'DEN', season: 2013, targetWeek: 20 });

  assert.equal(result.jerseyNumber, '18');
});

test('selectRosterInfo falls back to normalized-name match when the ID does not match', () => {
  const rosterRows = [
    { gsisId: 'different-id', fullName: 'Peyton Manning', team: 'DEN', season: 2013, week: 19, jerseyNumber: '18', height: 77, weight: 230 },
  ];

  const result = selectRosterInfo(rosterRows, { playerId: 'no-match', playerName: 'Peyton Manning', team: 'DEN', season: 2013, targetWeek: 20 });

  assert.equal(result.jerseyNumber, '18');
});

test('buildPuzzles joins schedules, stats, and rosters into one puzzle entry per divisional winner', async () => {
  const fetchImpl = fakeFetchImpl((url) => {
    if (url.includes('/schedules/')) return GAMES_CSV;
    if (url.includes('player_stats_2013')) return PLAYER_STATS_2013_CSV;
    if (url.includes('roster_2013')) return ROSTER_2013_CSV;
    throw new Error(`unexpected url in test: ${url}`);
  });

  const puzzles = await buildPuzzles({ fetchImpl, seasons: [2013] });

  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].season, 2013);
  assert.equal(puzzles[0].team, 'DEN');
  assert.equal(puzzles[0].teamName, 'Denver Broncos');
  assert.equal(puzzles[0].slots.QB.name, 'Peyton Manning');
  assert.equal(puzzles[0].slots.QB.jersey, 18);
  assert.equal(puzzles[0].slots.QB.height, "6'5\"");
  assert.equal(puzzles[0].slots.QB.stat, '58 attempts');
  assert.equal(puzzles[0].slots.WR1.name, 'Demaryius Thomas');
  assert.equal(puzzles[0].slots.WR2.name, 'Eric Decker');
});

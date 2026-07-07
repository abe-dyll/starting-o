const test = require('node:test');
const assert = require('node:assert/strict');
const { createNflverseClient } = require('./nflverseClient');

const SAMPLE_CSV = [
  'player_display_name,position,recent_team,season,week,season_type,attempts,carries,targets',
  'Peyton Manning,QB,DEN,2013,1,REG,30,0,0',
  'Peyton Manning,QB,DEN,2013,2,REG,28,0,0',
  'Knowshon Moreno,RB,DEN,2013,1,REG,0,15,3',
].join('\n');

function fakeFetchImpl(responseText, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    text: async () => responseText,
  });
}

test('fetchSeasonStats parses CSV rows into typed objects', async () => {
  const client = createNflverseClient({ fetchImpl: fakeFetchImpl(SAMPLE_CSV) });
  const rows = await client.fetchSeasonStats(2013);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    playerDisplayName: 'Peyton Manning',
    position: 'QB',
    recentTeam: 'DEN',
    season: 2013,
    week: 1,
    seasonType: 'REG',
    attempts: 30,
    carries: 0,
    targets: 0,
  });
});

test('fetchSeasonStats caches results per year (fetchImpl called once)', async () => {
  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fakeFetchImpl(SAMPLE_CSV)(...args);
  };
  const client = createNflverseClient({ fetchImpl: countingFetch });

  await client.fetchSeasonStats(2013);
  await client.fetchSeasonStats(2013);

  assert.equal(callCount, 1);
});

test('fetchSeasonStats throws on a non-ok response', async () => {
  const client = createNflverseClient({ fetchImpl: fakeFetchImpl('', { ok: false, status: 404 }) });

  await assert.rejects(() => client.fetchSeasonStats(1899), /404/);
});

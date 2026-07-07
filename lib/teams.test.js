const test = require('node:test');
const assert = require('node:assert/strict');
const teams = require('./teams');

test('maps common and historical team abbreviations to full names', () => {
  assert.equal(teams.DEN, 'Denver Broncos');
  assert.equal(teams.SD, 'San Diego Chargers');
  assert.equal(teams.LAC, 'Los Angeles Chargers');
  assert.equal(teams.OAK, 'Oakland Raiders');
  assert.equal(teams.LV, 'Las Vegas Raiders');
  assert.equal(teams.STL, 'St. Louis Rams');
  assert.equal(teams.LA, 'Los Angeles Rams');
});

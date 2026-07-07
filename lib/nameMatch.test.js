const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, isMatch } = require('./nameMatch');

test('normalizeName lowercases, strips punctuation/accents, and drops suffixes', () => {
  assert.equal(normalizeName("Ja'Marr Chase"), 'jamarr chase');
  assert.equal(normalizeName('Odell Beckham Jr.'), 'odell beckham');
  assert.equal(normalizeName('Amon-Ra St. Brown'), 'amonra st brown');
});

test('isMatch is true for an exact name', () => {
  assert.equal(isMatch('Peyton Manning', 'Peyton Manning'), true);
});

test('isMatch is true ignoring punctuation and case', () => {
  assert.equal(isMatch('jamarr chase', "Ja'Marr Chase"), true);
});

test('isMatch is true ignoring a Jr./Sr./III suffix', () => {
  assert.equal(isMatch('Odell Beckham', 'Odell Beckham Jr.'), true);
});

test('isMatch is true for a minor typo via similarity threshold', () => {
  assert.equal(isMatch('Patrick Mahomess', 'Patrick Mahomes'), true);
});

test('isMatch is false for a clearly different player', () => {
  assert.equal(isMatch('Tom Brady', 'Aaron Rodgers'), false);
});

test('isMatch is false for a blank guess', () => {
  assert.equal(isMatch('', 'Peyton Manning'), false);
});

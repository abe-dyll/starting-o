const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoundStore } = require('./rounds');

const STARTERS = {
  QB: { name: 'Peyton Manning', value: 58 },
  RB: { name: 'Knowshon Moreno', value: 20 },
  WR: { name: 'Demaryius Thomas', value: 10 },
  TE: { name: 'Julius Thomas', value: 8 },
};

function storeWithFixedId(id) {
  return createRoundStore({ idGenerator: () => id });
}

test('createRound returns a round DTO without exposing answers', () => {
  const store = storeWithFixedId('round-1');

  const round = store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  assert.deepEqual(round, { roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 });
});

test('gradeRound scores correct and incorrect guesses and reveals answers', () => {
  const store = storeWithFixedId('round-2');
  store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  const result = store.gradeRound('round-2', {
    QB: 'Peyton Manning',
    RB: 'wrong guy',
    WR: 'Demaryius Thomas',
    TE: '',
  });

  assert.equal(result.score, 2);
  assert.deepEqual(result.results.QB, { correct: true, answer: 'Peyton Manning' });
  assert.deepEqual(result.results.RB, { correct: false, answer: 'Knowshon Moreno' });
  assert.deepEqual(result.results.WR, { correct: true, answer: 'Demaryius Thomas' });
  assert.deepEqual(result.results.TE, { correct: false, answer: 'Julius Thomas' });
});

test('gradeRound is one-shot: a second grade of the same round returns null', () => {
  const store = storeWithFixedId('round-3');
  store.createRound({ team: 'DEN', teamName: 'Denver Broncos', year: 2013, starters: STARTERS });

  store.gradeRound('round-3', { QB: 'Peyton Manning', RB: '', WR: '', TE: '' });
  const second = store.gradeRound('round-3', { QB: 'Peyton Manning', RB: '', WR: '', TE: '' });

  assert.equal(second, null);
});

test('gradeRound returns null for an unknown roundId', () => {
  const store = storeWithFixedId('round-4');

  assert.equal(store.gradeRound('does-not-exist', {}), null);
});

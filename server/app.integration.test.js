const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');
const { createRoundStore } = require('./rounds');

function fakeGame(overrides = {}) {
  return {
    startNewRound: async () => ({ roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 }),
    ...overrides,
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('GET /api/round returns a round without answers', async () => {
  const app = createApp({ game: fakeGame(), roundStore: createRoundStore() });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { roundId: 'round-1', team: 'DEN', teamName: 'Denver Broncos', year: 2013 });
  });
});

test('GET /api/round returns 502 when the game throws', async () => {
  const app = createApp({
    game: fakeGame({ startNewRound: async () => { throw new Error('nflverse down'); } }),
    roundStore: createRoundStore(),
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round`);
    assert.equal(res.status, 502);
  });
});

test('POST /api/round/:roundId/guess grades a known round', async () => {
  const roundStore = createRoundStore({ idGenerator: () => 'round-2' });
  roundStore.createRound({
    team: 'DEN',
    teamName: 'Denver Broncos',
    year: 2013,
    starters: {
      QB: { name: 'Peyton Manning', value: 58 },
      RB: { name: 'Knowshon Moreno', value: 20 },
      WR: { name: 'Demaryius Thomas', value: 10 },
      TE: { name: 'Julius Thomas', value: 8 },
    },
  });
  const app = createApp({ game: fakeGame(), roundStore });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round/round-2/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ QB: 'Peyton Manning', RB: '', WR: '', TE: '' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.score, 1);
    assert.equal(body.results.QB.correct, true);
  });
});

test('POST /api/round/:roundId/guess returns 404 for an unknown round', async () => {
  const app = createApp({ game: fakeGame(), roundStore: createRoundStore() });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/round/does-not-exist/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ QB: '', RB: '', WR: '', TE: '' }),
    });
    assert.equal(res.status, 404);
  });
});

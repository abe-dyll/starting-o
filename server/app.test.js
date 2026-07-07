const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');

test('GET /health returns ok status', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    server.close();
  }
});

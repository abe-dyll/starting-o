const test = require('node:test');
const assert = require('node:assert/strict');
const { sign, verify } = require('./roundToken');

const SECRET = 'test-secret';
const PAYLOAD = { dayIndex: 5, solved: { QB: 1, RB: null, WR1: null, WR2: null, TE: null }, currentRound: 2 };

test('sign then verify returns the original payload', () => {
  const token = sign(PAYLOAD, SECRET);
  assert.deepEqual(verify(token, SECRET), PAYLOAD);
});

test('verify rejects a token signed with a different secret', () => {
  const token = sign(PAYLOAD, SECRET);
  assert.equal(verify(token, 'wrong-secret'), null);
});

test('verify rejects a tampered payload', () => {
  const token = sign(PAYLOAD, SECRET);
  const [payloadB64, signature] = token.split('.');
  const tampered = `${payloadB64}x.${signature}`;
  assert.equal(verify(tampered, SECRET), null);
});

test('verify rejects a tampered signature', () => {
  const token = sign(PAYLOAD, SECRET);
  const [payloadB64, signature] = token.split('.');
  const tampered = `${payloadB64}.${signature}x`;
  assert.equal(verify(tampered, SECRET), null);
});

test('verify rejects a malformed token', () => {
  assert.equal(verify('not-a-real-token', SECRET), null);
  assert.equal(verify('', SECRET), null);
});

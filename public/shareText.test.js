const test = require('node:test');
const assert = require('node:assert/strict');
const { formatShareText } = require('./shareText');

test('formats share text with correct emoji mapping and score, using UTC for the date', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 575,
    slotRounds: { QB: 1, RB: 2, WR1: 1, WR2: 3, TE: 4 },
    url: 'https://example.com',
  });

  assert.equal(
    text,
    "NFL Divisional Starters — Jul 7\nScore: 575/1000\n🟢 QB  🟡 RB  🟢 WR1  🟠 WR2  🔴 TE\nPlay today's puzzle: https://example.com"
  );
});

test('uses the never-solved emoji for a null round', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 200,
    slotRounds: { QB: 1, RB: null, WR1: null, WR2: null, TE: null },
    url: 'https://example.com',
  });

  assert.match(text, /⚫ RB/);
  assert.match(text, /⚫ WR1/);
  assert.match(text, /⚫ WR2/);
  assert.match(text, /⚫ TE/);
});

test('uses the round-5 emoji correctly', () => {
  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date('2026-07-07T00:00:00Z'),
    score: 10,
    slotRounds: { QB: 5, RB: null, WR1: null, WR2: null, TE: null },
    url: 'https://example.com',
  });

  assert.match(text, /⚪ QB/);
});

const EMOJI_BY_ROUND = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴', 5: '⚪' };
const NEVER_SOLVED_EMOJI = '⚫';
const SLOT_ORDER = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const MAX_SCORE = 1000;

function formatShareText({ gameName, date, score, slotRounds, url }) {
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const emojiLine = SLOT_ORDER.map((slot) => {
    const round = slotRounds[slot];
    const emoji = round ? EMOJI_BY_ROUND[round] : NEVER_SOLVED_EMOJI;
    return `${emoji} ${slot}`;
  }).join('  ');

  return [
    `${gameName} — ${dateLabel}`,
    `Score: ${score}/${MAX_SCORE}`,
    emojiLine,
    `Play today's puzzle: ${url}`,
  ].join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatShareText, EMOJI_BY_ROUND, NEVER_SOLVED_EMOJI, SLOT_ORDER, MAX_SCORE };
}

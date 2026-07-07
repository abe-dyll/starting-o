const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const STORAGE_KEY = 'nfl-puzzle-state';

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function loadStoredState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed.fetchedOnUtcDate !== todayUtcDateString()) return null;
  return parsed;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emptySlotStates() {
  const slots = {};
  for (const slot of SLOTS) {
    slots[slot] = { solved: false, name: null, hints: {}, roundSolved: null };
  }
  return slots;
}

let state = null;

async function fetchTodaysPuzzle() {
  const res = await fetch('/api/puzzle');
  if (!res.ok) throw new Error('failed to load puzzle');
  const data = await res.json();

  const slots = emptySlotStates();
  for (const slot of SLOTS) {
    slots[slot].hints = data.slots[slot].hints;
  }

  state = {
    fetchedOnUtcDate: todayUtcDateString(),
    team: data.team,
    teamName: data.teamName,
    season: data.season,
    round: data.round,
    roundToken: data.roundToken,
    slots,
    gameOver: false,
    score: 0,
  };
  saveState(state);
}

function formatHints(hints) {
  const parts = [];
  if (hints.jersey) parts.push(`#${hints.jersey}`);
  if (hints.height && hints.weight) parts.push(`${hints.height}, ${hints.weight}lbs`);
  if (hints.stat) parts.push(hints.stat);
  if (hints.lastInitial) parts.push(`Last initial: ${hints.lastInitial}.`);
  if (hints.firstInitial) parts.push(`First initial: ${hints.firstInitial}.`);
  if (hints.firstName) parts.push(`First name: ${hints.firstName}`);
  return parts.join(' · ');
}

function render() {
  document.getElementById('puzzle-heading').textContent =
    `${state.season} ${state.teamName} — Round ${state.round} of 5`;

  for (const slot of SLOTS) {
    const content = document.getElementById(`content-${slot}`);
    const slotState = state.slots[slot];

    if (slotState.solved) {
      content.innerHTML = `<div class="solved">${slotState.name}</div><div class="hints">${formatHints(slotState.hints)}</div>`;
    } else {
      content.innerHTML = `<input type="text" id="guess-${slot}" autocomplete="off" /><div class="hints">${formatHints(slotState.hints)}</div>`;
    }
  }

  document.getElementById('score-display').textContent = `Score: ${state.score}/1000`;

  const submitBtn = document.getElementById('submit-btn');
  const shareSection = document.getElementById('share-section');
  submitBtn.hidden = state.gameOver;
  shareSection.hidden = !state.gameOver;
}

async function submitRound() {
  const guesses = {};
  for (const slot of SLOTS) {
    if (!state.slots[slot].solved) {
      const input = document.getElementById(`guess-${slot}`);
      guesses[slot] = input ? input.value : '';
    }
  }

  const roundBeforeSubmit = state.round;

  const res = await fetch('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundToken: state.roundToken, guesses }),
  });

  if (res.status === 409) {
    localStorage.removeItem(STORAGE_KEY);
    await fetchTodaysPuzzle();
    render();
    return;
  }

  const data = await res.json();

  for (const slot of SLOTS) {
    const result = data.results[slot];
    if (result.correct && !state.slots[slot].solved) {
      state.slots[slot] = {
        solved: true,
        name: result.name,
        hints: state.slots[slot].hints,
        roundSolved: roundBeforeSubmit,
      };
    } else if (!result.correct && data.gameOver) {
      // Game over and this slot was never solved — reveal the real name
      // (so the board doesn't keep showing an empty input) without
      // crediting a round solved.
      state.slots[slot] = {
        solved: true,
        name: result.name,
        hints: state.slots[slot].hints,
        roundSolved: null,
      };
    } else if (!result.correct) {
      state.slots[slot].hints = result.hints;
    }
  }

  state.round = data.round;
  state.score = data.score;
  state.gameOver = data.gameOver;
  state.roundToken = data.roundToken || null;

  saveState(state);
  render();
}

function shareResults() {
  const slotRounds = {};
  for (const slot of SLOTS) {
    slotRounds[slot] = state.slots[slot].roundSolved;
  }

  const text = formatShareText({
    gameName: 'NFL Divisional Starters',
    date: new Date(),
    score: state.score,
    slotRounds,
    url: location.origin,
  });

  navigator.clipboard.writeText(text);
  document.getElementById('share-status').textContent = 'Copied to clipboard!';
}

async function init() {
  const stored = loadStoredState();
  if (stored) {
    state = stored;
  } else {
    await fetchTodaysPuzzle();
  }
  render();

  document.getElementById('submit-btn').addEventListener('click', submitRound);
  document.getElementById('share-btn').addEventListener('click', shareResults);
}

init();

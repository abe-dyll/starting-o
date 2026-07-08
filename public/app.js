const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE'];
const STORAGE_KEY = 'nfl-puzzle-state';
const DATALIST_ID_BY_SLOT = { QB: 'datalist-QB', RB: 'datalist-RB', WR1: 'datalist-WR', WR2: 'datalist-WR', TE: 'datalist-TE' };

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

const MIN_AUTOCOMPLETE_CHARS = 3;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 8;
const CATEGORY_BY_SLOT = { QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', TE: 'TE' };

function updateAutocomplete(slot, query) {
  const datalist = document.getElementById(DATALIST_ID_BY_SLOT[slot]);
  if (!query || query.trim().length < MIN_AUTOCOMPLETE_CHARS) {
    datalist.innerHTML = '';
    return;
  }

  const lowerQuery = query.trim().toLowerCase();
  const candidates = state.namesByPosition[CATEGORY_BY_SLOT[slot]] || [];
  const matches = candidates.filter((name) => name.toLowerCase().includes(lowerQuery)).slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS);

  datalist.innerHTML = matches.map((name) => `<option value="${name}"></option>`).join('');
}

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
    namesByPosition: data.namesByPosition,
  };
  saveState(state);
}

function formatHints(hints) {
  const parts = [];
  if (hints.jersey !== undefined && hints.jersey !== null) parts.push(`#${hints.jersey}`);
  if (hints.height && hints.weight) parts.push(`${hints.height}, ${hints.weight}lbs`);
  if (hints.stat) parts.push(hints.stat);
  if (hints.lastInitial) parts.push(`Last initial: ${hints.lastInitial}.`);
  if (hints.firstInitial) parts.push(`First initial: ${hints.firstInitial}.`);
  if (hints.firstName) parts.push(`First name: ${hints.firstName}`);
  return parts.join(' · ');
}

function renderRoundTracker() {
  const dots = document.querySelectorAll('#round-tracker .round-dot');
  dots.forEach((dot) => {
    const dotRound = Number(dot.dataset.round);
    dot.classList.remove('is-current', 'is-past');
    if (state.gameOver || dotRound < state.round) {
      dot.classList.add('is-past');
    } else if (dotRound === state.round) {
      dot.classList.add('is-current');
    }
  });
}

function render() {
  document.getElementById('puzzle-heading').textContent = state.gameOver
    ? `${state.season} ${state.teamName} — Final`
    : `${state.season} ${state.teamName} — Round ${state.round} of 5`;

  document.getElementById('submit-error').hidden = true;

  for (const slot of SLOTS) {
    const slotEl = document.getElementById(`slot-${slot}`);
    const content = document.getElementById(`content-${slot}`);
    const slotState = state.slots[slot];

    slotEl.classList.toggle('is-solved', slotState.solved);

    if (slotState.solved) {
      content.innerHTML = `<div class="solved">${slotState.name}</div><div class="hints">${formatHints(slotState.hints)}</div>`;
    } else {
      const datalistId = DATALIST_ID_BY_SLOT[slot];
      content.innerHTML = `<input type="text" id="guess-${slot}" list="${datalistId}" autocomplete="off" placeholder="Type a name…" /><div class="hints">${formatHints(slotState.hints)}</div>`;
      const input = document.getElementById(`guess-${slot}`);
      input.addEventListener('input', () => updateAutocomplete(slot, input.value));
    }
  }

  document.getElementById('score-value').textContent = state.score;
  renderRoundTracker();

  const submitBtn = document.getElementById('submit-btn');
  const shareSection = document.getElementById('share-section');
  submitBtn.hidden = state.gameOver;
  shareSection.hidden = !state.gameOver;
}

function validateAllFieldsFilled() {
  const emptyInputs = [];
  for (const slot of SLOTS) {
    if (state.slots[slot].solved) continue;
    const input = document.getElementById(`guess-${slot}`);
    input.classList.remove('input-error');
    if (!input.value.trim()) {
      emptyInputs.push(input);
    }
  }

  const errorMessage = document.getElementById('submit-error');
  if (emptyInputs.length > 0) {
    emptyInputs.forEach((input) => input.classList.add('input-error'));
    errorMessage.hidden = false;
    emptyInputs[0].focus();
    return false;
  }

  errorMessage.hidden = true;
  return true;
}

async function submitRound() {
  if (!validateAllFieldsFilled()) return;

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
        hints: result.hints,
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

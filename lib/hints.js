function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts[parts.length - 1] || '',
  };
}

function hintsForRound(slot, round) {
  if (round <= 1) return {};

  const hints = {
    jersey: slot.jersey,
    height: slot.height,
    weight: slot.weight,
    stat: slot.stat,
  };
  if (round === 2) return hints;

  const { firstName, lastName } = splitName(slot.name);
  hints.lastInitial = lastName.charAt(0);
  if (round === 3) return hints;

  hints.firstInitial = firstName.charAt(0);
  if (round === 4) return hints;

  hints.firstName = firstName;
  return hints; // round >= 5
}

module.exports = { hintsForRound, splitName };

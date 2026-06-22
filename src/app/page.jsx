"use client";
import { useState, useEffect, useRef } from "react";

// ── Palette & constants ───────────────────────────────────────────────────────
const COLORS = {
  fieldGreen:   "#2D5016",
  fieldLight:   "#3A6B1E",
  yardLine:     "#F5F0DC",
  cream:        "#F5F0DC",
  creamDark:    "#E8E0C4",
  creamBorder:  "#C8B98A",
  brown:        "#8B4513",
  brownDark:    "#5C2D0A",
  red:          "#B22222",
  gold:         "#D4A017",
  shadow:       "rgba(0,0,0,0.35)",
  scoreboard:   "#1A0A00",
};

const ROUND_POINTS = { 1: 1000, 2: 700, 3: 500, 4: 250, 5: 150 };

const POSITIONS = ["QB", "RB", "WR1", "WR2", "TE"];

// Field layout: [left%, top%] relative to field container
const FIELD_LAYOUT = {
  WR1: { left: "6%",  top: "28%", label: "WR" },
  TE:  { left: "34%", top: "42%", label: "TE" },
  QB:  { left: "48%", top: "58%", label: "QB" },
  RB:  { left: "48%", top: "72%", label: "RB" },
  WR2: { left: "80%", top: "28%", label: "WR" },
};

// ── Hint helpers ──────────────────────────────────────────────────────────────
function maskName(name, round) {
  if (round < 3) return null;
  const parts = name.split(" ");
  const first = parts[0];
  const last  = parts.slice(1).join(" ");

  const maskWord = (w) => w[0] + " " + Array.from(w.slice(1)).map((c) => (c === "." || c === "'" ? c : "_")).join(" ");

  if (round === 3) return `${maskWord(first[0] === first[0] ? Array(first.length).fill("_").join(" ") : "")} ${first[0] !== last[0] ? maskWord(last) : maskWord(last)}`.trim().replace(/^(\s*)/, maskWord(Array(first.length).fill("_").join("")) + " ");
  if (round === 3) return `${"_ ".repeat(first.length).trim()}  ${last[0]}${"_ ".repeat(last.replace(/[^a-zA-Z]/g,"").length - 1).trim()}`;
  if (round === 4) return `${first[0]}${"_ ".repeat(first.replace(/[^a-zA-Z]/g,"").length - 1).trim()}  ${last[0]}${"_ ".repeat(last.replace(/[^a-zA-Z]/g,"").length - 1).trim()}`;
  if (round === 5) return `${first}  ${last[0]}${"_ ".repeat(last.replace(/[^a-zA-Z]/g,"").length - 1).trim()}`;
  return name;
}

function buildMask(name, round) {
  if (!name || round < 3) return null;
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const rest  = parts.slice(1).join(" ");

  const blankWord = (w) => {
    const letters = w.replace(/[^a-zA-Z]/g, "");
    return w[0] + Array(letters.length - 1).fill("_").join(" ");
  };

  const fullBlank = (w) => {
    const letters = w.replace(/[^a-zA-Z]/g, "");
    return Array(letters.length).fill("_").join(" ");
  };

  if (round === 3) return `${fullBlank(first)}   ${blankWord(rest)}`;
  if (round === 4) return `${blankWord(first)}   ${blankWord(rest)}`;
  if (round === 5) return `${first}   ${blankWord(rest)}`;
  return name;
}

// ── Build autocomplete catalog from teams data ────────────────────────────────
function buildCatalog(teams) {
  const catalog = { QB: new Set(), RB: new Set(), WR: new Set(), TE: new Set() };
  teams.forEach((team) => {
    Object.entries(team.roster).forEach(([pos, player]) => {
      const key = pos.startsWith("WR") ? "WR" : pos;
      if (catalog[key]) catalog[key].add(player.name);
    });
  });
  return {
    QB: [...catalog.QB].sort(),
    RB: [...catalog.RB].sort(),
    WR: [...catalog.WR].sort(),
    TE: [...catalog.TE].sort(),
  };
}

// ── Today's team index (stable by calendar date) ──────────────────────────────
function getDailyIndex(total) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  return day % total;
}

// ── Scoreboard digit display ──────────────────────────────────────────────────
function ScoreDisplay({ score }) {
  const str = String(score).padStart(5, "0");
  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: 28, color: COLORS.gold, letterSpacing: 4, background: COLORS.scoreboard, padding: "4px 16px", borderRadius: 4, border: `2px solid ${COLORS.gold}`, display: "inline-block" }}>
      {str}
    </div>
  );
}

// ── Autocomplete input ────────────────────────────────────────────────────────
function AutocompleteInput({ posKey, catalog, onCommit, disabled, placeholder }) {
  const [query, setQuery]       = useState("");
  const [options, setOptions]   = useState([]);
  const [open, setOpen]         = useState(false);
  const wrapRef                 = useRef(null);

  const poolKey = posKey.startsWith("WR") ? "WR" : posKey;

  useEffect(() => {
    if (query.length < 2) { setOptions([]); setOpen(false); return; }
    const q = query.toLowerCase();
    const matches = (catalog[poolKey] || []).filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
    setOptions(matches);
    setOpen(matches.length > 0);
  }, [query, poolKey, catalog]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (name) => {
    setQuery(name);
    setOpen(false);
    onCommit(name);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder={placeholder || `Type ${posKey} name…`}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "6px 10px", fontFamily: "'Courier New', monospace",
          fontSize: 13, background: disabled ? COLORS.creamDark : COLORS.cream,
          border: `2px solid ${COLORS.creamBorder}`, borderRadius: 3,
          color: COLORS.brownDark, outline: "none",
        }}
      />
      {open && (
        <ul style={{
          position: "absolute", zIndex: 999, top: "100%", left: 0, right: 0,
          background: COLORS.cream, border: `2px solid ${COLORS.creamBorder}`,
          borderTop: "none", margin: 0, padding: 0, listStyle: "none",
          maxHeight: 160, overflowY: "auto", borderRadius: "0 0 3px 3px",
        }}>
          {options.map((name) => (
            <li key={name} onMouseDown={() => select(name)}
              style={{ padding: "6px 10px", fontFamily: "'Courier New', monospace", fontSize: 13, cursor: "pointer", color: COLORS.brownDark, borderBottom: `1px solid ${COLORS.creamBorder}` }}
              onMouseEnter={(e) => e.target.style.background = COLORS.creamDark}
              onMouseLeave={(e) => e.target.style.background = "transparent"}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Player token on field ─────────────────────────────────────────────────────
function PlayerToken({ posKey, label, solved, guessed, round, player, onClick, active }) {
  const isWR = posKey.startsWith("WR");
  const bg   = solved ? COLORS.gold : active ? COLORS.cream : COLORS.creamDark;
  const border = active ? `3px solid ${COLORS.brown}` : `2px solid ${COLORS.creamBorder}`;

  return (
    <div onClick={!solved ? onClick : undefined}
      style={{
        position: "absolute",
        left: FIELD_LAYOUT[posKey].left,
        top:  FIELD_LAYOUT[posKey].top,
        transform: "translate(-50%, -50%)",
        width: 70, minHeight: 70,
        background: bg, border,
        borderRadius: 4, cursor: solved ? "default" : "pointer",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "4px 2px",
        boxShadow: active ? `0 0 0 3px ${COLORS.brown}` : `2px 2px 6px ${COLORS.shadow}`,
        transition: "all 0.15s",
        zIndex: active ? 10 : 1,
      }}>
      {/* Position badge */}
      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 9, fontWeight: "bold", color: COLORS.brown, letterSpacing: 1, marginBottom: 2 }}>
        {label}
      </div>

      {solved ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, fontFamily: "'Courier New', monospace", color: COLORS.brownDark, fontWeight: "bold", lineHeight: 1.3 }}>
            #{player.jersey}
          </div>
          <div style={{ fontSize: 10, fontFamily: "'Courier New', monospace", color: COLORS.brownDark, fontWeight: "bold", lineHeight: 1.3, wordBreak: "break-word" }}>
            {player.name.split(" ").map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      ) : round >= 2 && player ? (
        <div style={{ textAlign: "center" }}>
          {round >= 3 && (
            <div style={{ fontSize: 8, fontFamily: "'Courier New', monospace", color: COLORS.brown, letterSpacing: 1, lineHeight: 1.4 }}>
              {buildMask(player.name, round)}
            </div>
          )}
          {round >= 2 && (
            <div style={{ fontSize: 7, fontFamily: "'Courier New', monospace", color: COLORS.brownDark, lineHeight: 1.4 }}>
              <div>#{player.jersey} · {player.height}</div>
              <div>{player.weight} lbs</div>
              <div>{player.yards} yds · {player.tds} TD</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 9, fontFamily: "'Courier New', monospace", color: COLORS.brown, opacity: 0.6 }}>?</div>
      )}
    </div>
  );
}

// ── Field SVG background ──────────────────────────────────────────────────────
function FootballField({ children }) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", aspectRatio: "4/3", background: COLORS.fieldGreen, borderRadius: 6, border: `4px solid ${COLORS.brown}`, overflow: "visible", boxShadow: `0 4px 24px ${COLORS.shadow}` }}>
      {/* Yard lines */}
      {[25, 50, 75].map((pct) => (
        <div key={pct} style={{ position: "absolute", left: 0, right: 0, top: `${pct}%`, height: 1, background: "rgba(245,240,220,0.25)" }} />
      ))}
      {/* Hash marks */}
      {[20, 40, 60, 80].map((top) =>
        [35, 50, 65].map((left) => (
          <div key={`${top}-${left}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: 8, height: 1, background: "rgba(245,240,220,0.2)", transform: "translateX(-50%)" }} />
        ))
      )}
      {/* End zone feel: thin strips top/bottom */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "8%", background: "rgba(0,0,0,0.15)", borderBottom: `1px solid rgba(245,240,220,0.2)` }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "8%", background: "rgba(0,0,0,0.15)", borderTop: `1px solid rgba(245,240,220,0.2)` }} />
      {children}
    </div>
  );
}

// ── Round pip indicators ──────────────────────────────────────────────────────
function RoundPips({ current, max = 5 }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 12, height: 12, borderRadius: "50%",
          background: i < current ? COLORS.brown : COLORS.creamDark,
          border: `2px solid ${COLORS.creamBorder}`,
        }} />
      ))}
    </div>
  );
}

// ── Share string generator ────────────────────────────────────────────────────
function buildShareString(challenge, solvedMap, roundSolvedMap) {
  const lines = [`🏈 Championship Sunday`, `${challenge.team_name} ${challenge.year}`, ``];
  POSITIONS.forEach((pos) => {
    const solved = solvedMap[pos];
    const round  = roundSolvedMap[pos];
    const emoji  = solved ? (round === 1 ? "🟡" : round <= 2 ? "🟢" : round <= 4 ? "🟠" : "🔴") : "⬛";
    lines.push(`${pos.padEnd(3)} ${emoji}`);
  });
  lines.push(``, `Score: ${Object.values(roundSolvedMap).reduce((sum, r) => sum + (ROUND_POINTS[r] || 0), 0)}/5000`);
  return lines.join("\n");
}

// ── Main game component ───────────────────────────────────────────────────────
export default function ChampionshipSunday() {
  const [teams, setTeams]               = useState([]);
  const [catalog, setCatalog]           = useState({});
  const [challenge, setChallenge]       = useState(null);
  const [activePos, setActivePos]       = useState(null);
  const [round, setRound]               = useState(1);
  const [guesses, setGuesses]           = useState({});       // pos → last guess string
  const [solved, setSolved]             = useState({});       // pos → true
  const [roundSolved, setRoundSolved]   = useState({});       // pos → round number
  const [score, setScore]               = useState(0);
  const [gameOver, setGameOver]         = useState(false);
  const [shared, setShared]             = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [pendingGuess, setPendingGuess] = useState({});       // pos → staged name

  const todayKey = () => {
    const d = new Date();
    return `cs-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  // Load teams + restore state
  useEffect(() => {
    fetch("/api/daily-team")
      .then((r) => r.json())
      .then((data) => {
        // We need full teams for catalog — fetch all via a separate route or import
        // For now build catalog from the single team (will expand)
      });

    import("../data/teams.json").then((mod) => {
      const all = mod.default;
      setCatalog(buildCatalog(all));
      const idx = getDailyIndex(all.length);
      const team = all[idx];
      setTeams(all);
      setChallenge(team);

      // Restore from localStorage
      const saved = localStorage.getItem(todayKey());
      if (saved) {
        try {
          const state = JSON.parse(saved);
          setSolved(state.solved || {});
          setRoundSolved(state.roundSolved || {});
          setScore(state.score || 0);
          setRound(state.round || 1);
          setGameOver(state.gameOver || false);
        } catch (_) {}
      }
      setLoaded(true);
    });
  }, []);

  // Persist state
  useEffect(() => {
    if (!loaded || !challenge) return;
    localStorage.setItem(todayKey(), JSON.stringify({ solved, roundSolved, score, round, gameOver }));
  }, [solved, roundSolved, score, round, gameOver, loaded, challenge]);

  const getRoster = () => challenge?.roster || {};

  const normalizeWR = (pos, name) => {
    // If guessing a WR slot, check both WR1 and WR2
    if (!pos.startsWith("WR")) return { matchedPos: pos, matched: getRoster()[pos]?.name?.toLowerCase() === name.toLowerCase() };
    const wr1 = getRoster()["WR1"]?.name?.toLowerCase();
    const wr2 = getRoster()["WR2"]?.name?.toLowerCase();
    const lower = name.toLowerCase();
    if (lower === wr1) return { matchedPos: "WR1", matched: true };
    if (lower === wr2) return { matchedPos: "WR2", matched: true };
    return { matchedPos: pos, matched: false };
  };

  const submitGuess = () => {
    if (!challenge || gameOver) return;
    const roster = getRoster();
    let newSolved = { ...solved };
    let newRoundSolved = { ...roundSolved };
    let addedScore = 0;

    Object.entries(pendingGuess).forEach(([pos, name]) => {
      if (!name || solved[pos]) return;
      const { matchedPos, matched } = normalizeWR(pos, name);
      if (matched && !newSolved[matchedPos]) {
        newSolved[matchedPos] = true;
        newRoundSolved[matchedPos] = round;
        addedScore += ROUND_POINTS[round] || 0;

        // Auto-fill the OTHER WR slot if this was a WR match
        if (matchedPos.startsWith("WR")) {
          const otherWR = matchedPos === "WR1" ? "WR2" : "WR1";
          // Don't auto-solve the other WR — just register the guess in the correct slot
        }
      }
    });

    setSolved(newSolved);
    setRoundSolved(newRoundSolved);
    setScore((s) => s + addedScore);
    setPendingGuess({});

    const allSolved = POSITIONS.every((p) => newSolved[p]);
    if (allSolved || round >= 5) {
      setGameOver(true);
    } else {
      setRound((r) => r + 1);
    }
  };

  const handleCommit = (pos, name) => {
    // WR cross-fill: if typing in WR1 and it matches WR2, stage it for WR2
    if (pos.startsWith("WR")) {
      const wr1Name = getRoster()["WR1"]?.name?.toLowerCase();
      const wr2Name = getRoster()["WR2"]?.name?.toLowerCase();
      const lower = name.toLowerCase();
      if (pos === "WR1" && lower === wr2Name) {
        setPendingGuess((p) => ({ ...p, WR2: name }));
        return;
      }
      if (pos === "WR2" && lower === wr1Name) {
        setPendingGuess((p) => ({ ...p, WR1: name }));
        return;
      }
    }
    setPendingGuess((p) => ({ ...p, [pos]: name }));
  };

  const share = () => {
    const text = buildShareString(challenge, solved, roundSolved);
    navigator.clipboard.writeText(text).then(() => setShared(true));
  };

  if (!loaded || !challenge) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace", color: COLORS.brownDark }}>
        Loading…
      </div>
    );
  }

  const roster = getRoster();
  const unsolved = POSITIONS.filter((p) => !solved[p]);
  const allSolved = unsolved.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.cream, fontFamily: "'Courier New', monospace", color: COLORS.brownDark }}>
      {/* Header / Scoreboard */}
      <div style={{ background: COLORS.scoreboard, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${COLORS.gold}` }}>
        <div>
          <div style={{ color: COLORS.gold, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Championship Sunday</div>
          <div style={{ color: COLORS.creamDark, fontSize: 9, letterSpacing: 1 }}>NFL Roster Challenge</div>
        </div>
        <ScoreDisplay score={score} />
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 12px" }}>

        {/* Team info card */}
        <div style={{ background: COLORS.creamDark, border: `2px solid ${COLORS.creamBorder}`, borderRadius: 4, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: "bold", letterSpacing: 1 }}>{challenge.team_name}</div>
            <div style={{ fontSize: 11, color: COLORS.brown, marginTop: 2 }}>{challenge.year} Season · {challenge.conference}</div>
            <div style={{ fontSize: 11, color: COLORS.brownDark, marginTop: 2, fontStyle: "italic" }}>{challenge.season_finish}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <RoundPips current={round - 1} />
            <div style={{ fontSize: 9, color: COLORS.brown, marginTop: 4 }}>ROUND {round} OF 5</div>
          </div>
        </div>

        {/* Football field */}
        <FootballField>
          {POSITIONS.map((pos) => (
            <PlayerToken
              key={pos}
              posKey={pos}
              label={FIELD_LAYOUT[pos].label}
              solved={!!solved[pos]}
              round={round}
              player={roster[pos]}
              active={activePos === pos}
              onClick={() => setActivePos(activePos === pos ? null : pos)}
            />
          ))}
        </FootballField>

        {/* Input panel */}
        {!gameOver && (
          <div style={{ marginTop: 14, background: COLORS.creamDark, border: `2px solid ${COLORS.creamBorder}`, borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: COLORS.brown, marginBottom: 8, textTransform: "uppercase" }}>
              {activePos ? `Guessing: ${activePos}` : "Select a position on the field"}
            </div>

            {activePos && !solved[activePos] ? (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <AutocompleteInput
                    posKey={activePos}
                    catalog={catalog}
                    onCommit={(name) => handleCommit(activePos, name)}
                    placeholder={`Type ${FIELD_LAYOUT[activePos].label} name…`}
                  />
                </div>
              </div>
            ) : activePos && solved[activePos] ? (
              <div style={{ fontSize: 12, color: COLORS.brown, fontStyle: "italic" }}>Already solved ✓</div>
            ) : null}

            {/* Unsolved slots quick-select */}
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {POSITIONS.map((pos) => (
                <button key={pos} onClick={() => !solved[pos] && setActivePos(pos)}
                  style={{
                    padding: "4px 10px", fontSize: 11, fontFamily: "'Courier New', monospace",
                    background: solved[pos] ? COLORS.gold : activePos === pos ? COLORS.brown : COLORS.cream,
                    color: solved[pos] ? COLORS.brownDark : activePos === pos ? COLORS.cream : COLORS.brownDark,
                    border: `2px solid ${COLORS.creamBorder}`, borderRadius: 3, cursor: solved[pos] ? "default" : "pointer",
                    fontWeight: activePos === pos ? "bold" : "normal",
                  }}>
                  {pos} {solved[pos] ? "✓" : pendingGuess[pos] ? "·" : ""}
                </button>
              ))}
            </div>

            {/* Submit */}
            <button onClick={submitGuess}
              disabled={Object.keys(pendingGuess).length === 0}
              style={{
                marginTop: 12, width: "100%", padding: "10px 0",
                fontFamily: "'Courier New', monospace", fontSize: 14, fontWeight: "bold",
                letterSpacing: 2, textTransform: "uppercase",
                background: Object.keys(pendingGuess).length > 0 ? COLORS.brown : COLORS.creamDark,
                color: Object.keys(pendingGuess).length > 0 ? COLORS.cream : COLORS.creamBorder,
                border: `2px solid ${COLORS.creamBorder}`, borderRadius: 3, cursor: Object.keys(pendingGuess).length > 0 ? "pointer" : "default",
              }}>
              Submit Round {round}
            </button>
          </div>
        )}

        {/* Game over panel */}
        {gameOver && (
          <div style={{ marginTop: 14, background: COLORS.scoreboard, border: `2px solid ${COLORS.gold}`, borderRadius: 4, padding: 16, textAlign: "center" }}>
            <div style={{ color: COLORS.gold, fontSize: 16, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>
              {allSolved ? "🏆 Roster Complete!" : "Game Over"}
            </div>
            <ScoreDisplay score={score} />
            <div style={{ marginTop: 12 }}>
              {POSITIONS.map((pos) => (
                <div key={pos} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid rgba(212,160,23,0.2)` }}>
                  <span style={{ color: COLORS.creamDark, fontSize: 11 }}>{pos}</span>
                  <span style={{ color: solved[pos] ? COLORS.gold : COLORS.red, fontSize: 11 }}>
                    {roster[pos]?.name} {solved[pos] ? `+${ROUND_POINTS[roundSolved[pos]]}` : "✗"}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={share} style={{ marginTop: 14, padding: "8px 24px", fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: "bold", letterSpacing: 2, background: COLORS.gold, color: COLORS.brownDark, border: "none", borderRadius: 3, cursor: "pointer" }}>
              {shared ? "Copied!" : "Share Result"}
            </button>
          </div>
        )}

        {/* Hint key */}
        <div style={{ marginTop: 14, fontSize: 9, color: COLORS.brown, letterSpacing: 1, textAlign: "center", opacity: 0.7 }}>
          R1: Team only · R2: Stats & physicals · R3: Last initial · R4: First initial · R5: First name
        </div>
      </div>
    </div>
  );
}  

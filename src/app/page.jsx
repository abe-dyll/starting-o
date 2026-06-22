"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  fieldGreen:  "#2D5016",
  fieldStripe: "#325A18",
  yardLine:    "rgba(245,240,220,0.3)",
  cream:       "#F5F0DC",
  creamDark:   "#E8E0C4",
  creamBorder: "#C8B98A",
  brown:       "#8B4513",
  brownDark:   "#5C2D0A",
  red:         "#B22222",
  green:       "#1A6B1A",
  gold:        "#D4A017",
  shadow:      "rgba(0,0,0,0.35)",
  scoreboard:  "#1A0A00",
};

const ROUND_POINTS = { 1: 1000, 2: 700, 3: 500, 4: 250, 5: 150 };
const POSITIONS    = ["WR1", "QB", "TE", "WR2", "RB"];
const REVEAL_ORDER = ["WR1", "QB", "TE", "WR2", "RB"]; // left-to-right

// ── Field layout — wide 16:7 field, RB directly under QB ─────────────────────
// Positions are in % of field width/height
const LAYOUT = {
  WR1: { left: "12%", top: "35%", label: "WR" },
  QB:  { left: "42%", top: "35%", label: "QB" },
  TE:  { left: "63%", top: "35%", label: "TE" },
  WR2: { left: "88%", top: "35%", label: "WR" },
  RB:  { left: "42%", top: "70%", label: "RB" },
};

// ── Name mask helpers ─────────────────────────────────────────────────────────
function buildMask(name, round) {
  if (!name || round < 3) return null;
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const rest  = parts.slice(1).join(" ");

  const blankLetters = (w) => {
    const clean = w.replace(/[^a-zA-Z]/g, "");
    return clean[0] + " " + Array(clean.length - 1).fill("_").join(" ");
  };
  const fullBlank = (w) => {
    const clean = w.replace(/[^a-zA-Z]/g, "");
    return Array(clean.length).fill("_").join(" ");
  };

  if (round === 3) return `${fullBlank(first)}  ${blankLetters(rest)}`;
  if (round === 4) return `${blankLetters(first)}  ${blankLetters(rest)}`;
  if (round === 5) return `${first}  ${blankLetters(rest)}`;
  return name;
}

// ── Catalog builder ───────────────────────────────────────────────────────────
function buildCatalog(teams) {
  const sets = { QB: new Set(), RB: new Set(), WR: new Set(), TE: new Set() };
  teams.forEach((t) => {
    Object.entries(t.roster).forEach(([pos, p]) => {
      const key = pos.startsWith("WR") ? "WR" : pos;
      if (sets[key]) sets[key].add(p.name);
    });
  });
  return { QB: [...sets.QB].sort(), RB: [...sets.RB].sort(), WR: [...sets.WR].sort(), TE: [...sets.TE].sort() };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function getDailyIndex(total, offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d - start) / 86400000);
  return day % total;
}

// ── Stats storage ─────────────────────────────────────────────────────────────
function loadStats() {
  try { return JSON.parse(localStorage.getItem("cs-stats") || "{}"); } catch { return {}; }
}
function saveStats(stats) {
  localStorage.setItem("cs-stats", JSON.stringify(stats));
}
function recordResult(key, score, solved) {
  const stats = loadStats();
  if (!stats[key]) {
    stats[key] = { score, solved, played: new Date().toISOString() };
    saveStats(stats);
  }
}

// ── Share string ──────────────────────────────────────────────────────────────
function buildShare(challenge, solvedMap, roundSolvedMap, score) {
  const lines = [`🏈 Starting-O`, `${challenge.team_name} · ${challenge.year}`, ``];
  ["WR1","QB","TE","WR2","RB"].forEach((pos) => {
    const r = roundSolvedMap[pos];
    const ok = solvedMap[pos];
    const em = ok ? (r===1?"🟡":r<=2?"🟢":r<=4?"🟠":"🔴") : "⬛";
    lines.push(`${pos.padEnd(3)} ${em}`);
  });
  lines.push(``, `Score: ${score}/5000`);
  return lines.join("\n");
}

// ── ScoreDisplay ──────────────────────────────────────────────────────────────
function ScoreDisplay({ score }) {
  return (
    <div style={{ fontFamily:"'Courier New',monospace", fontSize:22, color:C.gold,
      letterSpacing:4, background:C.scoreboard, padding:"3px 12px",
      borderRadius:3, border:`2px solid ${C.gold}`, display:"inline-block" }}>
      {String(score).padStart(5,"0")}
    </div>
  );
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function AutocompleteInput({ posKey, catalog, onCommit, resetSignal, usedNames=[] }) {
  const [query, setQuery]   = useState("");
  const [opts, setOpts]     = useState([]);
  const [open, setOpen]     = useState(false);
  const ref                 = useRef(null);
  const pool                = posKey.startsWith("WR") ? "WR" : posKey;

  useEffect(() => { setQuery(""); setOpts([]); setOpen(false); }, [resetSignal, posKey]);

  useEffect(() => {
    if (query.length < 2) { setOpts([]); setOpen(false); return; }
    const q = query.toLowerCase();
    const m = (catalog[pool]||[]).filter(n=>n.toLowerCase().includes(q) && !usedNames.includes(n)).slice(0,8);
    setOpts(m); setOpen(m.length>0);
  }, [query, pool, catalog]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const select = (name) => { setQuery(name); setOpen(false); onCommit(name); };

  return (
    <div ref={ref} style={{ position:"relative", width:"100%" }}>
      <input value={query} onChange={e=>setQuery(e.target.value)}
        placeholder={`Type ${pool} name…`}
        style={{ width:"100%", boxSizing:"border-box", padding:"7px 10px",
          fontFamily:"'Courier New',monospace", fontSize:13,
          background:C.cream, border:`2px solid ${C.creamBorder}`,
          borderRadius:3, color:C.brownDark, outline:"none" }} />
      {open && (
        <ul style={{ position:"absolute", zIndex:999, top:"100%", left:0, right:0,
          background:C.cream, border:`2px solid ${C.creamBorder}`, borderTop:"none",
          margin:0, padding:0, listStyle:"none", maxHeight:160, overflowY:"auto",
          borderRadius:"0 0 3px 3px" }}>
          {opts.map(name=>(
            <li key={name} onMouseDown={()=>select(name)}
              style={{ padding:"6px 10px", fontFamily:"'Courier New',monospace",
                fontSize:13, cursor:"pointer", color:C.brownDark,
                borderBottom:`1px solid ${C.creamBorder}` }}
              onMouseEnter={e=>e.currentTarget.style.background=C.creamDark}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Player token ──────────────────────────────────────────────────────────────
function PlayerToken({ posKey, player, solved, active, round, revealState, pending, skipped, lastGuess, onClick }) {
  const flashGreen = revealState === "correct";
  const flashRed   = revealState === "wrong" || revealState === "skipped";

  let bg     = C.creamDark;
  let border = `2px solid ${C.creamBorder}`;
  if (solved)     { bg = C.gold;    border = `2px solid ${C.creamBorder}`; }
  if (pending)    { bg = "#C8DCF0"; border = `3px solid #3A6EA8`; }   // blue = name staged
  if (skipped)    { bg = "#F0C8C8"; border = `3px solid ${C.red}`; }  // red = skipped
  if (active)     { bg = C.cream;   border = `3px solid ${C.brown}`; }
  if (flashGreen) { bg = "#C8F0C8"; border = `4px solid ${C.green}`; }
  if (flashRed)   { bg = "#F0C8C8"; border = `4px solid ${C.red}`; }

  const nameParts = (name) => {
    const parts = name.trim().split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") };
  };

  return (
    <div onClick={!solved ? onClick : undefined}
      style={{ position:"absolute", left:LAYOUT[posKey].left, top:LAYOUT[posKey].top,
        transform:"translate(-50%,-50%)", width:90, minHeight:82,
        background:bg, border, borderRadius:4,
        cursor:solved?"default":"pointer",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"4px 3px", boxShadow:`2px 2px 8px ${C.shadow}`,
        transition:"border 0.15s, background 0.15s", zIndex:active?10:1 }}>

      <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, fontWeight:"bold",
        color:C.brown, letterSpacing:1, marginBottom:2 }}>
        {LAYOUT[posKey].label}
      </div>

      {solved ? (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:8, fontFamily:"'Courier New',monospace", color:C.brownDark }}>#{player.jersey}</div>
          <div style={{ fontSize:10, fontFamily:"'Courier New',monospace", color:C.brownDark, fontWeight:"bold", lineHeight:1.4 }}>
            <div>{nameParts(player.name).first}</div>
            <div>{nameParts(player.name).last}</div>
          </div>
        </div>
      ) : pending ? (
        <div style={{ textAlign:"center", padding:"0 2px" }}>
          <div style={{ fontSize:9, fontFamily:"'Courier New',monospace", color:"#1A3A6A", fontWeight:"bold", lineHeight:1.4, wordBreak:"break-word" }}>
            <div>{nameParts(pending).first}</div>
            <div>{nameParts(pending).last}</div>
          </div>
        </div>
      ) : skipped ? (
        <div style={{ fontSize:8, fontFamily:"'Courier New',monospace", color:C.red, fontStyle:"italic" }}>skipped</div>
      ) : lastGuess ? (
        // Show last wrong guess faintly so they remember what they tried
        <div style={{ textAlign:"center" }}>
          {round >= 2 && player && (
            <div style={{ fontSize:7, fontFamily:"'Courier New',monospace", color:C.brownDark, lineHeight:1.4, marginBottom:2 }}>
              {round >= 3 && <div style={{ whiteSpace:"pre", letterSpacing:0.5 }}>{buildMask(player.name, round)}</div>}
              <div>#{player.jersey} · {player.height}</div>
              <div>{player.weight}lb · {player.yards}yd</div>
            </div>
          )}
          <div style={{ fontSize:7, fontFamily:"'Courier New',monospace", color:C.red, opacity:0.6, fontStyle:"italic", lineHeight:1.3 }}>
            <div>{nameParts(lastGuess).first}</div>
            <div>{nameParts(lastGuess).last}</div>
          </div>
        </div>
      ) : round >= 2 && player ? (
        <div style={{ textAlign:"center" }}>
          {round >= 3 && (
            <div style={{ fontSize:7, fontFamily:"'Courier New',monospace", color:C.brown, letterSpacing:0.5, lineHeight:1.5, whiteSpace:"pre" }}>
              {buildMask(player.name, round)}
            </div>
          )}
          <div style={{ fontSize:7, fontFamily:"'Courier New',monospace", color:C.brownDark, lineHeight:1.4, marginTop:2 }}>
            <div>#{player.jersey} · {player.height}</div>
            <div>{player.weight}lb</div>
            <div>{player.yards}yd · {player.tds}TD</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize:9, fontFamily:"'Courier New',monospace", color:C.brown, opacity:0.5 }}>?</div>
      )}
    </div>
  );
}

// ── Football field ────────────────────────────────────────────────────────────
function Field({ children }) {
  return (
    <div style={{ position:"relative", width:"100%", aspectRatio:"16/6",
      background:C.fieldGreen, borderRadius:6, border:`4px solid ${C.brown}`,
      overflow:"visible", boxShadow:`0 4px 24px ${C.shadow}` }}>
      {Array.from({length:6}).map((_,i)=>(
        <div key={i} style={{ position:"absolute", top:`${(i/6)*100}%`, left:0, right:0,
          height:`${100/6}%`, background: i%2===0 ? C.fieldGreen : C.fieldStripe }} />
      ))}
      {children}
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ teams, onClose, onSelect }) {
  const stats = loadStats();
  const entries = Object.entries(stats)
    .sort((a,b)=>new Date(b[1].played)-new Date(a[1].played))
    .slice(0,30);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:C.cream, border:`3px solid ${C.creamBorder}`, borderRadius:6,
          width:"90%", maxWidth:400, maxHeight:"80vh", overflow:"hidden",
          display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.scoreboard, padding:"10px 14px", display:"flex",
          justifyContent:"space-between", alignItems:"center",
          borderBottom:`2px solid ${C.gold}` }}>
          <span style={{ color:C.gold, fontFamily:"'Courier New',monospace", fontSize:13, letterSpacing:2 }}>HISTORY</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.gold, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ overflowY:"auto", padding:8 }}>
          {entries.length === 0 && (
            <div style={{ padding:16, fontFamily:"'Courier New',monospace", fontSize:12, color:C.brown, textAlign:"center" }}>
              No history yet. Play some games!
            </div>
          )}
          {entries.map(([key, data])=>(
            <div key={key} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", padding:"8px 10px",
              borderBottom:`1px solid ${C.creamBorder}`,
              fontFamily:"'Courier New',monospace" }}>
              <div>
                <div style={{ fontSize:11, color:C.brownDark, fontWeight:"bold" }}>{key}</div>
                <div style={{ fontSize:10, color:C.brown }}>{new Date(data.played).toLocaleDateString()}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:C.gold, fontWeight:"bold" }}>{data.score}/5000</div>
                <div style={{ fontSize:9, color:data.solved?"#1A6B1A":C.red }}>
                  {data.solved ? "✓ Complete" : "✗ Incomplete"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stats modal ───────────────────────────────────────────────────────────────
function StatsModal({ onClose }) {
  const stats = loadStats();
  const entries = Object.values(stats);
  const played  = entries.length;
  const wins    = entries.filter(e=>e.solved).length;
  const avg     = played ? Math.round(entries.reduce((s,e)=>s+e.score,0)/played) : 0;
  const best    = played ? Math.max(...entries.map(e=>e.score)) : 0;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:C.scoreboard, border:`3px solid ${C.gold}`, borderRadius:6,
          width:"85%", maxWidth:340, padding:20, textAlign:"center",
          fontFamily:"'Courier New',monospace" }}>
        <div style={{ color:C.gold, fontSize:14, letterSpacing:3, marginBottom:16 }}>YOUR STATS</div>
        {[["Played",played],["Complete",wins],["Avg Score",avg],["Best",best]].map(([l,v])=>(
          <div key={l} style={{ display:"flex", justifyContent:"space-between",
            padding:"6px 0", borderBottom:`1px solid rgba(212,160,23,0.2)` }}>
            <span style={{ color:C.creamDark, fontSize:11 }}>{l}</span>
            <span style={{ color:C.gold, fontSize:11, fontWeight:"bold" }}>{v}</span>
          </div>
        ))}
        <button onClick={onClose}
          style={{ marginTop:14, padding:"8px 24px", fontFamily:"'Courier New',monospace",
            fontSize:12, background:C.gold, color:C.brownDark,
            border:"none", borderRadius:3, cursor:"pointer", letterSpacing:2 }}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StartingO() {
  const [allTeams, setAllTeams]       = useState([]);
  const [catalog, setCatalog]         = useState({});
  const [challenge, setChallenge]     = useState(null);
  const [challengeKey, setChallengeKey] = useState("");
  const [loaded, setLoaded]           = useState(false);

  // Game state
  const [activePos, setActivePos]     = useState(null);
  const [round, setRound]             = useState(1);
  const [solved, setSolved]           = useState({});       // pos→true
  const [roundSolved, setRoundSolved] = useState({});       // pos→roundNum
  const [score, setScore]             = useState(0);
  const [gameOver, setGameOver]       = useState(false);
  const [pending, setPending]         = useState({});       // pos→name staged this round
  const [skipped, setSkipped]         = useState({});       // pos→true skipped this round
  const [lastGuesses, setLastGuesses] = useState({});       // pos->last wrong guess (shown faintly)
  const [usedNames, setUsedNames]     = useState([]);       // names removed from autocomplete

  // Reveal animation
  const [revealing, setRevealing]     = useState(false);
  const [revealStates, setRevealStates] = useState({});     // pos→"correct"|"wrong"|null
  const [roundResults, setRoundResults] = useState(null);   // results to animate

  // UI
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats]     = useState(false);
  const [shared, setShared]           = useState(false);
  const [inputReset, setInputReset]   = useState(0);

  const storageKey = (key) => `cs-game-${key}`;

  const loadTeam = useCallback((teams, teamObj, key, restoreState = true) => {
    setChallenge(teamObj);
    setChallengeKey(key);
    setActivePos(null);
    setPending({});
    setSkipped({});
    setLastGuesses({});
    setUsedNames([]);
    setRevealStates({});
    setRevealing(false);
    setRoundResults(null);
    setShared(false);
    setInputReset(r=>r+1);

    if (restoreState) {
      const saved = localStorage.getItem(storageKey(key));
      if (saved) {
        try {
          const s = JSON.parse(saved);
          setSolved(s.solved||{});
          setRoundSolved(s.roundSolved||{});
          setScore(s.score||0);
          setRound(s.round||1);
          setGameOver(s.gameOver||false);
          return;
        } catch(_) {}
      }
    }
    // Fresh game
    setSolved({});
    setRoundSolved({});
    setScore(0);
    setRound(1);
    setGameOver(false);
    setLastGuesses({});
    setUsedNames([]);
  }, []);

  useEffect(() => {
    import("../data/teams.json").then((mod) => {
      const teams = mod.default;
      setAllTeams(teams);
      setCatalog(buildCatalog(teams));
      const idx = getDailyIndex(teams.length);
      const team = teams[idx];
      const key  = team.id;
      loadTeam(teams, team, key, true);
      setLoaded(true);
    });
  }, [loadTeam]);

  // Persist game state
  useEffect(() => {
    if (!loaded || !challengeKey) return;
    localStorage.setItem(storageKey(challengeKey), JSON.stringify({ solved, roundSolved, score, round, gameOver }));
  }, [solved, roundSolved, score, round, gameOver, loaded, challengeKey]);

  const roster = challenge?.roster || {};

  const checkWR = (pos, name) => {
    const lower = name.toLowerCase();
    const wr1 = roster["WR1"]?.name?.toLowerCase();
    const wr2 = roster["WR2"]?.name?.toLowerCase();
    if (pos.startsWith("WR")) {
      if (lower === wr1) return "WR1";
      if (lower === wr2) return "WR2";
      return null;
    }
    return roster[pos]?.name?.toLowerCase() === lower ? pos : null;
  };

  const handleCommit = (pos, name) => {
    // WR cross-map
    if (pos.startsWith("WR")) {
      const wr1 = roster["WR1"]?.name?.toLowerCase();
      const wr2 = roster["WR2"]?.name?.toLowerCase();
      const lower = name.toLowerCase();
      if (lower === wr1 && !solved["WR1"]) { setPending(p=>({...p, WR1:name})); return; }
      if (lower === wr2 && !solved["WR2"]) { setPending(p=>({...p, WR2:name})); return; }
    }
    setPending(p=>({...p, [pos]:name}));
  };

  const skipPos = () => {
    if (!activePos || solved[activePos]) return;
    setSkipped(s=>({...s, [activePos]:true}));
    // Advance to next unsolved
    const remaining = POSITIONS.filter(p=>!solved[p] && p!==activePos);
    setActivePos(remaining[0]||null);
    setInputReset(r=>r+1);
  };

  const submitRound = () => {
    if (revealing) return;
    // Build results for this round
    const results = {};
    POSITIONS.forEach(pos => {
      if (solved[pos]) return;
      const name = pending[pos];
      if (!name) { results[pos] = "skip"; return; }
      const matched = checkWR(pos, name);
      results[pos] = matched ? matched : "wrong";
    });
    setRoundResults(results);
    setRevealing(true);
    setPending({});
    setSkipped({});
    setActivePos(null);
    setInputReset(r=>r+1);

    // Animate reveals left-to-right
    let delay = 0;
    const newSolved    = {...solved};
    const newRoundSolved = {...roundSolved};
    const newLastGuesses = {...lastGuesses};
    const newUsedNames   = [...usedNames];
    let addedScore = 0;

    REVEAL_ORDER.forEach((pos) => {
      if (solved[pos]) return;
      const result = results[pos];
      const guessedName = pending[pos] || null;

      setTimeout(() => {
        if (result === "skip") {
          // Skipped = red flash same as wrong
          setRevealStates(s=>({...s, [pos]:"skipped"}));
        } else if (result !== "wrong") {
          // Correct
          const matchedPos = result;
          setRevealStates(s=>({...s, [matchedPos]:"correct"}));
          if (!newSolved[matchedPos]) {
            newSolved[matchedPos] = true;
            newRoundSolved[matchedPos] = round;
            addedScore += ROUND_POINTS[round]||0;
          }
        } else {
          // Wrong — record the name they guessed, remove from autocomplete
          setRevealStates(s=>({...s, [pos]:"wrong"}));
          if (guessedName) {
            newLastGuesses[pos] = guessedName;
            if (!newUsedNames.includes(guessedName)) newUsedNames.push(guessedName);
          }
        }
      }, delay);
      delay += 600;

      // Clear flash after show
      setTimeout(() => {
        setRevealStates(s=>({...s, [pos]:null}));
      }, delay + 400);
      delay += 200;
    });

    // After all reveals, commit state
    setTimeout(() => {
      setSolved(newSolved);
      setRoundSolved(newRoundSolved);
      setScore(s => s + addedScore);
      setLastGuesses(newLastGuesses);
      setUsedNames(newUsedNames);
      setRevealing(false);
      setRevealStates({});

      const allDone = POSITIONS.every(p=>newSolved[p]);
      if (allDone || round >= 5) {
        setGameOver(true);
        const allSolved = POSITIONS.every(p=>newSolved[p]);
        recordResult(challenge?.id||challengeKey, score+addedScore, allSolved);
      } else {
        setRound(r=>r+1);
      }
    }, delay + 600);
  };

  const randomize = () => {
    if (!allTeams.length) return;
    const idx = Math.floor(Math.random()*allTeams.length);
    const team = allTeams[idx];
    loadTeam(allTeams, team, team.id, true);
  };

  const loadYesterday = () => {
    if (!allTeams.length) return;
    const idx = getDailyIndex(allTeams.length, 1);
    const team = allTeams[idx];
    loadTeam(allTeams, team, team.id, true);
  };

  const share = () => {
    const text = buildShare(challenge, solved, roundSolved, score);
    navigator.clipboard.writeText(text).then(()=>setShared(true));
  };

  if (!loaded || !challenge) {
    return (
      <div style={{ minHeight:"100vh", background:C.cream, display:"flex",
        alignItems:"center", justifyContent:"center",
        fontFamily:"'Courier New',monospace", color:C.brownDark }}>
        Loading…
      </div>
    );
  }

  const allSolved = POSITIONS.every(p=>solved[p]);
  const hasPending = Object.keys(pending).length > 0;
  const unsolvedPositions = POSITIONS.filter(p=>!solved[p]);

  return (
    <div style={{ minHeight:"100vh", background:C.cream, fontFamily:"'Courier New',monospace", color:C.brownDark }}>
      {/* Header */}
      <div style={{ background:C.scoreboard, padding:"8px 14px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        borderBottom:`3px solid ${C.gold}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ color:C.gold, fontSize:20, fontWeight:"bold", letterSpacing:3 }}>STARTING-O</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <ScoreDisplay score={score} />
          <button onClick={()=>setShowStats(true)}
            style={{ background:"none", border:`1px solid ${C.gold}`, color:C.gold,
              fontFamily:"'Courier New',monospace", fontSize:10, padding:"3px 8px",
              borderRadius:3, cursor:"pointer", letterSpacing:1 }}>
            STATS
          </button>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"12px 10px" }}>

        {/* Instructions panel */}
        <div style={{ background:C.creamDark, border:`2px solid ${C.creamBorder}`,
          borderRadius:4, padding:"10px 14px", marginBottom:8 }}>
          <div style={{ fontSize:12, color:C.brownDark, marginBottom:8, lineHeight:1.5 }}>
            You have 5 rounds to name the starting offensive skill players from these NFL divisional round winners.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4 }}>
            {[
              { r:1, text:"No hints" },
              { r:2, text:"Jersey #, Height/Weight & Key Regular Season Stats" },
              { r:3, text:"Last name initial revealed" },
              { r:4, text:"First name initial revealed" },
              { r:5, text:"Full first name revealed" },
            ].map(({r, text})=>(
              <div key={r} style={{
                background: round === r && !gameOver ? C.brown : r < round ? C.creamBorder : C.cream,
                border:`2px solid ${C.creamBorder}`, borderRadius:3, padding:"6px 6px",
                opacity: gameOver ? 0.7 : 1,
              }}>
                <div style={{ fontSize:11, fontWeight:"bold", color: round===r&&!gameOver ? C.cream : C.brown, marginBottom:3 }}>
                  Round {r}
                </div>
                <div style={{ fontSize:9, color: round===r&&!gameOver ? C.creamDark : C.brownDark, lineHeight:1.4 }}>
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team card */}
        <div style={{ background:C.creamDark, border:`2px solid ${C.creamBorder}`,
          borderRadius:4, padding:"8px 12px", marginBottom:10,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:"bold", letterSpacing:1 }}>{challenge.team_name}</div>
            <div style={{ fontSize:10, color:C.brown, marginTop:1 }}>{challenge.year} · {challenge.conference} · {challenge.season_finish}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
              {Array.from({length:5}).map((_,i)=>(
                <div key={i} style={{ width:14, height:14, borderRadius:"50%",
                  background:i<round-1?C.brown:C.creamDark,
                  border:`2px solid ${C.creamBorder}` }} />
              ))}
            </div>
            <div style={{ fontSize:11, color:C.brown, marginTop:4, fontWeight:"bold", letterSpacing:1 }}>
              {gameOver ? "GAME OVER" : `ROUND ${round} OF 5`}
            </div>
          </div>
        </div>

        {/* Field */}
        <Field>
          {POSITIONS.map(pos=>(
            <PlayerToken
              key={pos}
              posKey={pos}
              player={roster[pos]}
              solved={!!solved[pos]}
              active={activePos===pos}
              round={round}
              revealState={revealStates[pos]||null}
              pending={pending[pos]||null}
              skipped={!!skipped[pos]}
              lastGuess={lastGuesses[pos]||null}
              onClick={()=>!gameOver&&!revealing&&setActivePos(activePos===pos?null:pos)}
            />
          ))}
        </Field>

        {/* Input panel */}
        {!gameOver && !revealing && (
          <div style={{ marginTop:10, background:C.creamDark,
            border:`2px solid ${C.creamBorder}`, borderRadius:4, padding:10 }}>

            {/* Position tabs */}
            <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
              {POSITIONS.map(pos=>(
                <button key={pos} onClick={()=>!solved[pos]&&setActivePos(pos)}
                  style={{ padding:"4px 10px", fontSize:10,
                    fontFamily:"'Courier New',monospace",
                    background:solved[pos]?C.gold:pending[pos]?C.brown:activePos===pos?C.brown:C.cream,
                    color:solved[pos]?C.brownDark:pending[pos]||activePos===pos?C.cream:C.brownDark,
                    border:`2px solid ${C.creamBorder}`, borderRadius:3,
                    cursor:solved[pos]?"default":"pointer", fontWeight:"bold" }}>
                  {pos}{solved[pos]?"✓":pending[pos]?"·":""}
                </button>
              ))}
            </div>

            {/* Active input */}
            {activePos && !solved[activePos] && (
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                <div style={{ flex:1 }}>
                  <AutocompleteInput
                    key={`${activePos}-${inputReset}`}
                    posKey={activePos}
                    catalog={catalog}
                    onCommit={name=>handleCommit(activePos,name)}
                    resetSignal={inputReset}
                    usedNames={usedNames}
                  />
                </div>
                <button onClick={skipPos}
                  style={{ padding:"7px 12px", fontFamily:"'Courier New',monospace",
                    fontSize:10, background:C.cream, color:C.brown,
                    border:`2px solid ${C.creamBorder}`, borderRadius:3,
                    cursor:"pointer", whiteSpace:"nowrap", letterSpacing:1 }}>
                  SKIP
                </button>
              </div>
            )}

            {/* Submit — locked until every unsolved pos has a guess or skip */}
            {(() => {
              const unsolvedNow = POSITIONS.filter(p=>!solved[p]);
              const allFilled = unsolvedNow.every(p=>pending[p]||skipped[p]);
              return (
                <>
                  {!allFilled && (
                    <div style={{ fontSize:9, fontFamily:"'Courier New',monospace",
                      color:C.brown, textAlign:"center", marginBottom:6, opacity:0.8 }}>
                      Enter a name or skip every position to submit
                    </div>
                  )}
                  <button onClick={allFilled ? submitRound : undefined}
                    style={{ width:"100%", padding:"9px 0",
                      fontFamily:"'Courier New',monospace", fontSize:13, fontWeight:"bold",
                      letterSpacing:2, textTransform:"uppercase",
                      background:allFilled ? C.brown : C.creamDark,
                      color:allFilled ? C.cream : C.creamBorder,
                      border:`2px solid ${C.creamBorder}`, borderRadius:3,
                      cursor:allFilled?"pointer":"default",
                      opacity:allFilled?1:0.6 }}>
                    Submit Round {round}
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* Revealing overlay */}
        {revealing && (
          <div style={{ marginTop:10, background:C.creamDark,
            border:`2px solid ${C.creamBorder}`, borderRadius:4, padding:10,
            textAlign:"center", fontFamily:"'Courier New',monospace",
            fontSize:13, color:C.brown, letterSpacing:2 }}>
            REVEALING…
          </div>
        )}

        {/* Game over */}
        {gameOver && (
          <div style={{ marginTop:10, background:C.scoreboard,
            border:`2px solid ${C.gold}`, borderRadius:4, padding:14, textAlign:"center" }}>
            <div style={{ color:C.gold, fontSize:14, letterSpacing:3, marginBottom:8 }}>
              {allSolved?"🏆 ROSTER COMPLETE":"GAME OVER"}
            </div>
            <ScoreDisplay score={score} />
            <div style={{ marginTop:10 }}>
              {POSITIONS.map(pos=>(
                <div key={pos} style={{ display:"flex", justifyContent:"space-between",
                  padding:"4px 0", borderBottom:`1px solid rgba(212,160,23,0.15)` }}>
                  <span style={{ color:C.creamDark, fontSize:10 }}>{pos}</span>
                  <span style={{ color:solved[pos]?C.gold:C.red, fontSize:10 }}>
                    {roster[pos]?.name} {solved[pos]?`+${ROUND_POINTS[roundSolved[pos]]}pts`:"✗"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={share}
                style={{ padding:"7px 18px", fontFamily:"'Courier New',monospace",
                  fontSize:11, fontWeight:"bold", letterSpacing:2,
                  background:C.gold, color:C.brownDark, border:"none",
                  borderRadius:3, cursor:"pointer" }}>
                {shared?"COPIED!":"SHARE"}
              </button>
              <button onClick={randomize}
                style={{ padding:"7px 18px", fontFamily:"'Courier New',monospace",
                  fontSize:11, fontWeight:"bold", letterSpacing:2,
                  background:C.brown, color:C.cream,
                  border:`2px solid ${C.gold}`, borderRadius:3, cursor:"pointer" }}>
                RANDOM TEAM
              </button>
              <button onClick={loadYesterday}
                style={{ padding:"7px 18px", fontFamily:"'Courier New',monospace",
                  fontSize:11, fontWeight:"bold", letterSpacing:2,
                  background:"none", color:C.creamDark,
                  border:`2px solid ${C.creamBorder}`, borderRadius:3, cursor:"pointer" }}>
                YESTERDAY
              </button>
              <button onClick={()=>setShowHistory(true)}
                style={{ padding:"7px 18px", fontFamily:"'Courier New',monospace",
                  fontSize:11, fontWeight:"bold", letterSpacing:2,
                  background:"none", color:C.creamDark,
                  border:`2px solid ${C.creamBorder}`, borderRadius:3, cursor:"pointer" }}>
                HISTORY
              </button>
            </div>
          </div>
        )}
      </div>

      {showHistory && <HistoryPanel teams={allTeams} onClose={()=>setShowHistory(false)} />}
      {showStats    && <StatsModal onClose={()=>setShowStats(false)} />}
    </div>
  );
}

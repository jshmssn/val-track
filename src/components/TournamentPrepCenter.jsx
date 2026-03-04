import { useEffect, useMemo, useState } from "react";

const PREP_KEY = "val_track_tournament_prep_v1";
const BASE_CHECKLIST = [
  "Review latest 5 opponent VODs",
  "Finalize map veto order",
  "Lock pistol plans",
  "Assign timeout caller priorities",
  "Share pre-match brief to players",
];

const EMPTY_BOARD = {
  opponent: "",
  eventName: "",
  format: "BO3",
  matchDate: "",
  focusMaps: [],
  winConditions: "",
  dangerList: "",
  notes: "",
  checklist: BASE_CHECKLIST.map((label) => ({ label, done: false })),
  mapRatings: {},
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readBoards() {
  try {
    const raw = window.localStorage.getItem(PREP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeBoards(boards) {
  window.localStorage.setItem(PREP_KEY, JSON.stringify(boards));
}

function normalizeBoard(board) {
  return {
    ...EMPTY_BOARD,
    ...board,
    focusMaps: Array.isArray(board?.focusMaps) ? board.focusMaps : [],
    checklist: Array.isArray(board?.checklist) && board.checklist.length
      ? board.checklist
      : EMPTY_BOARD.checklist,
    mapRatings: board?.mapRatings && typeof board.mapRatings === "object" ? board.mapRatings : {},
  };
}

function getMapAdvice(board, mapPool) {
  const scored = mapPool.map((map) => {
    const pair = board?.mapRatings?.[map] || { us: 3, opp: 3 };
    return { map, us: Number(pair.us) || 3, opp: Number(pair.opp) || 3 };
  });
  if (!scored.length) return { bestPick: "-", bestBan: "-" };
  const bestPick = [...scored].sort((a, b) => (b.us - b.opp) - (a.us - a.opp))[0]?.map || "-";
  const bestBan = [...scored].sort((a, b) => (b.opp - b.us) - (a.opp - a.us))[0]?.map || "-";
  return { bestPick, bestBan };
}

export function TournamentPrepCenter({ matches = [], mapNames = [] }) {
  const [boards, setBoards] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [newOpponent, setNewOpponent] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const mapPool = useMemo(() => {
    const fromMatches = new Set((matches || []).map((m) => m.map).filter(Boolean));
    const fromRef = new Set((mapNames || []).filter(Boolean));
    return [...new Set([...fromRef, ...fromMatches])];
  }, [matches, mapNames]);

  useEffect(() => {
    const saved = readBoards().map(normalizeBoard);
    setBoards(saved);
    if (saved.length) setSelectedId(saved[0].id);
  }, []);

  const selected = useMemo(
    () => boards.find((b) => b.id === selectedId) || null,
    [boards, selectedId],
  );

  const prepStats = useMemo(() => {
    const total = boards.length;
    const ready = boards.filter((b) => (b.checklist || []).every((x) => x.done)).length;
    return { total, ready };
  }, [boards]);

  function persist(next) {
    setBoards(next);
    writeBoards(next);
  }

  function addBoard() {
    const opponent = newOpponent.trim();
    if (!opponent) return;
    const next = [
      normalizeBoard({
        id: uid("prep"),
        opponent,
        eventName: newEvent.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      ...boards,
    ];
    persist(next);
    setSelectedId(next[0].id);
    setNewOpponent("");
    setNewEvent("");
  }

  function updateSelected(patch) {
    if (!selected) return;
    const next = boards.map((b) =>
      b.id === selected.id
        ? { ...b, ...patch, updatedAt: new Date().toISOString() }
        : b,
    );
    persist(next);
  }

  function removeSelected() {
    if (!selected) return;
    const next = boards.filter((b) => b.id !== selected.id);
    persist(next);
    setSelectedId(next[0]?.id || "");
  }

  function toggleChecklist(idx) {
    if (!selected) return;
    const nextChecklist = selected.checklist.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item,
    );
    updateSelected({ checklist: nextChecklist });
  }

  function updateMapRating(map, side, value) {
    if (!selected) return;
    const current = selected.mapRatings?.[map] || { us: 3, opp: 3 };
    updateSelected({
      mapRatings: {
        ...selected.mapRatings,
        [map]: { ...current, [side]: Number(value) || 1 },
      },
    });
  }

  async function copyBrief() {
    if (!selected) return;
    const advice = getMapAdvice(selected, mapPool);
    const checklist = selected.checklist
      .map((item) => `- [${item.done ? "x" : " "}] ${item.label}`)
      .join("\n");
    const brief = [
      `Opponent: ${selected.opponent || "-"}`,
      `Event: ${selected.eventName || "-"}`,
      `Format: ${selected.format || "-"}`,
      `Date: ${selected.matchDate || "-"}`,
      `Recommended Pick: ${advice.bestPick}`,
      `Recommended Ban: ${advice.bestBan}`,
      "",
      "Win Conditions:",
      selected.winConditions || "-",
      "",
      "Danger List:",
      selected.dangerList || "-",
      "",
      "Match Checklist:",
      checklist || "-",
      "",
      "Notes:",
      selected.notes || "-",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(brief);
      setCopyStatus("Prep brief copied");
      window.setTimeout(() => setCopyStatus(""), 1600);
    } catch (_) {
      setCopyStatus("Clipboard blocked");
      window.setTimeout(() => setCopyStatus(""), 1600);
    }
  }

  const advice = getMapAdvice(selected, mapPool);

  return (
    <div className="prep-layout">
      <div className="prep-summary">
        <article className="prep-card">
          <p>Prep Boards</p>
          <strong>{prepStats.total}</strong>
        </article>
        <article className="prep-card">
          <p>Ready to Play</p>
          <strong>{prepStats.ready}</strong>
        </article>
        <article className="prep-card">
          <p>Map Pool Size</p>
          <strong>{mapPool.length}</strong>
        </article>
      </div>

      <section className="prep-create">
        <h3>Create Opponent Prep</h3>
        <div className="prep-create-grid">
          <input
            className="playbook-input"
            placeholder="Opponent name"
            value={newOpponent}
            onChange={(e) => setNewOpponent(e.target.value)}
          />
          <input
            className="playbook-input"
            placeholder="Event / tournament"
            value={newEvent}
            onChange={(e) => setNewEvent(e.target.value)}
          />
          <button className="add-btn" onClick={addBoard} disabled={!newOpponent.trim()}>
            Create Board
          </button>
        </div>
      </section>

      <section className="prep-content">
        <div className="prep-list">
          {boards.map((board) => (
            <button
              key={board.id}
              className={`playbook-list-item${board.id === selectedId ? " active" : ""}`}
              onClick={() => setSelectedId(board.id)}
            >
              <strong>{board.opponent || "Unknown Opponent"}</strong>
              <span>{board.eventName || "No event"} | {board.format}</span>
            </button>
          ))}
          {!boards.length && <div className="empty-state">No prep boards yet</div>}
        </div>

        <div className="prep-editor">
          {!selected && <div className="empty-state">Select a prep board to edit</div>}
          {selected && (
            <>
              <div className="playbook-grid">
                <input
                  className="playbook-input"
                  value={selected.opponent}
                  onChange={(e) => updateSelected({ opponent: e.target.value })}
                />
                <input
                  className="playbook-input"
                  value={selected.eventName}
                  onChange={(e) => updateSelected({ eventName: e.target.value })}
                />
                <select
                  className="playbook-input"
                  value={selected.format}
                  onChange={(e) => updateSelected({ format: e.target.value })}
                >
                  {["BO1", "BO3", "BO5"].map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
                <input
                  className="playbook-input"
                  type="date"
                  value={selected.matchDate || ""}
                  onChange={(e) => updateSelected({ matchDate: e.target.value })}
                />
              </div>

              <div className="prep-advice">
                <span>Recommended Pick: <strong>{advice.bestPick}</strong></span>
                <span>Recommended Ban: <strong>{advice.bestBan}</strong></span>
              </div>

              <div className="prep-veto-grid">
                {mapPool.map((map) => {
                  const pair = selected.mapRatings?.[map] || { us: 3, opp: 3 };
                  return (
                    <div className="prep-veto-card" key={map}>
                      <div className="prep-veto-map">{map}</div>
                      <label>
                        Us
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={pair.us}
                          onChange={(e) => updateMapRating(map, "us", e.target.value)}
                        />
                      </label>
                      <label>
                        Opp
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={pair.opp}
                          onChange={(e) => updateMapRating(map, "opp", e.target.value)}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <textarea
                className="playbook-textarea"
                rows={3}
                placeholder="Win conditions"
                value={selected.winConditions}
                onChange={(e) => updateSelected({ winConditions: e.target.value })}
              />
              <textarea
                className="playbook-textarea"
                rows={3}
                placeholder="Danger list / opponent strengths"
                value={selected.dangerList}
                onChange={(e) => updateSelected({ dangerList: e.target.value })}
              />
              <textarea
                className="playbook-textarea"
                rows={3}
                placeholder="Additional notes"
                value={selected.notes}
                onChange={(e) => updateSelected({ notes: e.target.value })}
              />

              <div className="prep-checklist">
                {(selected.checklist || []).map((item, idx) => (
                  <label key={`${item.label}_${idx}`} className="prep-check-item">
                    <input
                      type="checkbox"
                      checked={Boolean(item.done)}
                      onChange={() => toggleChecklist(idx)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="playbook-actions">
                <button className="add-btn" onClick={copyBrief}>
                  Copy Prep Brief
                </button>
                <button className="filter-reset" onClick={removeSelected}>
                  Delete Board
                </button>
                {copyStatus && <span className="prep-copy-status">{copyStatus}</span>}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

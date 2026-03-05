import { avg, fmt, classifyPlayer } from "../utils/statsHelpers";

export function PlayerCard({
  player,
  matches,
  row = null,
  matchMeta = null,
  noteText = "",
  onNoteClick = null,
}) {
  const rows = row
    ? [row]
    : matches.flatMap((m) =>
        (m.playerStats || []).filter((ps) => ps.player === player),
      );
  if (rows.length === 0) return null;

  const isPerMatchCard = !!row && !!matchMeta;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const stats = {
    acs: avg(rows.map((r) => num(r.acs))),
    kd: avg(rows.map((r) => num(r.kd))),
    kills: avg(rows.map((r) => num(r.kills))),
    deaths: avg(rows.map((r) => num(r.deaths))),
    assists: avg(rows.map((r) => num(r.assists))),
    fb: avg(rows.map((r) => num(r.fb))),
  };
  const agents = [...new Set(rows.map((r) => r.agent))];
  const subTitle = isPerMatchCard
    ? rows[0]?.agent || "-"
    : `${agents.slice(0, 3).join(" | ")}${agents.length > 3 ? ` +${agents.length - 3}` : ""}`;
  const tag = classifyPlayer(stats);

  const chips = [
    { label: "ACS", val: fmt(stats.acs), hi: stats.acs >= 250, warn: false },
    {
      label: "K/D",
      val: fmt(stats.kd, 2),
      hi: stats.kd >= 1.2,
      warn: stats.kd < 0.9,
    },
    { label: "KILLS", val: fmt(stats.kills), hi: false, warn: false },
    { label: "DEATHS", val: fmt(stats.deaths), hi: false, warn: false },
    { label: "ASSISTS", val: fmt(stats.assists), hi: false, warn: false },
    { label: "FB", val: fmt(stats.fb), hi: false, warn: false },
  ];
  const lastRowStart = Math.floor((chips.length - 1) / 3) * 3;

  const tagColors = {
    "TOP PERFORMER": {
      bg: "rgba(16,185,129,0.12)",
      color: "var(--emerald)",
      border: "rgba(16,185,129,0.3)",
    },
    "NEEDS IMPROVEMENT": {
      bg: "rgba(232,37,60,0.12)",
      color: "var(--red)",
      border: "rgba(232,37,60,0.3)",
    },
    STABLE: {
      bg: "rgba(245,158,11,0.12)",
      color: "var(--amber)",
      border: "rgba(245,158,11,0.3)",
    },
  };
  const tc = tagColors[tag.label] || tagColors.STABLE;
  const handleNoteClick = () => {
    if (!onNoteClick) return;
    onNoteClick({
      matchId: matchMeta?.id,
      playerId: row?.playerId,
      player,
      currentNote: noteText,
    });
  };

  return (
    <div className="player-card">
      <div className="player-card-head">
        <div>
          <div className="player-name">{player}</div>
          <div className="player-agents">{subTitle}</div>
        </div>
        <div className="player-card-head-actions">
          <button
            type="button"
            className={`player-note-btn${noteText ? " has-note" : ""}`}
            onClick={handleNoteClick}
            title={noteText ? "View/Edit note" : "Add note"}
            aria-label={noteText ? "View or edit player note" : "Add player note"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20h4l10-10-4-4L4 16v4z" />
              <path d="M12 6l4 4" />
            </svg>
          </button>
          <span
            className="player-tag"
            style={{ background: tc.bg, color: tc.color, borderColor: tc.border }}
          >
            {tag.label}
          </span>
        </div>
      </div>

      <div className="player-stats-grid">
        {chips.map((c, idx) => (
          <div
            key={c.label}
            className={`stat-cell${(idx + 1) % 3 === 0 || idx === chips.length - 1 ? " no-right" : ""}${idx >= lastRowStart ? " no-bottom" : ""}`}
          >
            <div
              className="stat-val"
              style={{
                color: c.hi ? "var(--emerald)" : c.warn ? "var(--red)" : "var(--text)",
              }}
            >
              <span
                style={{
                  fontSize: c.compact ? 13 : undefined,
                  letterSpacing: c.compact ? "0.02em" : undefined,
                }}
              >
                {c.val}
              </span>
            </div>
            <div className="stat-lbl">{c.label}</div>
          </div>
        ))}
      </div>

      {noteText && (
        <button
          type="button"
          className="player-note-preview"
          onClick={handleNoteClick}
          title="View/Edit note"
        >
          NOTE: {noteText}
        </button>
      )}

      {!isPerMatchCard && (
        <div className="player-footer">
          {`${rows.length} match${rows.length !== 1 ? "es" : ""} played`}
        </div>
      )}
    </div>
  );
}


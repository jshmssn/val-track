// ============================================================
// src/components/AIUploadModal.jsx
//
// • Full-screen drag-and-drop overlay (whole page is the drop target)
// • Multi-file queue — add multiple screenshots at once
// • Clipboard paste support (Ctrl+V / ⌘V)
// • Per-file AI extraction with individual status tracking
// • Review each extracted match in MatchForm before saving
// • Merges Scoreboard (player stats) + Timeline (team metrics) for full data
// ============================================================
import { useState, useRef, useCallback, useEffect } from "react";
import { styles, C } from "../styles/tokens";
import { aiApi } from "../api/matchesApi";
import { MatchForm } from "./MatchForm";

const ACCEPTED = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.txt";
const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// ── Styles ────────────────────────────────────────────────────
const S = {
  overlay: (globalDrag) => ({
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: globalDrag ? "rgba(180,0,0,0.18)" : "rgba(0,0,0,0.82)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s ease",
    outline: globalDrag ? `3px dashed ${C.red}` : "none",
    outlineOffset: -6,
  }),
  globalDropHint: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    gap: 12,
  },
  globalDropIcon: {
    fontSize: 64,
    filter: "drop-shadow(0 0 24px rgba(255,60,60,0.7))",
  },
  globalDropText: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 3,
    color: "#fff",
    textShadow: "0 2px 16px rgba(255,60,60,0.8)",
  },
  globalDropSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 2,
  },
  modal: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    width: 580,
    maxWidth: "95vw",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "inherit",
    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
    position: "relative",
    zIndex: 1001,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    borderBottom: `1px solid ${C.border}`,
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: C.textPrimary,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    background: C.red,
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 2,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: 700,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: C.textMuted,
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
  },
  body: { padding: 24, overflowY: "auto", flexGrow: 1 },
  dropZone: {
    border: `2px dashed ${C.borderBright}`,
    borderRadius: 4,
    padding: "28px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  dropIcon: { fontSize: 30, marginBottom: 10, color: C.textMuted },
  dropText: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  dropSub: { fontSize: 10, color: C.textMuted, letterSpacing: 1 },
  dropPaste: { fontSize: 10, color: C.red, letterSpacing: 1, marginTop: 6 },
  queueList: {
    marginTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  queueItem: (status) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: C.surfaceAlt,
    border: `1px solid ${
      status === "done"
        ? "#00c864"
        : status === "error"
          ? C.red
          : status === "loading"
            ? C.red
            : C.border
    }`,
    borderRadius: 4,
    padding: "10px 14px",
    transition: "border-color 0.2s",
  }),
  queueIcon: { fontSize: 20, flexShrink: 0 },
  queueInfo: { flexGrow: 1, minWidth: 0 },
  queueName: {
    fontSize: 12,
    color: C.textPrimary,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  queueMeta: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  queueStatus: (status) => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    flexShrink: 0,
    color:
      status === "done"
        ? "#00c864"
        : status === "error"
          ? C.red
          : status === "loading"
            ? C.red
            : C.textMuted,
  }),
  queueRemove: {
    background: "none",
    border: "none",
    color: C.textMuted,
    cursor: "pointer",
    fontSize: 14,
    padding: "0 2px",
    flexShrink: 0,
  },
  queueReview: {
    ...styles.primaryBtn,
    fontSize: 9,
    padding: "4px 10px",
    letterSpacing: 1,
    flexShrink: 0,
  },
  queueExtract: {
    ...styles.secondaryBtn,
    fontSize: 9,
    padding: "4px 10px",
    letterSpacing: 1,
    flexShrink: 0,
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderTop: `1px solid ${C.border}`,
    flexShrink: 0,
  },
  actionRight: { display: "flex", gap: 10 },
  primaryBtn: { ...styles.primaryBtn },
  secondaryBtn: { ...styles.secondaryBtn },
  spinner: {
    display: "inline-block",
    fontSize: 14,
    color: C.red,
    animation: "spin 1s linear infinite",
  },
  queueCount: { fontSize: 11, color: C.textMuted },
};

// ── Helpers ───────────────────────────────────────────────────
function fileIcon(file) {
  if (!file) return "📄";
  if (file.type.startsWith("image/")) return "🖼️";
  if (file.type === "application/pdf") return "📕";
  if (file.type.includes("word")) return "📝";
  return "📄";
}
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Component ─────────────────────────────────────────────────
export function AIUploadModal({ matchType, dispatch, onClose, refData }) {
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]); // always reflects latest queue without stale closure
  const [globalDrag, setGlobalDrag] = useState(false);

  // Keep queueRef in sync so extractItem can read fresh state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const [reviewItem, setReviewItem] = useState(null);
  const inputRef = useRef();
  const dragCount = useRef(0);

  // ── Add files to queue ──────────────────────────────────────
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList)
      .filter(
        (f) =>
          ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(doc|docx|txt)$/i),
      )
      .map((f) => ({
        id: uid(),
        file: f,
        status: "idle",
        extracted: null,
        error: "",
      }));
    if (!incoming.length) return;
    setQueue((q) => [...q, ...incoming]);
  }, []);

  const removeItem = (id) => setQueue((q) => q.filter((i) => i.id !== id));

  // ── Full-screen drag events bound to the overlay ────────────
  const onOverlayDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCount.current += 1;
    setGlobalDrag(true);
  }, []);

  const onOverlayDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCount.current -= 1;
    if (dragCount.current <= 0) {
      dragCount.current = 0;
      setGlobalDrag(false);
    }
  }, []);

  const onOverlayDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const onOverlayDrop = useCallback(
    (e) => {
      e.preventDefault();
      dragCount.current = 0;
      setGlobalDrag(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // ── Clipboard paste ─────────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split("/")[1] || "png";
            imgs.push(
              new File([blob], `pasted-${Date.now()}.${ext}`, {
                type: item.type,
              }),
            );
          }
        }
      }
      if (imgs.length) addFiles(imgs);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  // ── Extract a single item ───────────────────────────────────
  const extractItem = useCallback(
    async (id) => {
      setQueue((q) =>
        q.map((i) =>
          i.id === id ? { ...i, status: "loading", error: "" } : i,
        ),
      );
      try {
        const item = queueRef.current.find((i) => i.id === id);

        // If there is already a completed Timeline in the queue, pass its
        // playerAgentMap to the backend when extracting a Scoreboard.
        // The backend will use those names as authoritative — finding each
        // player's stats by name rather than by teal row colour.
        const timelineDone = queueRef.current.find(
          (i) =>
            i.id !== id &&
            i.status === "done" &&
            (i.extracted?.screenshotType === "timeline" ||
              (i.playerAgentMap && i.playerAgentMap.length > 0)),
        );
        const pamToSend =
          timelineDone?.playerAgentMap ||
          timelineDone?.extracted?.playerAgentMap ||
          null;

        const result = await aiApi.extract(item.file, matchType, pamToSend);
        setQueue((q) =>
          q.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status: "done",
                  extracted: result.extracted,
                  playerAgentMap:
                    result.playerAgentMap ||
                    result.extracted?.playerAgentMap ||
                    [],
                }
              : i,
          ),
        );
      } catch (err) {
        setQueue((q) =>
          q.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status: "error",
                  error: err.message || "Extraction failed",
                }
              : i,
          ),
        );
      }
    },
    [queue, matchType],
  );

  // Extract all pending/errored items — Timeline FIRST, then Scoreboard.
  // This is critical: the scoreboard extraction needs the Timeline's
  // playerAgentMap to filter out enemy players. If we fire both at once,
  // the scoreboard request runs before Timeline is done and gets no PAM,
  // so the model dumps all 10 rows including the red team.
  const extractAll = useCallback(async () => {
    const pending = queue.filter(
      (i) => i.status === "idle" || i.status === "error",
    );

    // Sort: already-detected timeline items first, then unknowns.
    // For items not yet extracted (no screenshotType), we do a quick
    // tab detection pass first, then re-sort. For simplicity: if a queue
    // item was previously extracted as timeline (e.g. retry), put it first;
    // otherwise run them in order and rely on sequential execution —
    // the second file waits for the first, so if the user uploads
    // Timeline before Scoreboard it will naturally be processed first.
    const sorted = [
      ...pending.filter((i) => i.extracted?.screenshotType === "timeline"),
      ...pending.filter((i) => i.extracted?.screenshotType !== "timeline"),
    ];

    for (const item of sorted) {
      await extractItem(item.id);
    }
  }, [queue, extractItem]);

  const pendingCount = queue.filter(
    (i) => i.status === "idle" || i.status === "error",
  ).length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const loadingCount = queue.filter((i) => i.status === "loading").length;

  // ── Detect if we have both tab types done ──────────────────
  const doneTimeline = queue.find(
    (i) =>
      i.status === "done" &&
      (i.extracted?.screenshotType === "timeline" ||
        (i.playerAgentMap && i.playerAgentMap.length > 0) ||
        (i.extracted?.playerAgentMap && i.extracted.playerAgentMap.length > 0)),
  );
  const doneScoreboard = queue.find(
    (i) => i.status === "done" && i.extracted?.screenshotType === "scoreboard",
  );
  const hasTimeline = !!doneTimeline;
  const hasScoreboard = !!doneScoreboard;
  const playerAgentCount = (
    doneTimeline?.playerAgentMap ||
    doneTimeline?.extracted?.playerAgentMap ||
    []
  ).length;
  const normalizePlayerKey = (name) =>
    (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Merge Timeline team metrics + agent names into Scoreboard extracted data
  const mergeAndReview = () => {
    if (!doneTimeline || !doneScoreboard) return;

    // playerAgentMap is stored at the top level of the queue item (from API response)
    // It is also embedded inside extracted.playerAgentMap as a fallback
    const playerAgentMap =
      doneTimeline.playerAgentMap ||
      doneTimeline.extracted?.playerAgentMap ||
      [];

    if (playerAgentMap.length === 0) {
      alert(
        "⚠️ Agent names could not be read from the Timeline screenshot.\n\n" +
          "Tips:\n" +
          "• Make sure a round is selected/clicked in the timeline — the player panel below must be visible\n" +
          "• The panel must show teal rows with player names and agent names beneath them (e.g. 'Flux' then 'Killjoy' below it)\n" +
          "• Try re-uploading the Timeline screenshot and extracting again",
      );
      return;
    }

    // Build a player→agent lookup from Timeline's playerAgentMap (most reliable source)
    const timelineAgentMap = {};
    playerAgentMap.forEach(({ player, agent }) => {
      if (player && agent) {
        timelineAgentMap[normalizePlayerKey(player)] = agent;
      }
    });

    // Apply Timeline agent overrides to Scoreboard player stats
    const correctedPlayerStats = (
      doneScoreboard.extracted.playerStats || []
    ).map((p) => {
      const key = normalizePlayerKey(p.player);
      const timelineAgent = timelineAgentMap[key];
      if (timelineAgent) {
        return { ...p, agent: timelineAgent };
      }
      return p;
    });

    const merged = {
      ...doneScoreboard.extracted,
      // Use Timeline-corrected player stats (accurate agents)
      playerStats: correctedPlayerStats,
      // Timeline has the most accurate team metrics — override scoreboard's
      teamMetrics: {
        ...doneScoreboard.extracted.teamMetrics,
        ...doneTimeline.extracted.teamMetrics,
      },
      // Prefer Scoreboard for top-level fields, fall back to Timeline
      date: doneScoreboard.extracted.date || doneTimeline.extracted.date,
      map: doneScoreboard.extracted.map || doneTimeline.extracted.map,
      result: doneScoreboard.extracted.result || doneTimeline.extracted.result,
      score: doneScoreboard.extracted.score || doneTimeline.extracted.score,
      // Carry over round-by-round breakdown from Timeline
      rounds: doneTimeline.extracted.rounds || null,
    };
    setReviewItem({ extracted: merged, _merged: true });
  };

  // ── Review a completed item in MatchForm ────────────────────
  if (reviewItem) {
    return (
      <MatchForm
        dispatch={dispatch}
        onClose={() => setReviewItem(null)}
        prefill={reviewItem.extracted}
        refData={refData}
      />
    );
  }

  return (
    <div
      style={S.overlay(globalDrag)}
      onDragEnter={onOverlayDragEnter}
      onDragLeave={onOverlayDragLeave}
      onDragOver={onOverlayDragOver}
      onDrop={onOverlayDrop}
    >
      {/* ── Full-screen drop hint ─────────────────────────── */}
      {globalDrag && (
        <div style={S.globalDropHint}>
          <div style={S.globalDropIcon}>📂</div>
          <div style={S.globalDropText}>DROP FILES ANYWHERE</div>
          <div style={S.globalDropSub}>PNG · JPG · WEBP · PDF · DOC · TXT</div>
        </div>
      )}

      {/* ── Modal card ───────────────────────────────────── */}
      {!globalDrag && (
        <div style={S.modal} onDragEnter={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={S.header}>
            <div style={S.title}>
              <span style={{ color: C.red }}>✦</span>
              AI MATCH IMPORT
              <span style={S.badge}>{matchType.toUpperCase()}</span>
            </div>
            <button style={S.closeBtn} onClick={onClose}>
              ✕
            </button>
          </div>

          <div style={S.body}>
            {/* Inner drop zone — click to browse */}
            <div style={S.dropZone} onClick={() => inputRef.current?.click()}>
              <div style={S.dropIcon}>📂</div>
              <div style={S.dropText}>
                Click to browse · Drag files anywhere on screen · Paste a
                screenshot
              </div>
              <div style={S.dropSub}>
                PNG · JPG · WEBP · PDF · DOC · DOCX · TXT
              </div>
              <div style={S.dropPaste}>
                ⌘V / CTRL+V TO PASTE &nbsp;·&nbsp; DRAG ANYWHERE TO DROP
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                style={{ display: "none" }}
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {/* File queue */}
            {queue.length > 0 && (
              <div style={S.queueList}>
                {queue.map((item) => (
                  <div key={item.id} style={S.queueItem(item.status)}>
                    <span style={S.queueIcon}>{fileIcon(item.file)}</span>

                    <div style={S.queueInfo}>
                      <div style={S.queueName}>
                        {item.file.name}
                        {item.status === "done" &&
                          item.extracted?.screenshotType && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: 1,
                                padding: "1px 6px",
                                borderRadius: 2,
                                background:
                                  item.extracted.screenshotType === "timeline"
                                    ? "#2d1a5c"
                                    : "#1a3a5c",
                                color:
                                  item.extracted.screenshotType === "timeline"
                                    ? "#c084fc"
                                    : "#4fc3f7",
                              }}
                            >
                              {item.extracted.screenshotType.toUpperCase()}
                            </span>
                          )}
                      </div>
                      <div style={S.queueMeta}>
                        {formatBytes(item.file.size)}
                        {item.status === "done" && item.extracted && (
                          <>
                            {" "}
                            · {item.extracted.map || "?"} ·{" "}
                            {item.extracted.result || "?"}{" "}
                            {item.extracted.score || ""}
                          </>
                        )}
                        {item.status === "error" && (
                          <span style={{ color: C.red }}> · {item.error}</span>
                        )}
                      </div>
                    </div>

                    {/* Status indicator */}
                    <span style={S.queueStatus(item.status)}>
                      {item.status === "idle" && "PENDING"}
                      {item.status === "loading" && (
                        <span style={S.spinner}>▲</span>
                      )}
                      {item.status === "done" && "✓ DONE"}
                      {item.status === "error" && "✕ ERROR"}
                    </span>

                    {/* Per-item actions */}
                    {item.status === "done" &&
                      item.extracted?.screenshotType === "timeline" && (
                        <button
                          style={S.queueReview}
                          onClick={() => {
                            // Merge playerAgentMap into extracted so MatchForm can seed player rows
                            const pam =
                              item.playerAgentMap ||
                              item.extracted?.playerAgentMap ||
                              [];
                            setReviewItem({
                              ...item,
                              extracted: {
                                ...item.extracted,
                                playerAgentMap: pam,
                              },
                            });
                          }}
                        >
                          REVIEW →
                        </button>
                      )}
                    {item.status === "done" &&
                      item.extracted?.screenshotType === "scoreboard" &&
                      !hasTimeline && (
                        <span
                          style={{
                            fontSize: 9,
                            color: C.textMuted,
                            letterSpacing: 1,
                            flexShrink: 0,
                          }}
                          title="Upload a Timeline screenshot too — agents are read from there"
                        >
                          + TIMELINE NEEDED
                        </span>
                      )}
                    {/* {(item.status === "idle" || item.status === "error") && (
                      <button
                        style={S.queueExtract}
                        onClick={() => extractItem(item.id)}
                      >
                        EXTRACT
                      </button>
                    )} */}

                    {item.status !== "loading" && (
                      <button
                        style={S.queueRemove}
                        onClick={() => removeItem(item.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={S.actions}>
            <span style={S.queueCount}>
              {queue.length === 0
                ? "Upload a Scoreboard + Timeline screenshot to import a match"
                : hasTimeline && hasScoreboard
                  ? `✓ Ready — agents from Timeline · ${playerAgentCount} mapped`
                  : hasScoreboard && !hasTimeline
                    ? "⚠ Also upload a Timeline screenshot to get correct agent names"
                    : hasTimeline && !hasScoreboard
                      ? "⚠ Also upload a Scoreboard screenshot for player stats"
                      : `${queue.length} file${queue.length !== 1 ? "s" : ""} · ${doneCount} done${loadingCount > 0 ? ` · ${loadingCount} processing…` : ""}`}
            </span>
            <div style={S.actionRight}>
              <button style={S.secondaryBtn} onClick={onClose}>
                Close
              </button>
              {pendingCount > 0 && (
                <button
                  style={{
                    ...S.primaryBtn,
                    opacity: loadingCount > 0 ? 0.6 : 1,
                  }}
                  disabled={loadingCount > 0}
                  onClick={extractAll}
                >
                  {loadingCount > 0
                    ? "ANALYZING…"
                    : `✦ EXTRACT ${pendingCount > 1 ? `ALL ${pendingCount}` : ""}`}
                </button>
              )}
              {/* Show Merge button when both a summary and scoreboard are done */}
              {hasTimeline && hasScoreboard && (
                <button style={S.primaryBtn} onClick={mergeAndReview}>
                  ✦ REVIEW →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// src/components/MatchStatsModal.jsx
import { C, styles } from "../styles/tokens";

function getKdColor(kills, deaths) {
  const kd = deaths > 0 ? kills / deaths : kills;
  if (kd >= 1.5) return C.green;
  if (kd >= 1.1) return C.teal;
  if (kd >= 0.9) return C.gold;
  return C.red;
}

export function MatchStatsModal({ match, onClose }) {
  if (!match) return null;
  const stats = match.playerStats || [];
  const resultColor =
    match.result === "Win" ? C.green : match.result === "Loss" ? C.red : C.gold;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, maxWidth: 900 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...styles.modalHeader, background: C.surfaceAlt }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Result badge */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 3,
                color: resultColor,
                border: `1px solid ${resultColor}`,
                padding: "4px 12px",
                borderRadius: 2,
              }}
            >
              {match.result?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
                {match.score}
                <span
                  style={{
                    fontSize: 13,
                    color: C.textSecondary,
                    marginLeft: 12,
                    letterSpacing: 1,
                  }}
                >
                  vs {match.opponent || "—"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: C.textSecondary,
                  letterSpacing: 2,
                  marginTop: 3,
                }}
              >
                {match.map} · {match.type?.toUpperCase()} · {match.date}
              </div>
            </div>
          </div>
          <button
            style={{ ...styles.closeBtn, fontSize: 20 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Player Stats Table */}
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: C.textSecondary,
              marginBottom: 12,
              paddingLeft: 2,
            }}
          >
            PLAYER PERFORMANCE
          </div>

          {stats.length === 0 ? (
            <div style={{ ...styles.empty, padding: "32px 0" }}>
              No player stats recorded for this match.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, paddingLeft: 0 }}>PLAYER</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>AGENT</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>ACS</th>
                    {/* K / D / A as separate columns like Valorant scoreboard */}
                    <th
                      style={{
                        ...styles.th,
                        textAlign: "center",
                        color: C.green,
                      }}
                    >
                      K
                    </th>
                    <th
                      style={{
                        ...styles.th,
                        textAlign: "center",
                        color: C.red,
                      }}
                    >
                      D
                    </th>
                    <th
                      style={{
                        ...styles.th,
                        textAlign: "center",
                        color: C.textSecondary,
                      }}
                    >
                      A
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((ps, i) => {
                    const kills = typeof ps.kills === "number" ? ps.kills : 0;
                    const deaths =
                      typeof ps.deaths === "number" ? ps.deaths : 0;
                    const assists =
                      typeof ps.assists === "number" ? ps.assists : 0;
                    const kdColor = getKdColor(kills, deaths);
                    return (
                      <tr
                        key={ps.player}
                        style={i % 2 === 0 ? styles.trEven : styles.trOdd}
                      >
                        {/* Player name */}
                        <td
                          style={{
                            ...styles.td,
                            paddingLeft: 0,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {ps.player}
                        </td>

                        {/* Agent */}
                        <td style={{ ...styles.td, textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: 1,
                              color: C.textSecondary,
                              background: C.surfaceAlt,
                              border: `1px solid ${C.border}`,
                              padding: "2px 8px",
                              borderRadius: 2,
                            }}
                          >
                            {ps.agent}
                          </span>
                        </td>

                        {/* ACS */}
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 15,
                          }}
                        >
                          {ps.acs}
                        </td>

                        {/* K — green tint */}
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 15,
                            color: C.green,
                          }}
                        >
                          {kills}
                        </td>

                        {/* D — red tint, colored based on overall K/D */}
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 15,
                            color: C.red,
                          }}
                        >
                          {deaths}
                        </td>

                        {/* ASSIST */}
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 15,
                            color: C.gray,
                          }}
                        >
                          {assists}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Team Metrics */}
          {match.teamMetrics && (
            <>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 3,
                  color: C.textSecondary,
                  marginTop: 28,
                  marginBottom: 12,
                  paddingLeft: 2,
                }}
              >
                TEAM METRICS
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  {
                    label: "ATK WIN%",
                    val: pct(
                      match.teamMetrics.atkWins,
                      match.teamMetrics.atkRounds,
                    ),
                  },
                  {
                    label: "DEF WIN%",
                    val: pct(
                      match.teamMetrics.defWins,
                      match.teamMetrics.defRounds,
                    ),
                  },
                  {
                    label: "POST-PLANT%",
                    val: pct(
                      match.teamMetrics.postPlantWins,
                      match.teamMetrics.postPlantTotal,
                    ),
                  },
                  {
                    label: "ATK PISTOL",
                    val: match.teamMetrics.atkPistolWin ?? "—",
                    isText: true,
                  },
                  {
                    label: "DEF PISTOL",
                    val: match.teamMetrics.defPistolWin ?? "—",
                    isText: true,
                  },
                ].map(({ label, val, isText }) => (
                  <div
                    key={label}
                    style={{
                      background: C.surfaceAlt,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: "14px 16px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: isText
                        ? val === "Win" ? "#4ade80" : val === "Loss" ? "#f87171" : "inherit"
                        : "inherit"
                    }}>
                      {isText ? val : `${val}%`}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        letterSpacing: 2,
                        color: C.textSecondary,
                        marginTop: 4,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer close */}
        <div
          style={{ ...styles.formActions, borderTop: `1px solid ${C.border}` }}
        >
          <button style={styles.secondaryBtn} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

// tiny helper (no import needed)
function pct(a, b) {
  if (!b) return "—";
  return Math.round((a / b) * 100);
}

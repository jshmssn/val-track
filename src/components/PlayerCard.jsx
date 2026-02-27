// ============================================================
// src/components/PlayerCard.jsx
// Displays aggregated stats and a performance classification tag.
//
// TO EXPAND:
//   - Add trend arrows (↑ ↓) comparing to previous N matches
//   - Add agent pool pie chart
//   - Link to a detailed player page/modal
// ============================================================
import { avg, fmt } from "../utils/statsHelpers";
import { classifyPlayer } from "../utils/statsHelpers";
import { styles } from "../styles/tokens";

export function PlayerCard({ player, matches }) {
  const playerMatches = matches.filter((m) =>
    m.playerStats.some((ps) => ps.player === player)
  );
  const rows = playerMatches.flatMap((m) =>
    m.playerStats.filter((ps) => ps.player === player)
  );

  if (rows.length === 0) return null;

  const stats = {
    acs:        avg(rows.map((r) => r.acs)),
    kd:         avg(rows.map((r) => r.kd)),
    adr:        avg(rows.map((r) => r.adr)),
    kast:       avg(rows.map((r) => r.kast)),
    fkRate:     avg(rows.map((r) => r.fkRate)),
    clutchRate: avg(rows.map((r) => r.clutchRate)),
  };
  const agents = [...new Set(rows.map((r) => r.agent))];
  const tag = classifyPlayer(stats);

  return (
    <div style={styles.playerCard}>
      <div style={styles.playerCardHeader}>
        <div>
          <div style={styles.playerName}>{player}</div>
          <div style={styles.playerAgents}>{agents.join(" · ")}</div>
        </div>
        <span style={{ ...styles.playerTag, color: tag.color, borderColor: tag.color }}>
          {tag.label}
        </span>
      </div>

      <div style={styles.playerStatsGrid}>
        <StatChip label="ACS"    value={fmt(stats.acs)} />
        <StatChip label="K/D"    value={fmt(stats.kd, 2)} />
        <StatChip label="ADR"    value={fmt(stats.adr)} />
        <StatChip label="KAST"   value={`${fmt(stats.kast)}%`} />
        <StatChip label="FK%"    value={`${fmt(stats.fkRate * 100)}%`} />
        <StatChip label="CLCH%"  value={`${fmt(stats.clutchRate * 100)}%`} />
      </div>

      <div style={styles.playerMatches}>
        {rows.length} match{rows.length !== 1 ? "es" : ""} played
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={styles.statChip}>
      <div style={styles.statChipVal}>{value}</div>
      <div style={styles.statChipLabel}>{label}</div>
    </div>
  );
}

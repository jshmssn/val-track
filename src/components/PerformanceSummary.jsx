// ============================================================
// src/components/PerformanceSummary.jsx
// Top-level KPI cards for team-wide metrics.
//
// TO EXPAND:
//   - Add sparkline charts per card (recharts <SparklineChart>)
//   - Add comparison to previous period (delta % badges)
// ============================================================
import { pct, aggregateTeamMetrics } from "../utils/statsHelpers";
import { styles, C } from "../styles/tokens";

export function PerformanceSummary({ matches }) {
  const wins  = matches.filter((m) => m.result === "Win").length;
  const total = matches.length;
  const metrics = aggregateTeamMetrics(matches);

  const cards = [
    {
      label: "Win Rate",
      value: total ? `${pct(wins, total)}%` : "—",
      sub: `${wins}W / ${total - wins}L`,
      accent: wins / (total || 1) >= 0.5 ? C.red : "#888",
    },
    { label: "ATK Win %",    value: metrics ? `${metrics.atkPct}%` : "—",       sub: "Attacking rounds",    accent: C.orange },
    { label: "DEF Win %",    value: metrics ? `${metrics.defPct}%` : "—",       sub: "Defensive rounds",    accent: C.gold  },
    { label: "Post-Plant %", value: metrics ? `${metrics.postPlantPct}%` : "—", sub: "After plant wins",    accent: C.teal  },
    { label: "ATK Pistol",    value: metrics ? `${metrics.atkPistolWins}/${metrics.pistolTotal}` : "—",  sub: "ATK pistol rounds won",  accent: C.green },
  ];

  return (
    <div style={styles.summaryGrid}>
      {cards.map((c) => (
        <div key={c.label} style={styles.kpiCard}>
          <div style={{ ...styles.kpiAccent, background: c.accent }} />
          <div style={styles.kpiValue}>{c.value}</div>
          <div style={styles.kpiLabel}>{c.label}</div>
          <div style={styles.kpiSub}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

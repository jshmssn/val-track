// ============================================================
// src/components/StatsTable.jsx
// Sortable table of aggregated player stats.
//
// TO EXPAND:
//   - Add CSV export button
//   - Add per-match drill-down row expansion
//   - Add conditional formatting thresholds configurable by coach
// ============================================================
import { useState, useMemo } from "react";
import { aggregatePlayerStats, fmt } from "../utils/statsHelpers";
import { styles, C } from "../styles/tokens";

const COLUMNS = [
  { key: "player",     label: "PLAYER",   numeric: false, format: (v) => v },
  { key: "matches",    label: "GP",       numeric: true,  format: (v) => v },
  { key: "acs",        label: "ACS",      numeric: true,  format: (v) => fmt(v) },
  { key: "kd",         label: "K/D",      numeric: true,  format: (v) => fmt(v, 2) },
  // { key: "adr",        label: "ADR",      numeric: true,  format: (v) => fmt(v) },
  // { key: "kast",       label: "KAST%",    numeric: true,  format: (v) => `${fmt(v)}%` },
  // { key: "fkRate",     label: "FK%",      numeric: true,  format: (v) => `${fmt(v * 100)}%` },
  // { key: "clutchRate", label: "CLUTCH%",  numeric: true,  format: (v) => `${fmt(v * 100)}%` },
];

export function StatsTable({ matches }) {
  const [sort, setSort] = useState({ key: "acs", dir: "desc" });

  const data   = useMemo(() => aggregatePlayerStats(matches), [matches]);
  const sorted = useMemo(() => {
    const d = [...data];
    d.sort((a, b) =>
      sort.dir === "desc" ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key]
    );
    return d;
  }, [data, sort]);

  const toggle = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const sortIcon = (key) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  // Best values for color coding
  const best = {
    acs: Math.max(...sorted.map((r) => r.acs)),
    kd:  Math.max(...sorted.map((r) => r.kd)),
  };

  if (sorted.length === 0) {
    return <div style={styles.empty}>No data matches the current filters.</div>;
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                style={{ ...styles.th, cursor: c.numeric ? "pointer" : "default" }}
                onClick={() => c.numeric && toggle(c.key)}
              >
                {c.label}{sortIcon(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.player} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
              {COLUMNS.map((c) => {
                const isTopACS = c.key === "acs" && row.acs === best.acs;
                const isLowKD  = c.key === "kd"  && row.kd < 0.9;
                return (
                  <td
                    key={c.key}
                    style={{
                      ...styles.td,
                      color: isTopACS ? C.green : isLowKD ? C.red : c.numeric ? "#e8d5b7" : "#fff",
                      fontWeight: isTopACS ? 700 : 400,
                    }}
                  >
                    {c.format(row[c.key])}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

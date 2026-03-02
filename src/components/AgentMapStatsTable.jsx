import { Fragment } from "react";
import { AGENTS, MAPS } from "../data/sampleData";
import { pct } from "../utils/statsHelpers";
import { styles, C } from "../styles/tokens";

const unique = (arr) => [...new Set(arr)];

function summarizeAgent(entries) {
  const played = entries.length;
  const wins = entries.filter((e) => e.result === "Win").length;
  return {
    played,
    winPctText: played ? `${pct(wins, played)}%` : "\u2014",
    winPctNum: pct(wins, played),
  };
}

function getCellColor(value, played) {
  if (!played) return C.textSecondary;
  if (value < 50) return C.red;
  if (value >= 60) return C.green;
  return C.textPrimary;
}

export function AgentMapStatsTable({ matches, mapNames = [], agentNames = [] }) {
  const mapsFromMatches = matches.map((m) => m.map).filter(Boolean);
  const agentsFromMatches = matches
    .flatMap((m) => (m.playerStats || []).map((ps) => ps.agent))
    .filter(Boolean);

  const mapList = unique([...(mapNames.length ? mapNames : MAPS), ...mapsFromMatches]);
  const agentList = unique([...(agentNames.length ? agentNames : AGENTS), ...agentsFromMatches]);

  const entries = matches.flatMap((m) =>
    (m.playerStats || []).map((ps) => ({
      map: m.map,
      result: m.result,
      agent: ps.agent,
    })),
  );

  const columns = ["Overall", ...mapList];

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>AGENT</th>
            {columns.map((col) => (
              <th key={col} style={styles.th}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agentList.map((agent, idx) => {
            const byAgent = entries.filter((e) => e.agent === agent);
            const rowTone = idx % 2 === 0 ? styles.trEven : styles.trOdd;
            return (
              <Fragment key={agent}>
                <tr key={`${agent}-win`} style={rowTone}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{agent} Win%</td>
                  {columns.map((col) => {
                    const selected = col === "Overall" ? byAgent : byAgent.filter((e) => e.map === col);
                    const summary = summarizeAgent(selected);
                    return (
                      <td
                        key={`${agent}-win-${col}`}
                        style={{ ...styles.td, color: getCellColor(summary.winPctNum, summary.played) }}
                      >
                        {summary.winPctText}
                      </td>
                    );
                  })}
                </tr>
                <tr key={`${agent}-times`} style={rowTone}>
                  <td style={{ ...styles.td, color: C.textSecondary }}>times played</td>
                  {columns.map((col) => {
                    const selected = col === "Overall" ? byAgent : byAgent.filter((e) => e.map === col);
                    const summary = summarizeAgent(selected);
                    return (
                      <td key={`${agent}-times-${col}`} style={styles.td}>
                        {summary.played}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

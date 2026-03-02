import { MAPS } from "../data/sampleData";
import { pct } from "../utils/statsHelpers";
import { styles, C } from "../styles/tokens";

const COLUMNS = [
  { key: "map", label: "MAP" },
  { key: "mapWinPct", label: "MAP WIN %" },
  { key: "atkWinPct", label: "A WIN %" },
  { key: "defWinPct", label: "D WIN %" },
  { key: "atkPistolWinPct", label: "A PIS WIN %" },
  { key: "defPistolWinPct", label: "D PIS WIN %" },
  { key: "timesPlayed", label: "TIMES PLAYED" },
];

const unique = (arr) => [...new Set(arr)];
const hasPistol = (value) => value === "Win" || value === "Loss";

function percentText(wins, total) {
  if (!total) return "\u2014";
  return `${pct(wins, total)}%`;
}

function toRow(map, matches) {
  const timesPlayed = matches.length;
  const wins = matches.filter((m) => m.result === "Win").length;

  const atkWins = matches.reduce((sum, m) => sum + (m.teamMetrics?.atkWins || 0), 0);
  const atkRounds = matches.reduce((sum, m) => sum + (m.teamMetrics?.atkRounds || 0), 0);
  const defWins = matches.reduce((sum, m) => sum + (m.teamMetrics?.defWins || 0), 0);
  const defRounds = matches.reduce((sum, m) => sum + (m.teamMetrics?.defRounds || 0), 0);

  const atkPistolTotal = matches.filter((m) => hasPistol(m.teamMetrics?.atkPistolWin)).length;
  const defPistolTotal = matches.filter((m) => hasPistol(m.teamMetrics?.defPistolWin)).length;
  const atkPistolWins = matches.filter((m) => m.teamMetrics?.atkPistolWin === "Win").length;
  const defPistolWins = matches.filter((m) => m.teamMetrics?.defPistolWin === "Win").length;

  return {
    map,
    mapWinPct: percentText(wins, timesPlayed),
    atkWinPct: percentText(atkWins, atkRounds),
    defWinPct: percentText(defWins, defRounds),
    atkPistolWinPct: percentText(atkPistolWins, atkPistolTotal),
    defPistolWinPct: percentText(defPistolWins, defPistolTotal),
    timesPlayed,
    mapWinRate: pct(wins, timesPlayed),
  };
}

function getMapCellColor(row) {
  if (row.timesPlayed === 0) return C.textSecondary;
  if (row.mapWinRate < 50) return C.red;
  if (row.mapWinRate >= 60) return C.green;
  return C.textPrimary;
}

export function MapAnalyticsTable({ matches, mapNames = [] }) {
  const mapsFromMatches = matches.map((m) => m.map).filter(Boolean);
  const seededMaps = mapNames.length > 0 ? mapNames : MAPS;
  const mapList = unique([...seededMaps, ...mapsFromMatches]);

  const rows = [
    toRow("Overall", matches),
    ...mapList.map((map) => toRow(map, matches.filter((m) => m.map === map))),
  ];

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} style={styles.th}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const mapColor = getMapCellColor(row);
            return (
              <tr key={row.map} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      ...styles.td,
                      color: col.key === "map" || col.key === "mapWinPct" ? mapColor : undefined,
                      fontWeight: row.map === "Overall" || col.key === "map" ? 700 : 400,
                    }}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

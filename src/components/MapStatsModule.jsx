import { MAPS as FALLBACK_MAPS } from '../data/sampleData';
import { pct } from '../utils/statsHelpers';

const hasPistolResult = (value) => value === 'Win' || value === 'Loss';
const uniq = (arr) => [...new Set(arr)];

function toPctText(wins, total) {
  if (!total) return '-';
  return `${pct(wins, total)}%`;
}

function summarizeMap(map, matches) {
  const played = matches.length;
  const wins = matches.filter((m) => m.result === 'Win').length;

  const atkWins = matches.reduce((sum, m) => sum + (m.teamMetrics?.atkWins || 0), 0);
  const atkRounds = matches.reduce((sum, m) => sum + (m.teamMetrics?.atkRounds || 0), 0);
  const defWins = matches.reduce((sum, m) => sum + (m.teamMetrics?.defWins || 0), 0);
  const defRounds = matches.reduce((sum, m) => sum + (m.teamMetrics?.defRounds || 0), 0);

  const atkPistolTotal = matches.filter((m) => hasPistolResult(m.teamMetrics?.atkPistolWin)).length;
  const defPistolTotal = matches.filter((m) => hasPistolResult(m.teamMetrics?.defPistolWin)).length;
  const atkPistolWins = matches.filter((m) => m.teamMetrics?.atkPistolWin === 'Win').length;
  const defPistolWins = matches.filter((m) => m.teamMetrics?.defPistolWin === 'Win').length;

  return {
    map,
    played,
    mapWinRate: pct(wins, played),
    mapWinPct: toPctText(wins, played),
    atkWinPct: toPctText(atkWins, atkRounds),
    defWinPct: toPctText(defWins, defRounds),
    atkPistolWinPct: toPctText(atkPistolWins, atkPistolTotal),
    defPistolWinPct: toPctText(defPistolWins, defPistolTotal),
  };
}

function rowTone(winRate, played) {
  if (!played) return 'muted';
  if (winRate < 50) return 'bad';
  if (winRate >= 60) return 'good';
  return 'mid';
}

export function MapStatsModule({ matches, mapNames = [] }) {
  const mapsFromData = matches.map((m) => m.map).filter(Boolean);
  const knownMaps = mapNames.length > 0 ? mapNames : FALLBACK_MAPS;
  const mapList = uniq([...knownMaps, ...mapsFromData]);

  const rows = [
    summarizeMap('Overall', matches),
    ...mapList.map((map) => summarizeMap(map, matches.filter((m) => m.map === map))),
  ];

  const byPlayed = rows.slice(1).filter((r) => r.played > 0).sort((a, b) => b.played - a.played);
  const byWinRate = rows.slice(1).filter((r) => r.played > 0).sort((a, b) => b.mapWinRate - a.mapWinRate);
  const weakest = rows.slice(1).filter((r) => r.played > 0 && r.mapWinRate < 50).length;

  const mostPlayed = byPlayed[0];
  const bestMap = byWinRate[0];

  return (
    <div className="mapstats-layout">
      <div className="mapstats-cards">
        <div className="mapstats-card">
          <div className="mapstats-card-label">Weak Maps</div>
          <div className="mapstats-card-value mapstats-bad">{weakest}</div>
          <div className="mapstats-card-sub">win rate below 50%</div>
        </div>
        <div className="mapstats-card">
          <div className="mapstats-card-label">Best Map</div>
          <div className="mapstats-card-value mapstats-good">{bestMap ? bestMap.map : '-'}</div>
          <div className="mapstats-card-sub">{bestMap ? `${bestMap.mapWinPct} win rate` : 'no matches yet'}</div>
        </div>
        <div className="mapstats-card">
          <div className="mapstats-card-label">Most Played</div>
          <div className="mapstats-card-value">{mostPlayed ? mostPlayed.map : '-'}</div>
          <div className="mapstats-card-sub">{mostPlayed ? `${mostPlayed.played} matches` : 'no matches yet'}</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="mapstats-desktop">
          <table className="stats-table mapstats-table">
            <thead>
              <tr>
                <th>Map</th>
                <th>Map Win %</th>
                <th>A Win %</th>
                <th>D Win %</th>
                <th>A PIS Win %</th>
                <th>D PIS Win %</th>
                <th>Times Played</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.map} className={`tone-${rowTone(row.mapWinRate, row.played)} ${idx === 0 ? 'row-overall' : ''}`}>
                  <td className="map-cell">{row.map}</td>
                  <td>{row.mapWinPct}</td>
                  <td>{row.atkWinPct}</td>
                  <td>{row.defWinPct}</td>
                  <td>{row.atkPistolWinPct}</td>
                  <td>{row.defPistolWinPct}</td>
                  <td>{row.played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mapstats-mobile">
          {rows.map((row, idx) => (
            <article key={row.map} className={`mapstats-mobile-card tone-${rowTone(row.mapWinRate, row.played)} ${idx === 0 ? 'row-overall' : ''}`}>
              <div className="mapstats-mobile-head">
                <span className="mapstats-mobile-name">{row.map}</span>
                <span className="mapstats-mobile-played">{row.played} played</span>
              </div>
              <div className="mapstats-mobile-grid">
                <div><span>Map Win</span><strong>{row.mapWinPct}</strong></div>
                <div><span>ATK Win</span><strong>{row.atkWinPct}</strong></div>
                <div><span>DEF Win</span><strong>{row.defWinPct}</strong></div>
                <div><span>ATK Pistol</span><strong>{row.atkPistolWinPct}</strong></div>
                <div><span>DEF Pistol</span><strong>{row.defPistolWinPct}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

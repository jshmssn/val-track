import { useState, useMemo } from 'react';
import { aggregatePlayerStats, fmt } from '../utils/statsHelpers';

const COLS = [
  { key:'player',  label:'Player',  numeric:false, format:v=>v },
  { key:'matches', label:'GP',      numeric:true,  format:v=>v },
  { key:'acs',     label:'ACS',     numeric:true,  format:v=>fmt(v) },
  { key:'kd',      label:'K/D',     numeric:true,  format:v=>fmt(v,2) },
];

export function StatsTable({ matches }) {
  const [sort, setSort] = useState({ key:'acs', dir:'desc' });
  const data   = useMemo(() => aggregatePlayerStats(matches), [matches]);
  const sorted = useMemo(() => {
    const d = [...data];
    d.sort((a,b) => sort.dir==='desc' ? b[sort.key]-a[sort.key] : a[sort.key]-b[sort.key]);
    return d;
  }, [data, sort]);

  const toggle = key => setSort(s => ({ key, dir: s.key===key && s.dir==='desc' ? 'asc' : 'desc' }));
  const icon   = key => sort.key===key ? (sort.dir==='desc' ? ' ↓' : ' ↑') : '';
  const bestACS = Math.max(...sorted.map(r => r.acs));

  if (sorted.length === 0) return <div className="empty-state">No data matches the current filters</div>;

  return (
    <div className="table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {COLS.map(c => (
              <th key={c.key} className={c.numeric ? 'sortable' : ''} onClick={() => c.numeric && toggle(c.key)}>
                {c.label}{icon(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.player}>
              {COLS.map(c => {
                const isTopACS = c.key==='acs' && row.acs===bestACS;
                const isLowKD  = c.key==='kd'  && row.kd<0.9;
                return (
                  <td key={c.key} style={{
                    color: isTopACS ? 'var(--emerald)' : isLowKD ? 'var(--red)' : undefined,
                    fontWeight: isTopACS ? 700 : undefined,
                    fontFamily: c.key==='player' ? undefined : 'var(--mono)',
                  }}>
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

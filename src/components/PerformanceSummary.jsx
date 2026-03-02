import { pct, aggregateTeamMetrics } from '../utils/statsHelpers';

export function PerformanceSummary({ matches }) {
  const wins = matches.filter(m => m.result === 'Win').length;
  const total = matches.length;
  const m = aggregateTeamMetrics(matches);

  const cards = [
    { label: 'Win Rate',    value: total ? `${pct(wins, total)}%` : '—', sub: `${wins}W · ${total - wins}L`, accent: 'var(--red)',     color: 'var(--red)' },
    { label: 'ATK Win%',   value: m ? `${m.atkPct}%` : '—',             sub: 'Attacking rounds',             accent: 'var(--amber)',   color: 'var(--amber)' },
    { label: 'DEF Win%',   value: m ? `${m.defPct}%` : '—',             sub: 'Defensive rounds',             accent: 'var(--sky)',     color: 'var(--sky)' },
    { label: 'Post-Plant', value: m ? `${m.postPlantPct}%` : '—',       sub: 'After plant',                  accent: 'var(--violet)',  color: 'var(--violet)' },
    { label: 'ATK Pistol', value: m ? `${m.atkPistolWins}/${m.pistolTotal}` : '—', sub: 'Pistol rounds won',accent: 'var(--emerald)', color: 'var(--emerald)' },
  ];

  return (
    <div className="kpi-grid">
      {cards.map(c => (
        <div key={c.label} className="kpi-card">
          <div className="kpi-accent" style={{ background: c.accent }} />
          <div className="kpi-val" style={{ color: c.color }}>{c.value}</div>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

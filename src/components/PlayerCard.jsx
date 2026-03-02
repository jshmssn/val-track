import { avg, fmt, classifyPlayer } from '../utils/statsHelpers';

export function PlayerCard({ player, matches }) {
  const rows = matches.flatMap(m => m.playerStats.filter(ps => ps.player === player));
  if (rows.length === 0) return null;

  const stats = {
    acs:        avg(rows.map(r => r.acs)),
    kd:         avg(rows.map(r => r.kd)),
    adr:        avg(rows.map(r => r.adr)),
    kast:       avg(rows.map(r => r.kast)),
    fkRate:     avg(rows.map(r => r.fkRate)),
    clutchRate: avg(rows.map(r => r.clutchRate)),
  };
  const agents = [...new Set(rows.map(r => r.agent))];
  const tag = classifyPlayer(stats);

  const chips = [
    { label: 'ACS',   val: fmt(stats.acs),             hi: stats.acs >= 250,     warn: false },
    { label: 'K/D',   val: fmt(stats.kd, 2),           hi: stats.kd >= 1.2,      warn: stats.kd < 0.9 },
    { label: 'ADR',   val: fmt(stats.adr),              hi: false,                warn: false },
    { label: 'KAST',  val: `${fmt(stats.kast)}%`,       hi: stats.kast >= 70,     warn: false },
    { label: 'FK%',   val: `${fmt(stats.fkRate*100)}%`, hi: false,                warn: false },
    { label: 'CLUTCH',val: `${fmt(stats.clutchRate*100)}%`, hi: false,            warn: false },
  ];

  const tagColors = {
    'TOP PERFORMER':    { bg:'rgba(16,185,129,0.12)', color:'var(--emerald)', border:'rgba(16,185,129,0.3)' },
    'NEEDS IMPROVEMENT':{ bg:'rgba(232,37,60,0.12)',  color:'var(--red)',     border:'rgba(232,37,60,0.3)'  },
    'STABLE':           { bg:'rgba(245,158,11,0.12)', color:'var(--amber)',   border:'rgba(245,158,11,0.3)' },
  };
  const tc = tagColors[tag.label] || tagColors['STABLE'];

  return (
    <div className="player-card">
      <div className="player-card-head">
        <div>
          <div className="player-name">{player}</div>
          <div className="player-agents">{agents.slice(0,3).join(' · ')}{agents.length > 3 ? ` +${agents.length-3}` : ''}</div>
        </div>
        <span className="player-tag" style={{ background: tc.bg, color: tc.color, borderColor: tc.border }}>
          {tag.label}
        </span>
      </div>

      <div className="player-stats-grid">
        {chips.map(c => (
          <div key={c.label} className="stat-cell">
            <div className="stat-val" style={{ color: c.hi ? 'var(--emerald)' : c.warn ? 'var(--red)' : 'var(--text)' }}>
              {c.val}
            </div>
            <div className="stat-lbl">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="player-footer">{rows.length} match{rows.length !== 1 ? 'es' : ''} played</div>
    </div>
  );
}

import { useState } from 'react';
import { C } from '../styles/tokens';
import { MatchStatsModal } from './MatchStatsModal';

export function MatchRow({ match, onDelete }) {
  const [open, setOpen] = useState(false);
  const isWin = match.result === 'Win';
  const isDraw = match.result === 'Draw';
  const rc = isWin ? 'var(--emerald)' : isDraw ? 'var(--amber)' : 'var(--red)';
  const hasStats = (match.playerStats || []).length > 0;

  return (
    <>
      <div className="match-card" onClick={() => setOpen(true)}>
        {/* Left color bar */}
        <div className="match-result-bar" style={{ background: rc, color: 'transparent', fontSize: 0, minWidth: 8 }} />

        {/* Score */}
        <div className="match-score-cell">
          <div className="match-score-num" style={{ color: rc }}>{match.score || '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2, letterSpacing: '0.06em' }}>
            {isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'}
          </div>
        </div>

        {/* Info */}
        <div className="match-info-cell">
          <div className="match-opponent">{match.opponent || '—'}</div>
          <div className="match-meta-row">
            <span className="meta-chip">{match.map}</span>
            <span className="meta-dot">·</span>
            <span className="meta-chip">{match.date}</span>
            {match.type === 'Tournament' && match.tournament && (
              <><span className="meta-dot">·</span><span className="meta-chip" style={{ color: 'var(--amber)' }}>{match.tournament}</span></>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="match-actions" onClick={e => e.stopPropagation()}>
          {hasStats && <span className="players-pill">{match.playerStats.length}P</span>}
          {match.type === 'Tournament'
            ? <span className="type-badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', borderColor: 'rgba(245,158,11,0.3)', border: '1px solid' }}>TOURN</span>
            : <span className="type-badge" style={{ background: 'var(--s3)', color: 'var(--text3)' }}>SCRIM</span>
          }
          {onDelete && (
            <button className="del-btn" onClick={e => { e.stopPropagation(); onDelete(match.id); }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {open && <MatchStatsModal match={match} onClose={() => setOpen(false)} />}
    </>
  );
}


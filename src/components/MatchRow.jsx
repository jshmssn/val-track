// src/components/MatchRow.jsx
import { useState } from 'react';
import { styles, C } from '../styles/tokens';
import { MatchStatsModal } from './MatchStatsModal';

export function MatchRow({ match, onDelete }) {
  const [open, setOpen] = useState(false);
  const resultColor = match.result === 'Win' ? C.green : match.result === 'Loss' ? C.red : C.gold;
  const hasStats = (match.playerStats || []).length > 0;

  return (
    <>
      <div
        style={{
          ...styles.matchRow,
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          borderColor: C.border,
        }}
        onClick={() => setOpen(true)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `${resultColor}55`;
          e.currentTarget.style.background = `${C.surfaceAlt}`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = C.border;
          e.currentTarget.style.background = C.surface;
        }}
      >
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, background: resultColor, borderRadius: '4px 0 0 4px',
        }} />

        <div style={{ ...styles.matchResult, color: resultColor }}>
          {match.result.toUpperCase()}
        </div>
        <div style={styles.matchScore}>{match.score}</div>
        <div style={styles.matchInfo}>
          <span style={styles.matchOpponent}>{match.opponent || '—'}</span>
          <span style={styles.matchMeta}>{match.map} · {match.type} · {match.date}</span>
        </div>

        {/* Stats pill */}
        {hasStats && (
          <div style={{
            fontSize: 9, letterSpacing: 2, color: C.textSecondary,
            border: `1px solid ${C.borderBright}`, padding: '3px 10px',
            borderRadius: 2, whiteSpace: 'nowrap',
          }}>
            {(match.playerStats || []).length} PLAYERS
          </div>
        )}

        <div style={{ ...styles.matchType, color: match.type === 'Tournament' ? C.gold : '#aaa' }}>
          {match.type?.toUpperCase()}
        </div>

        {onDelete && (
          <button
            style={styles.matchDeleteBtn}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Delete this match?')) onDelete(match.id);
            }}
          >
            DEL
          </button>
        )}
      </div>

      {open && <MatchStatsModal match={match} onClose={() => setOpen(false)} />}
    </>
  );
}

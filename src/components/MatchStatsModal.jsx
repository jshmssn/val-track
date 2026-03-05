import { styles } from '../styles/tokens';

export function MatchStatsModal({ match, onClose }) {
  if (!match) return null;
  const stats = match.playerStats || [];
  const isWin = match.result === 'Win';
  const isDraw = match.result === 'Draw';
  const rc = isWin ? 'var(--emerald)' : isDraw ? 'var(--amber)' : 'var(--red)';
  const thBase = { ...styles.th, padding: '12px 18px', fontSize: 11 };
  const tdBase = { ...styles.td, padding: '12px 18px', fontSize: 15 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ background: 'var(--s2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.15em',
                color: rc,
                border: `1px solid ${rc}`,
                padding: '4px 12px',
                borderRadius: 6,
                background: `${isWin ? 'rgba(16,185,129,0.1)' : isDraw ? 'rgba(245,158,11,0.1)' : 'rgba(232,37,60,0.1)'}`,
              }}
            >
              {match.result?.toUpperCase()}
            </div>
            <div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '0.02em',
                }}
              >
                {match.score}
                <span
                  style={{
                    fontSize: 15,
                    color: 'var(--text3)',
                    marginLeft: 10,
                    fontWeight: 600,
                  }}
                >
                  vs {match.opponent || '-'}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text3)',
                  fontFamily: 'var(--mono)',
                  marginTop: 3,
                  letterSpacing: '0.06em',
                }}
              >
                {match.map} - {match.type?.toUpperCase()} - {match.date}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            X
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '20px 26px' }}>
          <div
            style={{
              fontSize: 9,
              fontFamily: 'var(--mono)',
              color: 'var(--text3)',
              letterSpacing: '0.15em',
              marginBottom: 12,
            }}
          >
            PLAYER PERFORMANCE
          </div>

          {stats.length === 0 ? (
            <div className="empty-state">No player stats recorded for this match</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...styles.table, minWidth: 860 }}>
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thBase}>Player</th>
                    <th style={{ ...thBase, textAlign: 'center' }}>Agent</th>
                    <th style={{ ...thBase, textAlign: 'center' }}>ACS</th>
                    <th style={{ ...thBase, textAlign: 'center', color: 'var(--emerald)' }}>K</th>
                    <th style={{ ...thBase, textAlign: 'center', color: 'var(--red)' }}>D</th>
                    <th style={{ ...thBase, textAlign: 'center' }}>A</th>
                    <th style={{ ...thBase, textAlign: 'center' }}>FB</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((ps, i) => {
                    const kills = ps.kills || 0;
                    const deaths = ps.deaths || 0;
                    const assists = ps.assists || 0;
                    const firstBloods = ps.first_bloods ?? ps.firstBloods ?? ps.first_kills ?? 0;
                    return (
                      <tr key={ps.player} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={{ ...tdBase, fontWeight: 800, fontSize: 16 }}>{ps.player}</td>
                        <td style={{ ...tdBase, textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: 'var(--mono)',
                              background: 'var(--s3)',
                              border: '1px solid var(--border)',
                              padding: '3px 9px',
                              borderRadius: 4,
                            }}
                          >
                            {ps.agent}
                          </span>
                        </td>
                        <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{ps.acs}</td>
                        <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 16, color: 'var(--emerald)' }}>{kills}</td>
                        <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 16, color: 'var(--red)' }}>{deaths}</td>
                        <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 16, color: 'var(--text3)' }}>{assists}</td>
                        <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{firstBloods}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {match.teamMetrics && (() => {
            const tm = match.teamMetrics;
            const pct = (a, b) => (b ? Math.round((a / b) * 100) : '-');
            const atkLosses = tm.atkLosses ?? Math.max(0, (tm.atkRounds || 0) - (tm.atkWins || 0));
            const defLosses = tm.defLosses ?? Math.max(0, (tm.defRounds || 0) - (tm.defWins || 0));
            const metricCards = [
              { label: 'ATK WIN%', val: `${pct(tm.atkWins, tm.atkRounds)}%` },
              { label: 'DEF WIN%', val: `${pct(tm.defWins, tm.defRounds)}%` },
              { label: 'ATK LOSS', val: `${atkLosses}` },
              { label: 'DEF LOSS', val: `${defLosses}` },
              { label: 'POST PLANT', val: `${pct(tm.postPlantWins, tm.postPlantTotal)}%` },
              { label: 'ATK PISTOL', val: tm.atkPistolWin ?? '-', isText: true },
              { label: 'DEF PISTOL', val: tm.defPistolWin ?? '-', isText: true },
            ];

            return (
              <>
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    color: 'var(--text3)',
                    letterSpacing: '0.15em',
                    marginTop: 24,
                    marginBottom: 12,
                  }}
                >
                  TEAM METRICS
                </div>
                <div className="stats-modal-grid">
                  {metricCards.map(({ label, val, isText }) => (
                    <div key={label} className="stats-mini-card">
                      <div
                        className="stats-mini-val"
                        style={{
                          color: isText
                            ? val === 'Win'
                              ? 'var(--emerald)'
                              : val === 'Loss'
                                ? 'var(--red)'
                                : 'var(--text)'
                            : 'var(--text)',
                        }}
                      >
                        {val}
                      </div>
                      <div className="stats-mini-lbl">{label}</div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


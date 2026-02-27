// ============================================================
// src/App.jsx — wired to PHP backend
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { useAppState } from './hooks/useAppState';
import { useReferenceData } from './hooks/useReferenceData';
import { useFilters }  from './hooks/useFilters';
import { pct }         from './utils/statsHelpers';
import { styles, C }   from './styles/tokens';

import { FiltersPanel }       from './components/FiltersPanel';
import { PerformanceSummary } from './components/PerformanceSummary';
import { PlayerCard }         from './components/PlayerCard';
import { StatsTable }         from './components/StatsTable';
import { MatchForm }          from './components/MatchForm';
import { MatchRow }           from './components/MatchRow';
import { SectionHeader }      from './components/SectionHeader';
import { AIUploadModal }      from './components/AIUploadModal';

// All unique player names from loaded matches
function getPlayers(matches) {
  const set = new Set();
  matches.forEach((m) => (m.playerStats || []).forEach((ps) => set.add(ps.player)));
  return [...set].sort();
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'DASHBOARD'   },
  { id: 'players',   label: 'PLAYERS'     },
  { id: 'matches',   label: 'MATCHES'     },
  { id: 'stats',     label: 'STATS TABLE' },
];

export default function App() {
  const { state, dispatch } = useAppState();
  const refData = useReferenceData(); // agents, maps, players from DB
  const [showForm,     setShowForm]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [aiMatchType,  setAiMatchType]  = useState(null); // 'Scrim' | 'Tournament' | null
  const dropdownRef = useRef();
  const { matches, filters, activeView, loading, error, apiError } = state;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const filtered = useFilters(matches, filters);
  const players  = getPlayers(matches);
  const wins     = filtered.filter((m) => m.result === 'Win').length;
  const total    = filtered.length;

  return (
    <div style={styles.root}>
      <div className="bg-grid" />

      {/* ── Header ──────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.logoArea}>
          <div style={styles.logoMark}>▲</div>
          <div>
            <div style={styles.logoTitle}>VALORANT INTEL</div>
            <div style={styles.logoSub}>COACHING SYSTEM</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((n) => (
            <button key={n.id}
              style={{ ...styles.navBtn, ...(activeView === n.id ? styles.navBtnActive : {}) }}
              onClick={() => dispatch({ type: 'SET_VIEW', view: n.id })}>
              {n.label}
            </button>
          ))}
        </nav>

        <div style={{ fontSize: 11, color: C.textSecondary, letterSpacing: 1 }}>
          {loading ? (
            <span style={{ color: C.textMuted }}>LOADING...</span>
          ) : total > 0 ? (
            <span>
              <span style={{ color: C.green }}>{wins}W</span>
              {' / '}
              <span style={{ color: C.red }}>{total - wins}L</span>
              {' · '}{pct(wins, total)}% WR
            </span>
          ) : 'No matches'}
        </div>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button style={styles.addMatchBtn} onClick={() => setShowDropdown((v) => !v)}>
            + ADD MATCH ▾
          </button>
          {showDropdown && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 200,
              background: '#1a1a2e', border: `1px solid #ff4444`,
              borderRadius: 4, minWidth: 180, overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}>
              {[
                { label: '🎮  SCRIM',      type: 'Scrim' },
                { label: '🏆  TOURNAMENT', type: 'Tournament' },
              ].map(({ label, type }) => (
                <button
                  key={type}
                  style={{
                    display: 'block', width: '100%', background: 'none',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: '#e0e0e0', padding: '12px 18px', fontSize: 11,
                    fontFamily: 'inherit', fontWeight: 700, letterSpacing: 2,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,68,68,0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  onClick={() => {
                    setShowDropdown(false);
                    setAiMatchType(type);
                  }}
                >
                  {label}
                  <div style={{ fontSize: 9, color: '#888', fontWeight: 400, marginTop: 2, letterSpacing: 1 }}>
                    Upload file · AI extraction
                  </div>
                </button>
              ))}
              <button
                style={{
                  display: 'block', width: '100%', background: 'none',
                  border: 'none', color: '#888', padding: '10px 18px', fontSize: 10,
                  fontFamily: 'inherit', letterSpacing: 2, cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                onClick={() => { setShowDropdown(false); setShowForm(true); }}
              >
                ✎  MANUAL ENTRY
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Filters ─────────────────────────────────────── */}
      <FiltersPanel filters={filters} dispatch={dispatch} matches={matches} players={players} />

      {/* ── API Error Banner ────────────────────────────── */}
      {(error || apiError) && (
        <div style={styles.errorBanner}>
          ⚠ {error || apiError}
          {error && (
            <span style={{ marginLeft: 12, fontSize: 10, color: C.textMuted }}>
              — Check that your PHP backend is running at the correct URL
            </span>
          )}
        </div>
      )}

      {/* ── Loading Screen ──────────────────────────────── */}
      {loading && (
        <div style={styles.loadingScreen}>
          <div style={styles.loadingSpinner}>▲</div>
          <div style={styles.loadingText}>CONNECTING TO DATABASE...</div>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────── */}
      {!loading && (
        <main style={styles.main}>

          {activeView === 'dashboard' && (
            <>
              <SectionHeader title="TEAM PERFORMANCE" sub={`${filtered.length} matches · ${wins} wins`} />
              <PerformanceSummary matches={filtered} />
              <SectionHeader title="RECENT MATCHES" sub="Latest 5 results" />
              <div style={styles.matchList}>
                {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
                  .map((m) => <MatchRow key={m.id} match={m} onDelete={(id) => dispatch({ type: 'DELETE_MATCH', id })} />)}
                {filtered.length === 0 && <div style={styles.empty}>No matches found for the current filters.</div>}
              </div>
            </>
          )}

          {activeView === 'players' && (
            <>
              <SectionHeader title="PLAYER BREAKDOWN" sub="Aggregated performance across filtered matches" />
              <div style={styles.playersGrid}>
                {players.map((p) => <PlayerCard key={p} player={p} matches={filtered} />)}
              </div>
              {players.length === 0 && <div style={styles.empty}>No player data yet. Add some matches first.</div>}
            </>
          )}

          {activeView === 'matches' && (
            <>
              <SectionHeader title="MATCH HISTORY" sub={`${filtered.length} matches`} />
              <div style={styles.matchList}>
                {[...filtered].sort((a, b) => b.date.localeCompare(a.date))
                  .map((m) => <MatchRow key={m.id} match={m} onDelete={(id) => dispatch({ type: 'DELETE_MATCH', id })} />)}
                {filtered.length === 0 && <div style={styles.empty}>No matches found.</div>}
              </div>
            </>
          )}

          {activeView === 'stats' && (
            <>
              <SectionHeader title="STATS TABLE" sub="Click column headers to sort · Green = best · Red = below threshold" />
              <StatsTable matches={filtered} />
            </>
          )}

        </main>
      )}

      {showForm    && <MatchForm dispatch={dispatch} onClose={() => setShowForm(false)} refData={refData} />}
      {aiMatchType && (
        <AIUploadModal
          matchType={aiMatchType}
          dispatch={dispatch}
          onClose={() => setAiMatchType(null)}
          refData={refData}
        />
      )}
    </div>
  );
}

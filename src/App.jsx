import { useState, useEffect, useRef } from 'react';
import { useAppState } from './hooks/useAppState';
import { useReferenceData } from './hooks/useReferenceData';
import { useFilters } from './hooks/useFilters';
import { pct } from './utils/statsHelpers';

import { PerformanceSummary } from './components/PerformanceSummary';
import { PlayerCard } from './components/PlayerCard';
import { StatsTable } from './components/StatsTable';
import { MatchForm } from './components/MatchForm';
import { MatchRow } from './components/MatchRow';
import { AIUploadModal } from './components/AIUploadModal';

function getPlayers(matches) {
  const set = new Set();
  matches.forEach(m => (m.playerStats || []).forEach(ps => set.add(ps.player)));
  return [...set].sort();
}

function getPlayerMatchCards(matches) {
  return [...matches]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((m) =>
      (m.playerStats || []).map((ps) => ({
        id: `${m.id}:${ps.player}`,
        player: ps.player,
        row: ps,
        match: m,
      }))
    );
}

const NAV = [
  { id: 'dashboard', label: 'Overview',  icon: '⬡' },
  { id: 'matches',   label: 'Matches',   icon: '⊞' },
  { id: 'players',   label: 'Players',   icon: '◈' },
  { id: 'stats',     label: 'Stats',     icon: '▦' },
];

const PAGE_TITLES = {
  dashboard: 'Overview',
  matches:   'Match History',
  players:   'Player Breakdown',
  stats:     'Stats Table',
};

export default function App() {
  const { state, dispatch } = useAppState();
  const refData = useReferenceData();
  const [showForm, setShowForm] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [aiMatchType, setAiMatchType] = useState(null);
  const dropRef = useRef();
  const { matches, filters, activeView, loading, error, apiError } = state;

  useEffect(() => {
    if (!showDrop) return;
    const h = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDrop]);

  const filtered = useFilters(matches, filters);
  const players = getPlayers(matches);
  const playerMatchCards = getPlayerMatchCards(filtered);
  const visiblePlayerCards = filters.player === 'All'
    ? playerMatchCards
    : playerMatchCards.filter((card) => card.player === filters.player);
  const wins = filtered.filter(m => m.result === 'Win').length;
  const total = filtered.length;

  const MAPS_OPTS = ['All', ...new Set(matches.map(m => m.map).filter(Boolean))];
  const OPP_OPTS  = ['All', ...new Set(matches.map(m => m.opponent).filter(Boolean))];
  const PLR_OPTS  = ['All', ...players];

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-tri" />
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item${activeView === n.id ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_VIEW', view: n.id })}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main ──────────────────────────────── */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{PAGE_TITLES[activeView]}</div>
            <div className="topbar-sub">
              {loading ? 'loading...' : `${filtered.length} matches in view`}
            </div>
          </div>
          <div className="topbar-right">
            {total > 0 && !loading && (
              <div className="wl-badge">
                <span className="wl-win">{wins}W</span>
                <span className="wl-sep">·</span>
                <span className="wl-loss">{total - wins}L</span>
                <span className="wl-sep">·</span>
                <span className="wl-pct">{pct(wins, total)}%</span>
              </div>
            )}
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button className="add-btn" onClick={() => setShowDrop(v => !v)}>
                <span>＋</span> Add Match
              </button>
              {showDrop && (
                <div className="dropdown-menu">
                  {[{ label: 'Scrim', emoji: '🎮', type: 'Scrim' }, { label: 'Tournament', emoji: '🏆', type: 'Tournament' }].map(x => (
                    <button key={x.type} className="dropdown-item" onClick={() => { setShowDrop(false); setAiMatchType(x.type); }}>
                      {x.emoji} {x.label}
                      <span className="dropdown-item-sub">AI screenshot import</span>
                    </button>
                  ))}
                  <button className="dropdown-item" onClick={() => { setShowDrop(false); setShowForm(true); }}>
                    ✎ Manual Entry
                    <span className="dropdown-item-sub">Fill in stats manually</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Filter bar */}
        <div className="filter-bar">
          <FilterSel label="Map"      val={filters.map}    opts={MAPS_OPTS}              onChange={v => dispatch({ type:'SET_FILTER',key:'map',value:v })} />
          <FilterSel label="Type"     val={filters.type}   opts={['All','Tournament','Scrim']} onChange={v => dispatch({ type:'SET_FILTER',key:'type',value:v })} />
          <FilterSel label="Player"   val={filters.player} opts={PLR_OPTS}               onChange={v => dispatch({ type:'SET_FILTER',key:'player',value:v })} />
          <FilterSel label="Opponent" val={filters.opponent || 'All'} opts={OPP_OPTS}    onChange={v => dispatch({ type:'SET_FILTER',key:'opponent',value:v==='All'?'':v })} />
          <button className="filter-reset" onClick={() => dispatch({ type:'RESET_FILTERS' })}>Reset</button>
        </div>

        {/* Error */}
        {(error || apiError) && (
          <div className="error-banner">⚠ {error || apiError}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="loading-screen">
            <div className="loading-tri" />
            <div className="loading-text">Connecting to database...</div>
          </div>
        )}

        {/* Pages */}
        {!loading && (
          <main className="page">
            {activeView === 'dashboard' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Team Performance</span>
                  <span className="section-sub">{filtered.length} matches · {wins} wins</span>
                </div>
                <PerformanceSummary matches={filtered} />
                <div className="section-header">
                  <span className="section-title">Recent Matches</span>
                  <span className="section-sub">Latest 5 results</span>
                </div>
                <div className="match-list">
                  {[...filtered].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5)
                    .map(m => <MatchRow key={m.id} match={m} onDelete={id => dispatch({ type:'DELETE_MATCH',id })} />)}
                  {filtered.length === 0 && <div className="empty-state">No matches found for current filters</div>}
                </div>
              </>
            )}

            {activeView === 'matches' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Match History</span>
                  <span className="section-sub">{filtered.length} matches</span>
                </div>
                <div className="match-list">
                  {[...filtered].sort((a,b) => b.date.localeCompare(a.date))
                    .map(m => <MatchRow key={m.id} match={m} onDelete={id => dispatch({ type:'DELETE_MATCH',id })} />)}
                  {filtered.length === 0 && <div className="empty-state">No matches found</div>}
                </div>
              </>
            )}

            {activeView === 'players' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Player Breakdown</span>
                  <span className="section-sub">One card per player per match</span>
                </div>
                <div className="players-grid">
                  {visiblePlayerCards.map((card) => (
                    <PlayerCard
                      key={card.id}
                      player={card.player}
                      matches={filtered}
                      row={card.row}
                      matchMeta={card.match}
                    />
                  ))}
                </div>
                {visiblePlayerCards.length === 0 && (
                  <div className="empty-state">No player data — add some matches first</div>
                )}
              </>
            )}

            {activeView === 'stats' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Stats Table</span>
                  <span className="section-sub">Click columns to sort</span>
                </div>
                <StatsTable matches={filtered} />
              </>
            )}
          </main>
        )}
      </div>

      {showForm && <MatchForm dispatch={dispatch} onClose={() => setShowForm(false)} refData={refData} />}
      {aiMatchType && <AIUploadModal matchType={aiMatchType} dispatch={dispatch} onClose={() => setAiMatchType(null)} refData={refData} />}
    </div>
  );
}

function FilterSel({ label, val, opts, onChange }) {
  return (
    <div className="filter-group">
      <label className="filter-label">{label}</label>
      <select className="filter-select" value={val} onChange={e => onChange(e.target.value)}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAppState } from './hooks/useAppState';
import { useReferenceData } from './hooks/useReferenceData';
import { useFilters } from './hooks/useFilters';
import { pct } from './utils/statsHelpers';

import { PerformanceSummary } from './components/PerformanceSummary';
import { PlayerCard } from './components/PlayerCard';
import { StatsTable } from './components/StatsTable';
import { MapStatsModule } from './components/MapStatsModule';
import { AgentMapStatsModule } from './components/AgentMapStatsModule';
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
  { id: 'dashboard', label: 'Overview',  mobileLabel: 'Home',    icon: 'overview' },
  { id: 'matches',   label: 'Matches',   mobileLabel: 'Matches', icon: 'matches' },
  { id: 'players',   label: 'Players',   mobileLabel: 'Players', icon: 'players' },
  { id: 'mapStats',  label: 'Map Stats', mobileLabel: 'Maps',    icon: 'maps' },
  { id: 'agentMap',  label: 'Agent Map', mobileLabel: 'Agents',  icon: 'agents' },
  { id: 'stats',     label: 'Stats',     mobileLabel: 'Stats',   icon: 'stats' },
];

const PAGE_TITLES = {
  dashboard: 'Overview',
  matches:   'Match History',
  players:   'Player Breakdown',
  mapStats:  'Map Stats',
  agentMap:  'Agent & Map Stats',
  stats:     'Stats Table',
};
function NavIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.8V21h14V9.8" />
        </svg>
      );
    case 'matches':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'players':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <path d="M4 19c.7-2.4 2.7-4 5-4s4.3 1.6 5 4" />
          <circle cx="17" cy="10" r="2.2" />
          <path d="M14.8 18c.5-1.7 1.9-2.9 3.8-2.9" />
        </svg>
      );
    case 'maps':
      return (
        <svg {...common}>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'agents':
      return (
        <svg {...common}>
          <path d="M12 3l7 4v5c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V7l7-4z" />
          <path d="M9.4 12.2l1.9 1.9 3.6-3.8" />
        </svg>
      );
    case 'stats':
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20v-4" />
        </svg>
      );
    default:
      return null;
  }
}

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
  const groupedPlayerCards = visiblePlayerCards.reduce((acc, card) => {
    const opponent = (card.match?.opponent || 'Unknown').trim() || 'Unknown';
    if (!acc[opponent]) acc[opponent] = [];
    acc[opponent].push(card);
    return acc;
  }, {});
  const groupedPlayerEntries = Object.entries(groupedPlayerCards);
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
              <span className="nav-icon"><NavIcon name={n.icon} /></span>
              <span className="nav-label nav-label-desktop">{n.label}</span>
              <span className="nav-label nav-label-mobile">{n.mobileLabel}</span>
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
                <div className="opponent-groups">
                  {groupedPlayerEntries.map(([opponent, cards]) => {
                    const mapNames = [...new Set(cards.map((c) => (c.match?.map || '').trim()).filter(Boolean))];
                    const mapLabel = mapNames.length === 1 ? mapNames[0] : mapNames.length > 1 ? 'Mixed' : '-';
                    return (
                      <section key={opponent} className="opponent-group">
                        <div className="opponent-separator">
                          <span className="opponent-vs">VS</span>
                          <span className="opponent-name">{opponent}</span>
                          <span className="opponent-map">MAP: {mapLabel}</span>
                        </div>
                        <div className="players-grid">
                          {cards.map((card) => (
                            <PlayerCard
                              key={card.id}
                              player={card.player}
                              matches={filtered}
                              row={card.row}
                              matchMeta={card.match}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {visiblePlayerCards.length === 0 && (
                  <div className="empty-state">No player data — add some matches first</div>
                )}
              </>
            )}
            {activeView === 'mapStats' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Map Stats</span>
                  <span className="section-sub">Map win rates with side splits and pistol performance</span>
                </div>
                <MapStatsModule matches={filtered} mapNames={refData.mapNames} />
              </>
            )}
            {activeView === 'agentMap' && (
              <>
                <div className="section-header" style={{ marginTop: 4 }}>
                  <span className="section-title">Agent &amp; Map Stats</span>
                  <span className="section-sub">Agent win rates and usage by map</span>
                </div>
                <AgentMapStatsModule
                  matches={filtered}
                  mapNames={refData.mapNames}
                  agentNames={refData.agentNames}
                />
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


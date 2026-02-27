// src/components/FiltersPanel.jsx
import { useMemo } from 'react';
import { MAPS } from '../data/sampleData';
import { styles } from '../styles/tokens';

export function FiltersPanel({ filters, dispatch, matches, players = [] }) {
  const opponents = useMemo(
    () => ['All', ...new Set(matches.map((m) => m.opponent).filter(Boolean))],
    [matches]
  );
  const allPlayers = ['All', ...players];

  return (
    <div style={styles.filtersPanel}>
      <div style={styles.filtersRow}>
        <FilterSelect label="Map"      value={filters.map}    options={['All', ...MAPS]}          onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'map',    value: v })} />
        <FilterSelect label="Type"     value={filters.type}   options={['All', 'Tournament', 'Scrim']} onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'type',   value: v })} />
        <FilterSelect label="Player"   value={filters.player} options={allPlayers}                onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'player', value: v })} />
        <FilterSelect label="Opponent" value={filters.opponent === '' ? 'All' : filters.opponent} options={opponents}
          onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'opponent', value: v === 'All' ? '' : v })} />
        <button style={styles.resetBtn} onClick={() => dispatch({ type: 'RESET_FILTERS' })}>RESET</button>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={styles.filterGroup}>
      <label style={styles.filterLabel}>{label}</label>
      <select style={styles.filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

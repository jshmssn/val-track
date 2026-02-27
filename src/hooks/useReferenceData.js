// ============================================================
// src/hooks/useReferenceData.js
//
// Loads agents, maps, and players from the PHP backend
// (reference.php) once on mount and caches them in state.
//
// Returns { agents, maps, players, loading, error }
//   agents  — [{ id, name, role }]  sorted by role then name
//   maps    — [{ id, name }]        sorted by name
//   players — [{ id, ign, role }]   sorted by ign
// ============================================================

import { useState, useEffect } from 'react';
import { referenceApi } from '../api/matchesApi';

export function useReferenceData() {
  const [agents,  setAgents]  = useState([]);
  const [maps,    setMaps]    = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      referenceApi.agents(),
      referenceApi.maps(),
    ])
      .then(([agentRows, mapRows]) => {
        if (cancelled) return;
        setAgents(agentRows);
        setMaps(mapRows);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useReferenceData: failed to load reference data', err);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Convenience: just the name strings (for dropdowns that only need names)
  const agentNames  = agents.map((a) => a.name);
  const mapNames    = maps.map((m) => m.name);
  const playerNames = players.map((p) => p.ign);

  return { agents, maps, players, agentNames, mapNames, playerNames, loading, error };
}

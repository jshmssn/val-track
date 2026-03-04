import { useState, useEffect, useCallback } from 'react';
import { referenceApi } from '../api/matchesApi';

export function useReferenceData() {
  const [agents, setAgents] = useState([]);
  const [maps, setMaps] = useState([]);
  const [players, setPlayers] = useState([]);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [agentsRes, mapsRes, playersRes, teamRes, teamsRes] = await Promise.allSettled([
        referenceApi.agents(),
        referenceApi.maps(),
        referenceApi.players(),
        referenceApi.team(),
        referenceApi.teams(),
      ]);

      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value || []);
      else setAgents([]);

      if (mapsRes.status === 'fulfilled') setMaps(mapsRes.value || []);
      else setMaps([]);

      if (playersRes.status === 'fulfilled') setPlayers(playersRes.value || []);
      else setPlayers([]);

      // Prefer type=team for the currently authenticated user's scoped team.
      if (teamRes.status === 'fulfilled') {
        setTeam(teamRes.value || null);
      } else {
        setTeam(null);
      }

      // Only fail hard if core reference datasets are unavailable.
      if (
        agentsRes.status === 'rejected' &&
        mapsRes.status === 'rejected' &&
        playersRes.status === 'rejected'
      ) {
        throw agentsRes.reason || mapsRes.reason || playersRes.reason;
      }

      setError(null);
    } catch (err) {
      console.error('useReferenceData: failed to load reference data', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const agentNames = agents.map((a) => a.name);
  const mapNames = maps.map((m) => m.name);
  const playerNames = players.map((p) => p.ign);

  return { agents, maps, players, team, agentNames, mapNames, playerNames, loading, error, refresh };
}

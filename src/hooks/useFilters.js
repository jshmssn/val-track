// ============================================================
// src/hooks/useFilters.js
// Reusable filter logic — applies all active filters to matches.
// ============================================================

import { useMemo } from "react";

/**
 * @param {import('../types').Match[]} matches
 * @param {{ map: string, type: string, player: string, opponent: string }} filters
 * @returns {import('../types').Match[]}
 */
export function useFilters(matches, filters) {
  return useMemo(() => {
    return matches.filter((m) => {
      if (filters.map !== "All" && m.map !== filters.map) return false;
      if (filters.type !== "All" && m.type !== filters.type) return false;
      if (filters.opponent && m.opponent !== filters.opponent) return false;
      if (
        filters.player !== "All" &&
        !m.playerStats.some((ps) => ps.player === filters.player)
      )
        return false;
      return true;
    });
  }, [matches, filters]);
}

// ============================================================
// src/utils/statsHelpers.js
// Pure utility functions — no React dependencies.
// Safe to reuse in a Node.js backend or test suite.
// ============================================================

/** Percentage: (numerator / denominator) * 100, rounded */
export const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Average of a number array */
export const avg = (arr) =>
  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

/** Format number to fixed decimals */
export const fmt = (n, dec = 0) => Number(n).toFixed(dec);

/**
 * Aggregate per-player stats across an array of matches.
 * Returns one row per player with averaged metrics.
 * @param {import('../types').Match[]} matches
 * @returns {import('../types').AggregatedPlayerRow[]}
 */
export function aggregatePlayerStats(matches) {
  const map = {};
  matches.forEach((m) => {
    m.playerStats.forEach((ps) => {
      if (!map[ps.player]) {
        map[ps.player] = { player: ps.player, agents: new Set(), rows: [] };
      }
      map[ps.player].agents.add(ps.agent);
      map[ps.player].rows.push(ps);
    });
  });

  return Object.values(map).map(({ player, agents, rows }) => ({
    player,
    agents: [...agents],
    matches: rows.length,
    acs:        avg(rows.map((r) => r.acs)),
    kd:         avg(rows.map((r) => r.kd)),
    adr:        avg(rows.map((r) => r.adr)),
    kast:       avg(rows.map((r) => r.kast)),
    fkRate:     avg(rows.map((r) => r.fkRate)),
    clutchRate: avg(rows.map((r) => r.clutchRate)),
  }));
}

/**
 * Aggregate team-level metrics across an array of matches.
 * @param {import('../types').Match[]} matches
 * @returns {{ atkPct, defPct, postPlantPct, atkPistolWins, defPistolWins } | null}
 */
export function aggregateTeamMetrics(matches) {
  if (matches.length === 0) return null;
  const tm = matches.map((m) => m.teamMetrics);

  const atkWins  = tm.reduce((a, t) => a + t.atkWins, 0);
  const atkTotal = tm.reduce((a, t) => a + t.atkRounds, 0);
  const defWins  = tm.reduce((a, t) => a + t.defWins, 0);
  const defTotal = tm.reduce((a, t) => a + t.defRounds, 0);
  const ppWins   = tm.reduce((a, t) => a + t.postPlantWins, 0);
  const ppTotal  = tm.reduce((a, t) => a + t.postPlantTotal, 0);
  const atkPistolWins = tm.filter((t) => t.atkPistolWin === "Win").length;
  const defPistolWins = tm.filter((t) => t.defPistolWin === "Win").length;

  return {
    atkPct:       pct(atkWins, atkTotal),
    defPct:       pct(defWins, defTotal),
    postPlantPct: pct(ppWins, ppTotal),
    atkPistolWins,
    defPistolWins,
    pistolTotal:  tm.length,
  };
}

/**
 * Classify a player based on their aggregated stats.
 * Returns a tag object with label and color.
 */
export function classifyPlayer(stats) {
  const isTop = stats.acs >= 230 && stats.kd >= 1.1;
  const isLow = stats.acs < 190 || stats.kd < 0.9;
  if (isTop) return { label: "TOP PERFORMER",    color: "#a8ff78" };
  if (isLow) return { label: "NEEDS IMPROVEMENT", color: "#ff4655" };
  return       { label: "STABLE",               color: "#ffd700" };
}

<?php
// ============================================================
// backend/services/AnalyticsCalculator.php
//
// Mirrors every Excel formula from both workbooks:
//   - Player_Stats: ACS, KDA, FB, per-map/agent averages,
//                   per-player filtered output, ACS calculator
//   - Scrims:       Map Win%, Attack Win%, Defense Win%,
//                   A/D PIS Win%, Agent Map Win%,
//                   team-composition-based stats
// ============================================================

declare(strict_types=1);

class AnalyticsCalculator
{
    // ── 1. Basic stat helpers ────────────────────────────────

    /**
     * KDA = (Kills + Assists) / max(Deaths, 1)
     * Excel: =IFERROR(SUM(G,I)/H, "")
     */
    public static function kda(int $kills, int $deaths, int $assists): float
    {
        return $deaths > 0
            ? round(($kills + $assists) / $deaths, 2)
            : round(($kills + $assists) / 1, 2);
    }

    /**
     * ACS calculator — mirrors the Excel "ACS calculator" sheet formula:
     * =( (140*(K/24)) + (35*(D/24)) + (20*(A/24)) )
     *   * MAX(0.85, MIN(1.15, 1 + 0.15*((K-D)/24)))
     * + RANDBETWEEN(25,75)
     *
     * NOTE: The RANDBETWEEN component is a placeholder in the sheet for
     * demo purposes. In PHP we compute deterministic ACS (no random noise).
     * Pass $includeNoise = true only for simulation use-cases.
     */
    public static function calculateACS(
        int $kills,
        int $deaths,
        int $assists,
        int $fb = 0,
        bool $includeNoise = false
    ): float {
        $baseScore = (140 * ($kills / 24))
                   + (35  * ($deaths / 24))
                   + (20  * ($assists / 24));

        $multiplier = max(0.85, min(1.15, 1 + 0.15 * (($kills - $deaths) / 24)));

        $acs = $baseScore * $multiplier;

        if ($includeNoise) {
            $acs += mt_rand(25, 75);
        }

        return round($acs, 1);
    }

    // ── 2. Average helpers ───────────────────────────────────

    /**
     * Safe average of an array; returns null (→ Excel "") when empty.
     */
    public static function safeAvg(array $values): ?float
    {
        $values = array_filter($values, fn($v) => $v !== null && $v !== '');
        if (count($values) === 0) return null;
        return round(array_sum($values) / count($values), 2);
    }

    /**
     * AVERAGEIF — average of $valueCol where $conditionCol === $criteria
     * Excel: =IFERROR(AVERAGEIF(range, criteria, avg_range), "")
     */
    public static function averageIf(
        array $conditionCol,
        mixed $criteria,
        array $valueCol
    ): ?float {
        $matched = [];
        foreach ($conditionCol as $i => $cond) {
            if ($cond === $criteria && isset($valueCol[$i]) && is_numeric($valueCol[$i])) {
                $matched[] = (float)$valueCol[$i];
            }
        }
        return count($matched) > 0
            ? round(array_sum($matched) / count($matched), 2)
            : null;
    }

    /**
     * COUNTIF — count rows where $conditionCol === $criteria
     */
    public static function countIf(array $conditionCol, $criteria): int
    {
        return count(array_filter($conditionCol, fn($v) => $v === $criteria));
    }

    /**
     * SUMIF — sum of $valueCol where $conditionCol === $criteria
     */
    public static function sumIf(
        array $conditionCol,
        mixed $criteria,
        array $valueCol
    ): float {
        $sum = 0.0;
        foreach ($conditionCol as $i => $cond) {
            if ($cond === $criteria && isset($valueCol[$i])) {
                $sum += (float)$valueCol[$i];
            }
        }
        return $sum;
    }

    // ── 3. Player Stats analytics ────────────────────────────

    /**
     * Per-map averages for a single player.
     * Excel: =IFERROR(AVERAGEIF(map_output, mapName, acs_output), "")
     *
     * Returns array keyed by map name → [acs, kda, fb, count]
     */
    public static function playerMapAverages(array $rows): array
    {
        // $rows: each has map, acs, kda, fb
        $maps = array_unique(array_column($rows, 'map'));
        $result = [];

        $mapCol = array_column($rows, 'map');
        $acsCol = array_column($rows, 'acs');
        $kdaCol = array_column($rows, 'kda');
        $fbCol  = array_column($rows, 'fb');

        foreach ($maps as $map) {
            if (empty($map)) continue;
            $result[$map] = [
                'map'   => $map,
                'acs'   => self::averageIf($mapCol, $map, $acsCol),
                'kda'   => self::averageIf($mapCol, $map, $kdaCol),
                'fb'    => self::averageIf($mapCol, $map, $fbCol),
                'count' => self::countIf($mapCol, $map),
            ];
        }

        ksort($result);
        return array_values($result);
    }

    /**
     * Per-agent averages for a single player.
     * Excel: =IFERROR(AVERAGEIF(agent_output, agentName, acs_output), "")
     */
    public static function playerAgentAverages(array $rows): array
    {
        $agents = array_unique(array_column($rows, 'agent'));
        $result = [];

        $agentCol = array_column($rows, 'agent');
        $acsCol   = array_column($rows, 'acs');
        $kdaCol   = array_column($rows, 'kda');
        $fbCol    = array_column($rows, 'fb');

        foreach ($agents as $agent) {
            if (empty($agent)) continue;
            $result[$agent] = [
                'agent' => $agent,
                'acs'   => self::averageIf($agentCol, $agent, $acsCol),
                'kda'   => self::averageIf($agentCol, $agent, $kdaCol),
                'fb'    => self::averageIf($agentCol, $agent, $fbCol),
                'count' => self::countIf($agentCol, $agent),
            ];
        }

        uasort($result, fn($a, $b) => $b['count'] <=> $a['count']);
        return array_values($result);
    }

    /**
     * Overall averages (the "Overall" row in Excel Home sheet).
     * Excel: =IFERROR(AVERAGE(acs_output), "")
     */
    public static function playerOverallAverages(array $rows): array
    {
        if (empty($rows)) return [];

        $acsVals = array_filter(array_column($rows, 'acs'), 'is_numeric');
        $kdaVals = array_filter(array_column($rows, 'kda'), 'is_numeric');
        $fbVals  = array_filter(array_column($rows, 'fb'),  'is_numeric');

        return [
            'acs'   => self::safeAvg(array_values($acsVals)),
            'kda'   => self::safeAvg(array_values($kdaVals)),
            'fb'    => self::safeAvg(array_values($fbVals)),
            'count' => count($rows),
        ];
    }

    /**
     * Filter rows — implements the Excel chained filter pipeline:
     * player_filter → type_filter → map_filter → agent_filter → date_filter
     *
     * All parameters are optional (null = no filter = show all).
     */
    public static function filterRows(
        array   $rows,
        ?string $player    = null,
        ?string $type      = null,
        ?string $map       = null,
        ?string $agent     = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        return array_values(array_filter($rows, function ($row) use (
            $player, $type, $map, $agent, $dateStart, $dateEnd
        ) {
            if ($player !== null && $player !== '' && ($row['player'] ?? '') !== $player)
                return false;
            if ($type !== null && $type !== '' && ($row['type'] ?? '') !== $type)
                return false;
            if ($map !== null && $map !== '' && ($row['map'] ?? '') !== $map)
                return false;
            if ($agent !== null && $agent !== '' && ($row['agent'] ?? '') !== $agent)
                return false;
            if ($dateStart !== null && $dateStart !== '' && ($row['played_at'] ?? '') < $dateStart)
                return false;
            if ($dateEnd !== null && $dateEnd !== '' && ($row['played_at'] ?? '') > $dateEnd)
                return false;
            return true;
        }));
    }

    // ── 4. Scrims analytics ──────────────────────────────────

    /**
     * Map win percentages.
     * Excel Map% sheet formulas:
     *   Map Win%   = COUNTIFS(smap,map, swld,"W") / COUNTIF(smap,map)
     *   A Win%     = SUMIF(smap,map,sarw) / (SUMIF(smap,map,sarw)+SUMIF(smap,map,sarl))
     *   D Win%     = SUMIF(smap,map,sdrw) / (SUMIF(smap,map,sdrw)+SUMIF(smap,map,sdrl))
     *   A PIS Win% = COUNTIFS(sapis,"W",smap,map) / COUNTIF(smap,map)
     *   D PIS Win% = COUNTIFS(sdpis,"W",smap,map) / COUNTIF(smap,map)
     *   Overall:     same formulas across ALL maps combined
     */
    public static function mapWinPercentages(array $scrims): array
    {
        $maps = array_unique(array_column($scrims, 'map'));
        sort($maps);

        $result = [];

        // Overall (across all maps)
        $result['Overall'] = self::computeMapStats($scrims, null);

        foreach ($maps as $map) {
            if (empty($map)) continue;
            $result[$map] = self::computeMapStats($scrims, $map);
        }

        return $result;
    }

    private static function computeMapStats(array $scrims, ?string $mapFilter): array
    {
        $rows = $mapFilter !== null
            ? array_filter($scrims, fn($r) => $r['map'] === $mapFilter)
            : $scrims;
        $rows = array_values($rows);

        $total = count($rows);
        if ($total === 0) {
            return [
                'map'            => $mapFilter ?? 'Overall',
                'times_played'   => 0,
                'map_win_pct'    => null,
                'atk_win_pct'    => null,
                'def_win_pct'    => null,
                'atk_pis_win_pct'=> null,
                'def_pis_win_pct'=> null,
            ];
        }

        $wins       = count(array_filter($rows, fn($r) => $r['result'] === 'W'));
        $losses     = count(array_filter($rows, fn($r) => $r['result'] === 'L'));
        $draws      = count(array_filter($rows, fn($r) => $r['result'] === 'D'));

        // Map Win% = W / (W+L+D) — Excel uses all three in denominator
        $mapWinPct  = ($wins + $losses + $draws) > 0
            ? round($wins / ($wins + $losses + $draws) * 100, 1) : null;

        // Attack win% = sum(atk_rw) / (sum(atk_rw) + sum(atk_rl))
        $sumAtkRw   = array_sum(array_column($rows, 'atk_rw'));
        $sumAtkRl   = array_sum(array_column($rows, 'atk_rl'));
        $atkWinPct  = ($sumAtkRw + $sumAtkRl) > 0
            ? round($sumAtkRw / ($sumAtkRw + $sumAtkRl) * 100, 1) : null;

        // Defense win%
        $sumDefRw   = array_sum(array_column($rows, 'def_rw'));
        $sumDefRl   = array_sum(array_column($rows, 'def_rl'));
        $defWinPct  = ($sumDefRw + $sumDefRl) > 0
            ? round($sumDefRw / ($sumDefRw + $sumDefRl) * 100, 1) : null;

        // A PIS Win% = COUNTIFS(sapis="W", smap=map) / COUNTIF(smap,map)
        $atkPisWins = count(array_filter($rows, fn($r) => $r['atk_pis'] === 'W'));
        $atkPisWinPct = $total > 0
            ? round($atkPisWins / $total * 100, 1) : null;

        $defPisWins = count(array_filter($rows, fn($r) => $r['def_pis'] === 'W'));
        $defPisWinPct = $total > 0
            ? round($defPisWins / $total * 100, 1) : null;

        return [
            'map'             => $mapFilter ?? 'Overall',
            'times_played'    => $total,
            'map_win_pct'     => $mapWinPct,
            'atk_win_pct'     => $atkWinPct,
            'def_win_pct'     => $defWinPct,
            'atk_pis_win_pct' => $atkPisWinPct,
            'def_pis_win_pct' => $defPisWinPct,
        ];
    }

    /**
     * Agent Map Win% — mirrors "Agent Map%" sheet.
     * Excel: =IFERROR(COUNTIFS(wld,"W",team_comp,"*Agent*",map_data,mapName)
     *                /COUNTIFS(team_comp,"*Agent*",map_data,mapName), "")
     *
     * team_comp is a string like "Iso/Jett/Omen/Sova/Killjoy"
     * We use stripos wildcard matching (LIKE *Agent*).
     */
    public static function agentMapWinPercentages(array $scrims): array
    {
        // Collect all agents that appear in any team_comp
        $allAgents = [];
        foreach ($scrims as $row) {
            if (!empty($row['team_comp'])) {
                $agents = preg_split('/[\/,\|]/', $row['team_comp']);
                foreach ($agents as $a) {
                    $a = trim($a);
                    if ($a !== '') $allAgents[$a] = true;
                }
            }
        }
        ksort($allAgents);

        $maps = array_unique(array_column($scrims, 'map'));
        sort($maps);

        $result = [];
        foreach (array_keys($allAgents) as $agent) {
            // Each agent entry mirrors Excel's two rows: Win% row + times_played row
            $winPct      = ['agent' => $agent, 'row_type' => 'win_pct'];
            $timesPlayed = ['agent' => $agent, 'row_type' => 'times_played'];

            // Overall column
            // Excel: =IFERROR(COUNTIFS(wld,"W",team_comp,"*Agent*")/COUNTIF(team_comp,"*Agent*"),"")
            $overallStats = self::agentMapStats($scrims, $agent, null);
            $winPct['Overall']      = $overallStats['win_pct'];
            $timesPlayed['Overall'] = $overallStats['count'];

            // Per-map columns
            // Excel: =IFERROR(COUNTIFS(wld,"W",team_comp,"*Agent*",map_data,map)/COUNTIFS(team_comp,"*Agent*",map_data,map),"")
            foreach ($maps as $map) {
                if (empty($map)) continue;
                $mapStats = self::agentMapStats($scrims, $agent, $map);
                $winPct[$map]      = $mapStats['win_pct'];
                $timesPlayed[$map] = $mapStats['count'];
            }

            $result[] = $winPct;
            $result[] = $timesPlayed;
        }

        return $result;
    }

    private static function agentMapStats(
        array $scrims,
        string $agent,
        ?string $map
    ): array {
        $filtered = array_filter($scrims, function ($r) use ($agent, $map) {
            $hasAgent = !empty($r['team_comp'])
                && stripos($r['team_comp'], $agent) !== false;
            if (!$hasAgent) return false;
            if ($map !== null && ($r['map'] ?? '') !== $map) return false;
            return true;
        });

        $total = count($filtered);
        if ($total === 0) return ['win_pct' => null, 'count' => 0];

        $wins = count(array_filter($filtered, fn($r) => $r['result'] === 'W'));
        return [
            'win_pct' => round($wins / $total * 100, 1),
            'count'   => $total,
        ];
    }

    // Keep the old private method name for backward-compat internal use
    private static function agentMapWinPct(
        array $scrims,
        string $agent,
        ?string $map
    ): ?float {
        return self::agentMapStats($scrims, $agent, $map)['win_pct'];
    }

    // ── 5. Player performance classification ─────────────────
    // Mirrors src/utils/statsHelpers.js classifyPlayer()

    public static function classifyPlayer(float $acs, float $kda): array
    {
        if ($acs >= 230 && $kda >= 1.1) {
            return ['label' => 'TOP PERFORMER',    'color' => '#a8ff78'];
        }
        if ($acs < 190 || $kda < 0.9) {
            return ['label' => 'NEEDS IMPROVEMENT', 'color' => '#ff4655'];
        }
        return ['label' => 'STABLE', 'color' => '#ffd700'];
    }

    // ── 6. Multi-player comparison (output_for_averages) ─────

    /**
     * Returns per-player aggregated data so the frontend can
     * render the same multi-player trend lines shown in the
     * Excel Home sheet graphs.
     *
     * $players: ['TenTen','KellyS','JessieVash','Sylvan','Berserx']
     * $allRows: full filtered dataset
     */
    public static function multiPlayerSummary(
        array $players,
        array $allRows,
        ?string $type      = null,
        ?string $map       = null,
        ?string $agent     = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $result = [];
        foreach ($players as $player) {
            $filtered = self::filterRows($allRows, $player, $type, $map, $agent, $dateStart, $dateEnd);
            $overall  = self::playerOverallAverages($filtered);
            $byMap    = self::playerMapAverages($filtered);
            $byAgent  = self::playerAgentAverages($filtered);

            $result[] = [
                'player'       => $player,
                'overall'      => $overall,
                'by_map'       => $byMap,
                'by_agent'     => $byAgent,
                'trend'        => self::buildTrendSeries($filtered),
                'classification' => isset($overall['acs'], $overall['kda'])
                    ? self::classifyPlayer((float)$overall['acs'], (float)$overall['kda'])
                    : null,
            ];
        }
        return $result;
    }

    /**
     * Build time-series data for charting (one point per played_at date).
     * Matches what Excel graphs use: one row per date, averaged if multiple
     * maps played on the same day.
     */
    private static function buildTrendSeries(array $rows): array
    {
        if (empty($rows)) return [];

        $byDate = [];
        foreach ($rows as $row) {
            $d = $row['played_at'];
            $byDate[$d][] = $row;
        }
        ksort($byDate);

        $series = [];
        foreach ($byDate as $date => $dayRows) {
            $series[] = [
                'date' => $date,
                'acs'  => self::safeAvg(array_column($dayRows, 'acs')),
                'kda'  => self::safeAvg(array_column($dayRows, 'kda')),
                'fb'   => self::safeAvg(array_column($dayRows, 'fb')),
                'games'=> count($dayRows),
            ];
        }
        return $series;
    }
}

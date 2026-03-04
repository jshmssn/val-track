<?php
// ============================================================
// backend/models/ScrimsRepository.php
// ============================================================

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class ScrimsRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = getDB();
    }

    // ── Fetch raw scrim rows ─────────────────────────────────

    public function fetchRows(
        string  $teamId,
        ?string $map          = null,
        ?string $type         = null,
        ?string $opponent     = null,
        ?string $result       = null,
        ?string $agentFilter  = null,   // single wildcard match in team_comp (legacy)
        ?string $dateStart    = null,
        ?string $dateEnd      = null,
        int     $limit        = 1500,
        int     $offset       = 0,
        array   $includeAgents = [],    // ALL must appear in team_comp (Excel include1..include5)
        array   $excludeAgents = []     // NONE may appear in team_comp (Excel exclude1..exclude5)
    ): array {
        $where  = ['s.team_id = ?'];
        $params = [$teamId];

        if ($map      !== null && $map !== '')      { $where[] = 'm.name = ?';             $params[] = $map; }
        if ($type     !== null && $type !== '')     { $where[] = 's.type = ?';             $params[] = $type; }
        if ($opponent !== null && $opponent !== '') { $where[] = 's.opponent_name LIKE ?'; $params[] = "%{$opponent}%"; }
        if ($result   !== null && $result !== '')   { $where[] = 's.result = ?';           $params[] = $result; }

        // Legacy single-agent filter
        if ($agentFilter !== null && $agentFilter !== '') {
            $where[]  = 's.team_comp LIKE ?';
            $params[] = "%{$agentFilter}%";
        }

        // Multi-agent INCLUDE: each agent must appear in team_comp
        // Excel: agent_filter uses QUERY WHERE E CONTAINS 'include1' AND E CONTAINS 'include2' ...
        foreach ($includeAgents as $agent) {
            $agent = trim($agent);
            if ($agent !== '') {
                $where[]  = 's.team_comp LIKE ?';
                $params[] = "%{$agent}%";
            }
        }

        // Multi-agent EXCLUDE: none of these agents may appear in team_comp
        foreach ($excludeAgents as $agent) {
            $agent = trim($agent);
            if ($agent !== '') {
                $where[]  = 's.team_comp NOT LIKE ?';
                $params[] = "%{$agent}%";
            }
        }

        if ($dateStart !== null && $dateStart !== '') { $where[] = 's.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 's.played_at <= ?'; $params[] = $dateEnd; }

        $params[] = $limit;
        $params[] = $offset;

        $sql = "
            SELECT
                s.id,
                s.played_at,
                s.opponent_name,
                m.name    AS map,
                s.type,
                s.team_comp,
                s.opp_comp,
                s.result,
                s.rounds_won,
                s.rounds_lost,
                s.atk_pis,
                s.atk_rw,
                s.atk_rl,
                s.def_pis,
                s.def_rw,
                s.def_rl,
                s.vod_url
            FROM scrims s
            JOIN maps m ON s.map_id = m.id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY s.played_at DESC
            LIMIT ? OFFSET ?
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Map win% aggregation (pure SQL version) ──────────────

    public function fetchMapWinStats(
        string  $teamId,
        ?string $type      = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['s.team_id = ?'];
        $params = [$teamId];

        if ($type      !== null && $type !== '')      { $where[] = 's.type = ?';       $params[] = $type; }
        if ($dateStart !== null && $dateStart !== '') { $where[] = 's.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 's.played_at <= ?'; $params[] = $dateEnd; }

        $sql = "
            SELECT
                m.name                           AS map,
                COUNT(s.id)                      AS times_played,
                SUM(s.result = 'W')              AS wins,
                SUM(s.result = 'L')              AS losses,
                SUM(s.result = 'D')              AS draws,
                SUM(s.atk_rw)                    AS sum_atk_rw,
                SUM(s.atk_rl)                    AS sum_atk_rl,
                SUM(s.def_rw)                    AS sum_def_rw,
                SUM(s.def_rl)                    AS sum_def_rl,
                SUM(s.atk_pis = 'W')             AS atk_pis_wins,
                SUM(s.def_pis = 'W')             AS def_pis_wins
            FROM scrims s
            JOIN maps m ON s.map_id = m.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY m.name
            ORDER BY times_played DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $r) {
            $total  = (int)$r['times_played'];
            $w      = (int)$r['wins'];
            $l      = (int)$r['losses'];
            $d      = (int)$r['draws'];
            $atkRW  = (int)$r['sum_atk_rw'];
            $atkRL  = (int)$r['sum_atk_rl'];
            $defRW  = (int)$r['sum_def_rw'];
            $defRL  = (int)$r['sum_def_rl'];

            $result[] = [
                'map'             => $r['map'],
                'times_played'    => $total,
                'wins'            => $w,
                'losses'          => $l,
                'draws'           => $d,
                // Excel: W/(W+L+D)
                'map_win_pct'     => ($w + $l + $d) > 0
                    ? round($w / ($w + $l + $d) * 100, 1) : null,
                // Excel: sumAtkRW/(sumAtkRW+sumAtkRL)
                'atk_win_pct'     => ($atkRW + $atkRL) > 0
                    ? round($atkRW / ($atkRW + $atkRL) * 100, 1) : null,
                'def_win_pct'     => ($defRW + $defRL) > 0
                    ? round($defRW / ($defRW + $defRL) * 100, 1) : null,
                // Excel: COUNTIFS(atk_pis="W",map=x)/COUNTIF(map,x)
                'atk_pis_win_pct' => $total > 0
                    ? round((int)$r['atk_pis_wins'] / $total * 100, 1) : null,
                'def_pis_win_pct' => $total > 0
                    ? round((int)$r['def_pis_wins'] / $total * 100, 1) : null,
            ];
        }
        return $result;
    }

    // ── CRUD ─────────────────────────────────────────────────

    public function insert(array $data): int
    {
        $mapId = $this->resolveMapId($data['map'] ?? '');
        if (!$mapId) throw new \InvalidArgumentException("Unknown map: " . ($data['map'] ?? ''));

        $stmt = $this->db->prepare("
            INSERT INTO scrims
                (team_id, played_at, opponent_name, map_id, type,
                 team_comp, opp_comp, result,
                 rounds_won, rounds_lost,
                 atk_pis, atk_rw, atk_rl,
                 def_pis, def_rw, def_rl,
                 vod_url)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            $data['team_id'],
            $data['played_at'],
            $data['opponent_name']  ?? null,
            $mapId,
            $data['type']           ?? 'Scrim',
            $data['team_comp']      ?? null,
            $data['opp_comp']       ?? null,
            $data['result'],
            $data['rounds_won']     ?? 0,
            $data['rounds_lost']    ?? 0,
            $data['atk_pis']        ?? '',
            $data['atk_rw']         ?? 0,
            $data['atk_rl']         ?? 0,
            $data['def_pis']        ?? '',
            $data['def_rw']         ?? 0,
            $data['def_rl']         ?? 0,
            $data['vod_url']        ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool
    {
        $allowed = [
            'played_at','opponent_name','type','team_comp','opp_comp','result',
            'rounds_won','rounds_lost','atk_pis','atk_rw','atk_rl',
            'def_pis','def_rw','def_rl','vod_url',
        ];
        $fields = [];
        $params = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = ?";
                $params[] = $data[$f];
            }
        }
        if (isset($data['map'])) {
            $mapId = $this->resolveMapId($data['map']);
            if ($mapId) { $fields[] = 'map_id = ?'; $params[] = $mapId; }
        }
        if (empty($fields)) return false;
        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE scrims SET " . implode(', ', $fields) . " WHERE id = ?");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM scrims WHERE id = ?");
        return $stmt->execute([$id]);
    }

    public function resolveMapId(string $mapName): ?int
    {
        $stmt = $this->db->prepare("SELECT id FROM maps WHERE name = ?");
        $stmt->execute([$mapName]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }
}

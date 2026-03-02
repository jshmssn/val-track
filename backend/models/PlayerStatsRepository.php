<?php
// ============================================================
// backend/models/PlayerStatsRepository.php
// ============================================================

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class PlayerStatsRepository
{
    private PDO $db;

    public function __construct()
    {
        $this->db = getDB();
    }

    // ── Fetch raw rows (mirrors "Data" sheet output) ─────────

    public function fetchRows(
        int     $teamId,
        ?string $player    = null,
        ?string $type      = null,
        ?string $map       = null,
        ?string $agent     = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null,
        int     $limit     = 2000,
        int     $offset    = 0
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($player !== null && $player !== '') {
            $where[]  = 'pl.ign = ?';
            $params[] = $player;
        }
        if ($type !== null && $type !== '') {
            $where[]  = 'ps.type = ?';
            $params[] = $type;
        }
        if ($map !== null && $map !== '') {
            $where[]  = 'm.name = ?';
            $params[] = $map;
        }
        if ($agent !== null && $agent !== '') {
            $where[]  = 'a.name = ?';
            $params[] = $agent;
        }
        if ($dateStart !== null && $dateStart !== '') {
            $where[]  = 'ps.played_at >= ?';
            $params[] = $dateStart;
        }
        if ($dateEnd !== null && $dateEnd !== '') {
            $where[]  = 'ps.played_at <= ?';
            $params[] = $dateEnd;
        }

        $params[] = $limit;
        $params[] = $offset;

        $sql = "
            SELECT
                ps.id,
                ps.played_at,
                pl.ign         AS player,
                ps.type,
                m.name         AS map,
                a.name         AS agent,
                a.role         AS agent_role,
                ps.acs,
                ps.kills,
                ps.deaths,
                ps.assists,
                ps.fb,
                ROUND((ps.kills + ps.assists) / GREATEST(ps.deaths, 1), 2) AS kda
            FROM player_stats ps
            JOIN players pl ON ps.player_id = pl.id
            JOIN maps    m  ON ps.map_id    = m.id
            JOIN agents  a  ON ps.agent_id  = a.id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY ps.played_at DESC, pl.ign
            LIMIT ? OFFSET ?
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Per-player aggregated stats directly in SQL ──────────

    public function fetchPlayerAverages(
        int     $teamId,
        ?string $type      = null,
        ?string $map       = null,
        ?string $agent     = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($type      !== null && $type !== '')      { $where[] = 'ps.type = ?';        $params[] = $type; }
        if ($map       !== null && $map !== '')        { $where[] = 'm.name = ?';         $params[] = $map; }
        if ($agent     !== null && $agent !== '')      { $where[] = 'a.name = ?';         $params[] = $agent; }
        if ($dateStart !== null && $dateStart !== '')  { $where[] = 'ps.played_at >= ?';  $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')    { $where[] = 'ps.played_at <= ?';  $params[] = $dateEnd; }

        $sql = "
            SELECT
                pl.id          AS player_id,
                pl.ign         AS player,
                COUNT(ps.id)   AS games,
                ROUND(AVG(ps.acs), 1)    AS avg_acs,
                ROUND(AVG(ps.kills), 1)  AS avg_kills,
                ROUND(AVG(ps.deaths), 1) AS avg_deaths,
                ROUND(AVG(ps.assists), 1)AS avg_assists,
                ROUND(AVG(ps.fb), 2)     AS avg_fb,
                ROUND(AVG((ps.kills + ps.assists) / GREATEST(ps.deaths, 1)), 2) AS avg_kda,
                ROUND(MAX(ps.acs), 0)    AS max_acs,
                ROUND(MIN(ps.acs), 0)    AS min_acs
            FROM player_stats ps
            JOIN players pl ON ps.player_id = pl.id
            JOIN maps    m  ON ps.map_id    = m.id
            JOIN agents  a  ON ps.agent_id  = a.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY pl.id, pl.ign
            ORDER BY avg_acs DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Per-player, per-map averages ─────────────────────────

    public function fetchPlayerMapAverages(
        int     $teamId,
        ?string $player    = null,
        ?string $type      = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($player    !== null && $player !== '')    { $where[] = 'pl.ign = ?';        $params[] = $player; }
        if ($type      !== null && $type !== '')      { $where[] = 'ps.type = ?';       $params[] = $type; }
        if ($dateStart !== null && $dateStart !== '') { $where[] = 'ps.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 'ps.played_at <= ?'; $params[] = $dateEnd; }

        $sql = "
            SELECT
                pl.ign             AS player,
                m.name             AS map,
                COUNT(ps.id)       AS games,
                ROUND(AVG(ps.acs), 1)  AS avg_acs,
                ROUND(AVG((ps.kills + ps.assists) / GREATEST(ps.deaths, 1)), 2) AS avg_kda,
                ROUND(AVG(ps.fb), 2)   AS avg_fb
            FROM player_stats ps
            JOIN players pl ON ps.player_id = pl.id
            JOIN maps    m  ON ps.map_id    = m.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY pl.ign, m.name
            ORDER BY pl.ign, avg_acs DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Per-player, per-agent averages ───────────────────────

    public function fetchPlayerAgentAverages(
        int     $teamId,
        ?string $player    = null,
        ?string $type      = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($player    !== null && $player !== '')    { $where[] = 'pl.ign = ?';        $params[] = $player; }
        if ($type      !== null && $type !== '')      { $where[] = 'ps.type = ?';       $params[] = $type; }
        if ($dateStart !== null && $dateStart !== '') { $where[] = 'ps.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 'ps.played_at <= ?'; $params[] = $dateEnd; }

        $sql = "
            SELECT
                pl.ign             AS player,
                a.name             AS agent,
                a.role             AS agent_role,
                COUNT(ps.id)       AS games,
                ROUND(AVG(ps.acs), 1)  AS avg_acs,
                ROUND(AVG((ps.kills + ps.assists) / GREATEST(ps.deaths, 1)), 2) AS avg_kda,
                ROUND(AVG(ps.fb), 2)   AS avg_fb
            FROM player_stats ps
            JOIN players pl ON ps.player_id = pl.id
            JOIN agents  a  ON ps.agent_id  = a.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY pl.ign, a.name, a.role
            ORDER BY pl.ign, games DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Team-level per-map stats (Home sheet map table) ──────

    public function fetchTeamMapStats(
        int     $teamId,
        ?string $type      = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($type      !== null && $type !== '')      { $where[] = 'ps.type = ?';       $params[] = $type; }
        if ($dateStart !== null && $dateStart !== '') { $where[] = 'ps.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 'ps.played_at <= ?'; $params[] = $dateEnd; }

        $sql = "
            SELECT
                m.name             AS map,
                COUNT(ps.id)       AS total_entries,
                ROUND(AVG(ps.acs), 1)  AS avg_acs,
                ROUND(AVG((ps.kills + ps.assists) / GREATEST(ps.deaths, 1)), 2) AS avg_kda,
                ROUND(AVG(ps.fb), 2)   AS avg_fb
            FROM player_stats ps
            JOIN maps m ON ps.map_id = m.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY m.name
            ORDER BY m.name
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── Team-level per-agent stats (Home sheet agent table) ──

    public function fetchTeamAgentStats(
        int     $teamId,
        ?string $type      = null,
        ?string $dateStart = null,
        ?string $dateEnd   = null
    ): array {
        $where  = ['ps.team_id = ?'];
        $params = [$teamId];

        if ($type      !== null && $type !== '')      { $where[] = 'ps.type = ?';       $params[] = $type; }
        if ($dateStart !== null && $dateStart !== '') { $where[] = 'ps.played_at >= ?'; $params[] = $dateStart; }
        if ($dateEnd   !== null && $dateEnd !== '')   { $where[] = 'ps.played_at <= ?'; $params[] = $dateEnd; }

        $sql = "
            SELECT
                a.name             AS agent,
                a.role             AS agent_role,
                COUNT(ps.id)       AS games,
                ROUND(AVG(ps.acs), 1)  AS avg_acs,
                ROUND(AVG((ps.kills + ps.assists) / GREATEST(ps.deaths, 1)), 2) AS avg_kda,
                ROUND(AVG(ps.fb), 2)   AS avg_fb
            FROM player_stats ps
            JOIN agents a ON ps.agent_id = a.id
            WHERE " . implode(' AND ', $where) . "
            GROUP BY a.name, a.role
            ORDER BY games DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ── CRUD ─────────────────────────────────────────────────

    public function insert(array $data): int
    {
        $stmt = $this->db->prepare("
            INSERT INTO player_stats
                (team_id, player_id, played_at, type, map_id, agent_id, acs, kills, deaths, assists, fb)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $data['team_id'],
            $data['player_id'],
            $data['played_at'],
            $data['type'],
            $data['map_id'],
            $data['agent_id'],
            $data['acs'],
            $data['kills'],
            $data['deaths'],
            $data['assists'],
            $data['fb'] ?? 0,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool
    {
        $fields = [];
        $params = [];
        $allowed = ['played_at','type','map_id','agent_id','acs','kills','deaths','assists','fb'];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = ?";
                $params[] = $data[$f];
            }
        }
        if (empty($fields)) return false;
        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE player_stats SET " . implode(', ', $fields) . " WHERE id = ?");
        return $stmt->execute($params);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM player_stats WHERE id = ?");
        return $stmt->execute([$id]);
    }

    // ── Resolve helpers ───────────────────────────────────────

    public function resolveMapId(string $mapName): ?int
    {
        $stmt = $this->db->prepare("SELECT id FROM maps WHERE name = ?");
        $stmt->execute([$mapName]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }

    public function resolveAgentId(string $agentName): ?int
    {
        $stmt = $this->db->prepare("SELECT id FROM agents WHERE name = ?");
        $stmt->execute([$agentName]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }

    public function resolvePlayerId(string $ign, int $teamId): ?int
    {
        $stmt = $this->db->prepare("SELECT id FROM players WHERE ign = ? AND team_id = ?");
        $stmt->execute([$ign, $teamId]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }
}

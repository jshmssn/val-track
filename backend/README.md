# PHP Backend — Valorant Intel

A lightweight PHP REST API using PDO + MariaDB. No frameworks, no Composer.

---

## Folder Structure

```
backend/
├── api/
│   ├── matches.php      ← GET/POST/PUT/DELETE matches
│   ├── players.php      ← GET/POST/PUT players
│   ├── stats.php        ← GET aggregated stats (map win rates, agent stats, etc.)
│   └── reference.php    ← GET reference data (maps, agents, opponents)
├── config/
│   └── database.php     ← DB credentials ← EDIT THIS
├── helpers/
│   └── response.php     ← JSON helpers, CORS, UUID generator
└── .htaccess            ← CORS headers + Apache config
```

---

## Setup (XAMPP / WAMP)

1. Copy this entire project folder into your `htdocs` directory:
   ```
   htdocs/valorant-tracker/
   ```

2. Import the database:
   - Open phpMyAdmin → Import → select `valorant_intel.sql`

3. Edit `backend/config/database.php`:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'valorant_intel');
   define('DB_USER', 'root');
   define('DB_PASS', '');   // blank for XAMPP default
   ```

4. Copy `.env.example` → `.env` in the React root:
   ```
   REACT_APP_API_URL=https://vl-trck.shares.zrok.io/backend
   REACT_APP_TEAM_ID=aaaaaaaa-0000-0000-0000-000000000001
   ```

5. Start the React app:
   ```bash
   npm install
   npm start
   ```

6. Make sure Apache is running in XAMPP/WAMP.

---

## API Endpoints

### Matches
| Method | URL | Description |
|--------|-----|-------------|
| GET    | `/backend/api/matches.php` | All matches (supports `?map=Ascent&type=Scrim&opponent=Nova+Esports`) |
| GET    | `/backend/api/matches.php?id=xxx` | Single match with full player stats |
| POST   | `/backend/api/matches.php` | Create match + player stats + team metrics |
| PUT    | `/backend/api/matches.php?id=xxx` | Update match fields |
| DELETE | `/backend/api/matches.php?id=xxx` | Delete match (cascades to stats) |

### Players
| Method | URL | Description |
|--------|-----|-------------|
| GET    | `/backend/api/players.php` | All players with career averages |
| GET    | `/backend/api/players.php?id=xxx` | Single player + recent 20 matches |
| POST   | `/backend/api/players.php` | Create player |
| PUT    | `/backend/api/players.php?id=xxx` | Update player |

### Stats
| Method | URL | Description |
|--------|-----|-------------|
| GET    | `/backend/api/stats.php?type=map_winrates&team_id=xxx` | Map win rates |
| GET    | `/backend/api/stats.php?type=agent_stats&team_id=xxx` | Agent pick + perf stats |
| GET    | `/backend/api/stats.php?type=team_economics&team_id=xxx` | Per-match economics |
| GET    | `/backend/api/stats.php?type=player_averages&team_id=xxx` | Player career averages |

### Reference Data
| Method | URL | Description |
|--------|-----|-------------|
| GET    | `/backend/api/reference.php?type=maps` | All active maps |
| GET    | `/backend/api/reference.php?type=agents` | All active agents |
| GET    | `/backend/api/reference.php?type=opponents&team_id=xxx` | Opponents for a team |

---

## POST /api/matches.php — Request Body

```json
{
  "team_id": "aaaaaaaa-0000-0000-0000-000000000001",
  "date": "2025-03-01",
  "opponent": "Nova Esports",
  "map": "Ascent",
  "type": "Tournament",
  "result": "Win",
  "score": "13-9",
  "tournament": "VCT Americas Stage 1",
  "playerStats": [
    {
      "player": "Zephyr",
      "agent": "Jett",
      "acs": 287,
      "kills": 22,
      "deaths": 15,
      "assists": 4,
      "adr": 178,
      "kast": 76,
      "fkRate": 0.68,
      "clutchRate": 0.50
    }
  ],
  "teamMetrics": {
    "atkRounds": 13, "atkWins": 8,
    "defRounds": 9,  "defWins": 5,
    "postPlantTotal": 10, "postPlantWins": 7,
    "ecoTotal": 5, "ecoWins": 3
  }
}
```

---

## Troubleshooting

**CORS error in browser:**
Make sure `mod_headers` is enabled in Apache (it is by default in XAMPP).
Or change `Access-Control-Allow-Origin: *` in `helpers/response.php` to your exact domain.

**"DB connection failed":**
Check `config/database.php` credentials and that MariaDB is running in XAMPP.

**"Unknown map/agent":**
The database must be seeded first (the `valorant_intel.sql` import does this automatically).

# VALORANT INTEL — Coaching Stat Tracker

A professional stat tracking system for Valorant coaches.
Built with React 18 + inline styles (no external CSS deps).

---

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm start
# → Opens at http://localhost:3000
```

---

## Project Structure

```
src/
├── App.jsx                     # Root component, view routing
├── index.js                    # React entry point
├── index.css                   # Global resets + bg texture
│
├── components/
│   ├── FiltersPanel.jsx        # Filter bar (map, type, player, opponent)
│   ├── MatchForm.jsx           # 3-step modal to add a match
│   ├── MatchRow.jsx            # Single match in history list
│   ├── PerformanceSummary.jsx  # KPI cards (win rate, ATK%, DEF%, etc.)
│   ├── PlayerCard.jsx          # Player stat card with performance tag
│   ├── SectionHeader.jsx       # Reusable section title
│   └── StatsTable.jsx          # Sortable aggregate stats table
│
├── data/
│   └── sampleData.js           # Dummy matches, player/agent/map lists
│
├── hooks/
│   ├── useAppState.js          # useReducer — central state
│   └── useFilters.js           # Filter logic (useMemo)
│
├── api/
│   └── matchesApi.js           # API layer stub (ready for backend)
│
├── styles/
│   └── tokens.js               # Design tokens + all inline styles
│
└── utils/
    └── statsHelpers.js         # Pure stat calculation functions
```

---

## Data Structure

Each match follows this schema (ready for a REST API or database ORM):

```js
{
  id: "m1",
  date: "2025-02-10",         // ISO date string
  opponent: "Nova Esports",
  type: "Tournament",          // "Tournament" | "Scrim"
  result: "Win",               // "Win" | "Loss"
  score: "13-9",
  map: "Ascent",

  playerStats: [
    {
      player: "Zephyr",
      agent: "Jett",
      acs: 287,                // Average Combat Score
      kd: 1.45,                // Kill/Death ratio
      adr: 178,                // Average Damage per Round
      kast: 76,                // KAST% (whole number)
      fkRate: 0.68,            // First Kill rate (0–1)
      clutchRate: 0.50,        // Clutch conversion rate (0–1)
    },
    // ... one per player
  ],

  teamMetrics: {
    atkRounds: 13, atkWins: 8,
    defRounds: 9,  defWins: 5,
    postPlantWins: 7, postPlantTotal: 10,
    ecoWins: 3, ecoTotal: 5,
  },
}
```

---

## Connecting a Backend

1. **Set your API URL** in `.env`:
   ```
   REACT_APP_API_URL=http://localhost:4000/api
   ```

2. **Uncomment** the fetch calls in `src/api/matchesApi.js`

3. **Replace** the `useReducer` dispatch calls with React Query mutations:
   ```bash
   npm install @tanstack/react-query
   ```

4. **Add auth** (e.g. Clerk):
   ```bash
   npm install @clerk/clerk-react
   ```

---

## Roadmap / How to Expand

| Feature | How |
|---|---|
| Charts / trends | Add `recharts` or `chart.js` |
| Backend | Node.js + Express + PostgreSQL (or Supabase) |
| Auth | Clerk or Auth0 |
| Real-time scrims | Supabase realtime subscriptions |
| CSV export | `papaparse` unparse + `downloadjs` |
| Multi-team | Add `teamId` to match schema |
| VOD links | Add `vodUrl` field to match |
| Custom thresholds | Coach settings page, store in localStorage |

---

## Performance Classification Thresholds

Defined in `src/utils/statsHelpers.js → classifyPlayer()`:

| Tag | Criteria |
|---|---|
| TOP PERFORMER | ACS ≥ 230 AND K/D ≥ 1.1 |
| NEEDS IMPROVEMENT | ACS < 190 OR K/D < 0.9 |
| STABLE | Everything else |

Adjust these values to match your team's standards.

// ============================================================
// src/api/matchesApi.js
// HTTP client for the PHP backend.
//
// BASE_URL points to your backend folder.
// XAMPP/WAMP dev:  http://localhost/val-track/backend
// Production:      https://yourdomain.com/backend
//
// Set REACT_APP_API_URL in your .env to override.
// ============================================================

const BASE =
  process.env.REACT_APP_API_URL ||
  "/backend";
export const TEAM_ID =
  process.env.REACT_APP_TEAM_ID || "aaaaaaaa-0000-0000-0000-000000000001";

async function request(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(hasBody || method !== "GET"
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_) {
    const snippet = raw ? raw.slice(0, 180) : "<empty body>";
    throw new Error(
      `API returned non-JSON (HTTP ${res.status}) at ${url}: ${snippet}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      json?.error || `API request failed (HTTP ${res.status}) at ${url}`,
    );
  }
  if (!json.success) throw new Error(json.error || "API error");
  return json.data;
}

export const matchesApi = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams({ team_id: TEAM_ID });
    if (filters.map && filters.map !== "All") params.set("map", filters.map);
    if (filters.type && filters.type !== "All")
      params.set("type", filters.type);
    if (filters.opponent && filters.opponent !== "")
      params.set("opponent", filters.opponent);
    return request(`${BASE}/api/matches.php?${params}`);
  },
  getById: async (id) => request(`${BASE}/api/matches.php?id=${id}`),
  create: async (match) =>
    request(`${BASE}/api/matches.php`, {
      method: "POST",
      body: JSON.stringify({ ...match, team_id: TEAM_ID }),
    }),
  update: async (match) =>
    request(`${BASE}/api/matches.php?id=${match.id}`, {
      method: "PUT",
      body: JSON.stringify(match),
    }),
  remove: async (id) =>
    request(`${BASE}/api/matches.php?id=${id}`, { method: "DELETE" }),
};

export const playersApi = {
  getAll: async () => request(`${BASE}/api/players.php?team_id=${TEAM_ID}`),
  getById: async (id) => request(`${BASE}/api/players.php?id=${id}`),
  create: async (player) =>
    request(`${BASE}/api/players.php`, {
      method: "POST",
      body: JSON.stringify({ ...player, team_id: TEAM_ID }),
    }),
  update: async (player) =>
    request(`${BASE}/api/players.php?id=${player.id}`, {
      method: "PUT",
      body: JSON.stringify(player),
    }),
};

export const statsApi = {
  mapWinrates: async () =>
    request(`${BASE}/api/stats.php?type=map_winrates&team_id=${TEAM_ID}`),
  agentStats: async () =>
    request(`${BASE}/api/stats.php?type=agent_stats&team_id=${TEAM_ID}`),
  teamEconomics: async () =>
    request(`${BASE}/api/stats.php?type=team_economics&team_id=${TEAM_ID}`),
  playerAverages: async () =>
    request(`${BASE}/api/stats.php?type=player_averages&team_id=${TEAM_ID}`),
};

export const aiApi = {
  /**
   * Upload a file to the backend for Gemini AI extraction.
   * @param {File} file
   * @param {'Scrim'|'Tournament'} matchType
   * @returns {Promise<{extracted: object, raw: string}>}
   */
  extract: async (file, matchType, playerAgentMap = null) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", matchType);
    // Pass Timeline's playerAgentMap to the backend when uploading a Scoreboard.
    // The backend will use these names + agents as authoritative instead of
    // trying to identify teal rows from the scoreboard itself.
    if (playerAgentMap && playerAgentMap.length > 0) {
      formData.append("playerAgentMap", JSON.stringify(playerAgentMap));
    }

    const tryExtract = async (endpoint) => {
      let res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        return {
          ok: false,
          status: 0,
          message: `AI request failed: ${err?.message || "Network/CORS error"}`,
          data: null,
        };
      }

      const raw = await res.text();
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (_) {
        // Keep fallback below for non-JSON upstream errors.
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          message: json?.error || `AI extraction failed (${res.status})`,
          data: null,
        };
      }
      if (!json?.success) {
        return {
          ok: false,
          status: res.status,
          message: json?.error || "AI extraction failed",
          data: null,
        };
      }

      return {
        ok: true,
        status: res.status,
        message: "",
        data: json.data,
      };
    };

    const isApiExpirationFailure = (status, message) => {
      const text = String(message || "").toLowerCase();
      const isAuthOrQuotaStatus = status === 401 || status === 429;
      const hasExpirationLikeText =
        text.includes("expired") ||
        text.includes("expiration") ||
        text.includes("invalid") ||
        text.includes("missing") ||
        text.includes("quota") ||
        text.includes("rate limit") ||
        text.includes("token") ||
        text.includes("api key");
      const isHfRelated =
        text.includes("hugging face") || text.includes("hf_api_key") || text.includes("hf");

      return (isAuthOrQuotaStatus || hasExpirationLikeText) && isHfRelated;
    };

    const primary = await tryExtract(`${BASE}/api/ai_extract.php`);
    if (primary.ok) return primary.data;

    if (isApiExpirationFailure(primary.status, primary.message)) {
      const fallback = await tryExtract(`${BASE}/api/ai_extract-OPENAI.php`);
      if (fallback.ok) return fallback.data;
      throw new Error(fallback.message || primary.message);
    }

    throw new Error(primary.message);
  },
};

export const referenceApi = {
  maps: async () => request(`${BASE}/api/reference.php?type=maps`),
  agents: async () => request(`${BASE}/api/reference.php?type=agents`),
  players: async () => request(`${BASE}/api/reference.php?type=players&team_id=${TEAM_ID}`),
  teams: async () => request(`${BASE}/api/reference.php?type=teams`),
  team: async () => request(`${BASE}/api/reference.php?type=team&team_id=${TEAM_ID}`),
  updateTeamName: async (name) =>
    request(`${BASE}/api/reference.php?type=team&team_id=${TEAM_ID}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  opponents: async () =>
    request(`${BASE}/api/reference.php?type=opponents&team_id=${TEAM_ID}`),
  addMap: async (name) =>
    request(`${BASE}/api/reference.php?type=maps`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteMap: async (id) =>
    request(`${BASE}/api/reference.php?type=maps&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  addAgent: async (name, role = "Unassigned") =>
    request(`${BASE}/api/reference.php?type=agents`, {
      method: "POST",
      body: JSON.stringify({ name, role }),
    }),
  deleteAgent: async (id) =>
    request(`${BASE}/api/reference.php?type=agents&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

export const notesApi = {
  getAll: async () =>
    request(`${BASE}/api/coaching_notes.php?team_id=${TEAM_ID}`),
  upsert: async ({ matchId, playerId, body, title = null, tags = null }) =>
    request(`${BASE}/api/coaching_notes.php`, {
      method: "POST",
      body: JSON.stringify({
        team_id: TEAM_ID,
        match_id: matchId,
        player_id: playerId,
        title,
        body,
        tags,
      }),
    }),
  removeByContext: async ({ matchId, playerId }) =>
    request(
      `${BASE}/api/coaching_notes.php?team_id=${encodeURIComponent(TEAM_ID)}&match_id=${encodeURIComponent(matchId)}&player_id=${encodeURIComponent(playerId)}`,
      { method: "DELETE" },
    ),
};

export const compositionApi = {
  list: async () =>
    request(`${BASE}/api/compositions.php?team_id=${TEAM_ID}`),
  createComposition: async ({ name, notes = "", agents = [] }) =>
    request(`${BASE}/api/compositions.php`, {
      method: "POST",
      body: JSON.stringify({
        entity: "composition",
        team_id: TEAM_ID,
        name,
        notes,
        agents,
      }),
    }),
  updateComposition: async (id, payload) =>
    request(`${BASE}/api/compositions.php?composition_id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteComposition: async (id) =>
    request(`${BASE}/api/compositions.php?composition_id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  addGame: async (payload) =>
    request(`${BASE}/api/compositions.php`, {
      method: "POST",
      body: JSON.stringify({ entity: "game", ...payload }),
    }),
  updateGame: async (id, payload) =>
    request(`${BASE}/api/compositions.php?result_id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteGame: async (id) =>
    request(`${BASE}/api/compositions.php?result_id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

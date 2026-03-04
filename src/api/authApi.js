const BASE = (() => {
  const raw = process.env.REACT_APP_API_URL;
  if (typeof raw !== "string") {
    if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
      return "/val-track/backend";
    }
    return "/backend";
  }
  const clean = raw.trim().replace(/\/+$/, "");
  if (clean) return clean;
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    return "/val-track/backend";
  }
  return "/backend";
})();

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(hasBody || method !== "GET" ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error(`Auth API returned non-JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(json?.error || `Auth API failed (HTTP ${res.status})`);
  }
  if (!json?.success) {
    throw new Error(json?.error || "Auth API error");
  }
  return json.data;
}

export const authApi = {
  me: () => request("/api/auth.php?action=me"),
  login: (payload) =>
    request("/api/auth.php?action=login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request("/api/auth.php?action=logout", {
      method: "POST",
    }),
  forgotPassword: (email) =>
    request("/api/auth.php?action=forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: ({ token, password }) =>
    request("/api/auth.php?action=reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  changePassword: ({ current_password, new_password }) =>
    request("/api/auth.php?action=change_password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  updateProfile: ({ username, email }) =>
    request("/api/auth.php?action=update_profile", {
      method: "POST",
      body: JSON.stringify({ username, email }),
    }),
  setupTeam: ({ team_name, team_tag, region }) =>
    request("/api/auth.php?action=setup_team", {
      method: "POST",
      body: JSON.stringify({ team_name, team_tag, region }),
    }),
  superadminOverview: () => request("/api/superadmin.php?action=overview"),
  superadminUpdateUser: (id, payload) =>
    request(`/api/superadmin.php?action=user&id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  superadminCreateUser: (payload) =>
    request("/api/superadmin.php?action=create_user", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

import { useEffect, useMemo, useState } from "react";
import { authApi } from "../api/authApi";

export function SuperAdminModule() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [tab, setTab] = useState("superadmin");
  const [createForm, setCreateForm] = useState({
    display_name: "",
    username: "",
    email: "",
    role: "coach",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authApi.superadminOverview();
      const rows = res?.users || [];
      setUsers(rows);
      setDrafts(
        rows.reduce((acc, u) => {
          acc[u.id] = {
            email: u.email || "",
            username: u.username || "",
            display_name: u.display_name || "",
            role: u.role || "coach",
            team_id: u.team_id || "",
          };
          return acc;
        }, {}),
      );
      setTeams(res?.teams || []);
    } catch (err) {
      setError(err.message || "Failed to load superadmin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateUser = async (id, payload) => {
    setSavingId(id);
    setError("");
    setMessage("");
    try {
      const updated = await authApi.superadminUpdateUser(id, payload);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          email: updated.email || "",
          username: updated.username || "",
          display_name: updated.display_name || "",
            role: updated.role || "coach",
            team_id: updated.team_id || "",
        },
      }));
    } catch (err) {
      setError(err.message || "Failed to update user.");
    } finally {
      setSavingId("");
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await authApi.superadminCreateUser(createForm);
      if (res?.user) {
        setUsers((prev) => [res.user, ...prev]);
        setDrafts((prev) => ({
          ...prev,
          [res.user.id]: {
            email: res.user.email || "",
            username: res.user.username || "",
            display_name: res.user.display_name || "",
            role: res.user.role || "coach",
            team_id: res.user.team_id || "",
          },
        }));
      }
      const generated = res?.generated_password || "(not returned)";
      setMessage(`User created. Temporary password: ${generated}`);
      setCreateForm({
        display_name: "",
        username: "",
        email: "",
        role: "coach",
      });
    } catch (err) {
      setError(err.message || "Failed to create user.");
    }
  };

  const coachUsers = useMemo(
    () => users.filter((u) => (u.role || "").toLowerCase() === "coach"),
    [users],
  );
  const superadminUsers = useMemo(
    () => users.filter((u) => Boolean(u.is_superadmin)),
    [users],
  );

  const setDraftField = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        username: "",
        email: "",
        display_name: "",
        role: "coach",
        team_id: "",
        ...(prev[id] || {}),
        [key]: value,
      },
    }));
  };

  const saveSuperadminRow = (u) => {
    if (u.is_superadmin) {
      setError("Superadmin accounts are read-only.");
      return;
    }
    const draft = drafts[u.id] || {};
    const payload = {};

    const email = (draft.email ?? "").trim();
    const username = (draft.username ?? "").trim();
    const displayName = (draft.display_name ?? "").trim();
    const role = draft.role ?? "coach";
    const teamId = draft.team_id ?? "";

    if (email && email !== (u.email || "")) payload.email = email;
    if (username && username !== (u.username || "")) payload.username = username;
    if (displayName && displayName !== (u.display_name || "")) payload.display_name = displayName;
    if (role !== (u.role || "coach")) payload.role = role;
    if (teamId !== (u.team_id || "")) payload.team_id = teamId;

    if (Object.keys(payload).length === 0) {
      setMessage("No changes to save.");
      return;
    }
    updateUser(u.id, payload);
  };

  const saveCoachRow = (u) => {
    const draft = drafts[u.id] || {};
    const payload = {};
    const email = (draft.email ?? "").trim();
    const username = (draft.username ?? "").trim();
    const displayName = (draft.display_name ?? "").trim();
    if (email && email !== (u.email || "")) payload.email = email;
    if (username && username !== (u.username || "")) payload.username = username;
    if (displayName && displayName !== (u.display_name || "")) payload.display_name = displayName;
    if (Object.keys(payload).length === 0) {
      setMessage("No changes to save.");
      return;
    }
    updateUser(u.id, payload);
  };

  if (loading) return <div className="empty-state">Loading superadmin data...</div>;

  return (
    <div className="adminref-layout">
      {error ? <div className="adminref-notice err">{error}</div> : null}
      {message ? <div className="adminref-notice ok">{message}</div> : null}

      <div className="auth-tabs" style={{ maxWidth: 420 }}>
        <button
          className={`auth-tab${tab === "superadmin" ? " active" : ""}`}
          onClick={() => setTab("superadmin")}
          type="button"
        >
          Superadmin
        </button>
        <button
          className={`auth-tab${tab === "users" ? " active" : ""}`}
          onClick={() => setTab("users")}
          type="button"
        >
          Users (Coaches)
        </button>
      </div>

      {tab === "superadmin" && (
        <div className="table-wrap superadmin-table-wrap">
          <table className="stats-table superadmin-stack-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Superadmin</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {superadminUsers.map((u) => (
                <tr key={u.id}>
                  <td data-label="Email">
                    <input
                      className="adminref-input"
                      value={drafts[u.id]?.email ?? ""}
                      onChange={(e) => setDraftField(u.id, "email", e.target.value)}
                      disabled={u.is_superadmin || savingId === u.id}
                    />
                  </td>
                  <td data-label="Username">
                    <input
                      className="adminref-input"
                      value={drafts[u.id]?.username ?? ""}
                      onChange={(e) => setDraftField(u.id, "username", e.target.value)}
                      disabled={u.is_superadmin || savingId === u.id}
                    />
                  </td>
                  <td data-label="Display Name">
                    <input
                      className="adminref-input"
                      value={drafts[u.id]?.display_name ?? ""}
                      onChange={(e) => setDraftField(u.id, "display_name", e.target.value)}
                      disabled={u.is_superadmin || savingId === u.id}
                    />
                  </td>
                  <td data-label="Role">
                    <select
                      className="adminref-select"
                      value={drafts[u.id]?.role ?? "coach"}
                      onChange={(e) => setDraftField(u.id, "role", e.target.value)}
                      disabled={u.is_superadmin || savingId === u.id}
                    >
                      <option value="coach">coach</option>
                      <option value="player">player</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td data-label="Team">
                    <select
                      className="adminref-select"
                      value={drafts[u.id]?.team_id ?? ""}
                      onChange={(e) => setDraftField(u.id, "team_id", e.target.value)}
                      disabled={u.is_superadmin || savingId === u.id}
                    >
                      <option value="">(none)</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Superadmin">{u.is_superadmin ? "Yes" : "No"}</td>
                  <td data-label="Action" className="superadmin-action-cell">
                    <button
                      className="superadmin-save-btn"
                      type="button"
                      onClick={() => saveSuperadminRow(u)}
                      disabled={u.is_superadmin || savingId === u.id}
                    >
                      {u.is_superadmin ? "Locked" : savingId === u.id ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "users" && (
        <>
          <form onSubmit={createUser} className="auth-form" style={{ maxWidth: 640 }}>
            <label>Create Coach Account</label>
            <input
              placeholder="Display Name"
              value={createForm.display_name}
              onChange={(e) => setCreateForm((p) => ({ ...p, display_name: e.target.value }))}
              required
            />
            <input
              placeholder="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <button className="auth-btn primary" type="submit">Create User (Default Password)</button>
          </form>

          <div className="table-wrap superadmin-table-wrap" style={{ marginTop: 12 }}>
            <table className="stats-table superadmin-stack-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Team</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {coachUsers.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Email">
                      <input
                        className="adminref-input"
                        value={drafts[u.id]?.email ?? ""}
                        onChange={(e) => setDraftField(u.id, "email", e.target.value)}
                      />
                    </td>
                    <td data-label="Username">
                      <input
                        className="adminref-input"
                        value={drafts[u.id]?.username ?? ""}
                        onChange={(e) => setDraftField(u.id, "username", e.target.value)}
                      />
                    </td>
                    <td data-label="Display Name">
                      <input
                        className="adminref-input"
                        value={drafts[u.id]?.display_name ?? ""}
                        onChange={(e) => setDraftField(u.id, "display_name", e.target.value)}
                      />
                    </td>
                    <td data-label="Team">{teams.find((t) => t.id === u.team_id)?.name || "(none)"}</td>
                    <td data-label="Action" className="superadmin-action-cell">
                      <button
                        className="superadmin-save-btn"
                        type="button"
                        onClick={() => saveCoachRow(u)}
                        disabled={savingId === u.id}
                      >
                        {savingId === u.id ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
                {coachUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "#8a93a6" }}>No coach accounts yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

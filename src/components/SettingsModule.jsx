import { useEffect, useState } from "react";
import { authApi } from "../api/authApi";
import { referenceApi } from "../api/matchesApi";

export function SettingsModule() {
  const [user, setUser] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamSaving, setTeamSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        if (res?.authenticated && res?.user) {
          setUser(res.user);
          setUsername(res.user.username || "");
          setEmail(res.user.email || "");
          if (!res.user.is_superadmin && res.user.team_id) {
            referenceApi
              .team()
              .then((team) => setTeamName(team?.name || ""))
              .catch(() => {});
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load profile.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitProfile = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setProfileSaving(true);
    try {
      const res = await authApi.updateProfile({ username, email });
      setMessage(res?.message || "Profile updated.");
      if (res?.user) {
        setUsername(res.user.username || "");
        setEmail(res.user.email || "");
      }
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMessage(res?.message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const submitTeam = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    const name = teamName.trim();
    if (!name) {
      setError("Team name is required.");
      return;
    }
    setTeamSaving(true);
    try {
      await referenceApi.updateTeamName(name);
      setMessage(`Team renamed to "${name}".`);
      setTeamName(name);
    } catch (err) {
      setError(err.message || "Failed to update team name.");
    } finally {
      setTeamSaving(false);
    }
  };

  return (
    <div className="adminref-layout">
      {error ? <div className="adminref-notice err">{error}</div> : null}
      {message ? <div className="adminref-notice ok">{message}</div> : null}

      <form className="auth-form" onSubmit={submitProfile} style={{ maxWidth: 480, marginBottom: 16 }}>
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button className="auth-btn primary" type="submit" disabled={profileSaving}>
          {profileSaving ? "Saving..." : "Save Profile"}
        </button>
      </form>

      {!user?.is_superadmin && user?.team_id ? (
        <form className="auth-form" onSubmit={submitTeam} style={{ maxWidth: 480, marginBottom: 16 }}>
          <label>Team Profile</label>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            required
          />
          <button className="auth-btn primary" type="submit" disabled={teamSaving}>
            {teamSaving ? "Saving..." : "Save Team Name"}
          </button>
        </form>
      ) : null}

      <form className="auth-form" onSubmit={submitPassword} style={{ maxWidth: 480 }}>
        <label>Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />

        <label>New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <label>Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <p className="auth-sub" style={{ marginTop: 4 }}>
          Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.
        </p>

        <button className="auth-btn primary" type="submit" disabled={passwordSaving}>
          {passwordSaving ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}

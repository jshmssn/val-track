import { useEffect, useMemo, useState } from "react";

export function AuthScreen({
  initialMode = "login",
  resetToken = "",
  onBack,
  loading = false,
  error = "",
  message = "",
  onLogin,
  onForgot,
  onReset,
}) {
  const startMode = resetToken ? "reset" : initialMode;
  const [mode, setMode] = useState(startMode);
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetForm, setResetForm] = useState({ password: "", confirmPassword: "" });

  useEffect(() => {
    setMode(resetToken ? "reset" : initialMode);
  }, [initialMode, resetToken]);

  const title = useMemo(() => {
    if (mode === "forgot") return "Forgot Password";
    if (mode === "reset") return "Reset Password";
    return "Sign In";
  }, [mode]);

  const submitLogin = (e) => {
    e.preventDefault();
    onLogin?.(loginForm);
  };
  const submitForgot = (e) => {
    e.preventDefault();
    onForgot?.(forgotEmail);
  };
  const submitReset = (e) => {
    e.preventDefault();
    if (!resetToken) return;
    if (resetForm.password !== resetForm.confirmPassword) return;
    onReset?.({ token: resetToken, password: resetForm.password });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-brand">
            <span className="auth-tri" />
            VAL TRACK
          </div>
          <div className="auth-sub">Coaching Workspace</div>
          {onBack ? (
            <button className="auth-back" type="button" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${mode === "login" ? " active" : ""}`} onClick={() => setMode("login")} type="button">Login</button>
          <button className={`auth-tab${mode === "forgot" ? " active" : ""}`} onClick={() => setMode("forgot")} type="button">Forgot</button>
          {resetToken && (
            <button className={`auth-tab${mode === "reset" ? " active" : ""}`} onClick={() => setMode("reset")} type="button">Reset</button>
          )}
        </div>

        <div className="auth-body">
          <h1 className="auth-title">{title}</h1>
          {error ? <div className="auth-alert err">{error}</div> : null}
          {message ? <div className="auth-alert ok">{message}</div> : null}

          {mode === "login" && (
            <form onSubmit={submitLogin} className="auth-form">
              <label>Email or Username</label>
              <input
                value={loginForm.identifier}
                onChange={(e) => setLoginForm((p) => ({ ...p, identifier: e.target.value }))}
                required
              />
              <label>Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
              <button className="auth-btn primary" disabled={loading} type="submit">Sign In</button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={submitForgot} className="auth-form">
              <label>Account Email</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <button className="auth-btn primary" disabled={loading} type="submit">Send Reset Link</button>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={submitReset} className="auth-form">
              {!resetToken ? (
                <div className="auth-alert err">Missing reset token.</div>
              ) : null}
              <label>New Password</label>
              <input
                type="password"
                minLength={8}
                value={resetForm.password}
                onChange={(e) => setResetForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
              <label>Confirm Password</label>
              <input
                type="password"
                minLength={8}
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                required
              />
              {resetForm.confirmPassword && resetForm.password !== resetForm.confirmPassword ? (
                <div className="auth-alert err">Passwords do not match.</div>
              ) : null}
              <button className="auth-btn primary" disabled={loading || !resetToken} type="submit">Reset Password</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
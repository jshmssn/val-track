export function LandingPage({ onLogin }) {
  return (
    <div className="landing-shell">
      <div className="landing-noise" />
      <header className="landing-top">
        <div className="landing-brand">
          <span className="landing-tri" />
          <span>VAL TRACK</span>
        </div>
        <div className="landing-actions">
          <button className="landing-btn primary" onClick={onLogin} type="button">Open Login</button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-kicker">Team Intelligence Platform</p>
          <h1>Turn Every Match Into Winning Decisions.</h1>
          <p className="landing-copy">
            Centralize scrims, player trends, compositions, and coaching notes in one secure workspace.
          </p>
          {/* <div className="landing-cta">
            <button className="landing-btn primary big" onClick={onLogin} type="button">Open Login</button>
          </div> */}
        </section>

        <section className="landing-grid">
          <article className="landing-card">
            <h3>Performance Radar</h3>
            <p>Track win rates, player form, and map/agent efficiencies in real time.</p>
          </article>
          <article className="landing-card">
            <h3>Coach Workflow</h3>
            <p>Capture notes per player and match, then convert review into actionable prep.</p>
          </article>
          <article className="landing-card">
            <h3>Secure By Team</h3>
            <p>Isolated team data access with role-aware controls and superadmin governance.</p>
          </article>
        </section>
      </main>
    </div>
  );
}

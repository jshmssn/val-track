import { useState } from "react";
import {
  PLAYERS as FALLBACK_PLAYERS,
  AGENTS as FALLBACK_AGENTS,
  MAPS as FALLBACK_MAPS,
} from "../data/sampleData";
import { styles } from "../styles/tokens";

function buildBlank(playerNames) {
  const names = playerNames?.length > 0 ? playerNames : FALLBACK_PLAYERS;
  return {
    date: "",
    opponent: "",
    type: "Scrim",
    result: "Win",
    score: "",
    map: "Ascent",
    tournament: "",
    playerStats: names.map((p) => ({
      player: p,
      agent: "Jett",
      acs: "",
      kills: "",
      deaths: "",
      assists: "",
      adr: "",
      kast: "",
      fkRate: "",
      clutchRate: "",
      first_bloods: "",
    })),
    teamMetrics: {
      atkRounds: "",
      atkWins: "",
      atkLosses: "",
      defRounds: "",
      defWins: "",
      defLosses: "",
      atkPistolWin: "",
      defPistolWin: "",
      otRounds: "",
      otWins: "",
      otLosses: "",
    },
  };
}

const STEPS = ["Match Info", "Player Stats", "Team Metrics"];

function normalizeAcs(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : -1;
}

function sortPlayerStatsByAcs(rows) {
  return [...rows].sort((a, b) => normalizeAcs(b.acs) - normalizeAcs(a.acs));
}

function computeLosses(rounds, wins, fallback = "") {
  const r = Number(rounds);
  const w = Number(wins);
  if (!Number.isFinite(r) || !Number.isFinite(w)) return fallback;
  return Math.max(0, r - w);
}

export function MatchForm({
  dispatch,
  onClose,
  prefill,
  refData,
  onSaved,
  onAlert,
}) {
  const agentNames =
    refData?.agentNames?.length > 0 ? refData.agentNames : FALLBACK_AGENTS;
  const mapNames =
    refData?.mapNames?.length > 0 ? refData.mapNames : FALLBACK_MAPS;
  const playerNames =
    refData?.playerNames?.length > 0 ? refData.playerNames : FALLBACK_PLAYERS;

  const buildInitial = () => {
    if (!prefill) return buildBlank(playerNames);
    const extractedStats = prefill.playerStats || [];
    const agentMap = prefill.playerAgentMap || [];
    const blankRow = (player, agent) => ({
      player: player || "",
      agent: agent || "Jett",
      acs: "",
      kills: "",
      deaths: "",
      assists: "",
      adr: "",
      kast: "",
      fkRate: "",
      clutchRate: "",
      first_bloods: "",
    });
    const ps =
      extractedStats.length > 0
        ? sortPlayerStatsByAcs(
            extractedStats.map((s) => ({
              player: s.player || "",
              agent: s.agent || "Jett",
              acs: s.acs ?? "",
              kills: s.kills ?? "",
              deaths: s.deaths ?? "",
              assists: s.assists ?? "",
              adr: s.adr ?? "",
              kast: s.kast ?? "",
              fkRate: s.fkRate != null ? +(s.fkRate * 100).toFixed(0) : "",
              clutchRate:
                s.clutchRate != null ? +(s.clutchRate * 100).toFixed(0) : "",
              first_bloods:
                s.first_bloods ?? s.firstBloods ?? s.first_kills ?? "",
            })),
          )
        : agentMap.length > 0
          ? agentMap.map((e) => blankRow(e.player, e.agent))
          : playerNames.map((p) => blankRow(p, "Jett"));
    const tm = prefill.teamMetrics || {};
    return {
      date: prefill.date && prefill.date !== "null" ? prefill.date : "",
      opponent: prefill.opponent || "",
      type: prefill.type || "Scrim",
      result: prefill.result || "Win",
      score: prefill.score || "",
      map: prefill.map && prefill.map !== "null" ? prefill.map : "",
      tournament: prefill.tournament || "",
      playerStats: ps,
      teamMetrics: {
        atkRounds: tm.atkRounds ?? "",
        atkWins: tm.atkWins ?? "",
        atkLosses: tm.atkLosses ?? computeLosses(tm.atkRounds, tm.atkWins, ""),
        defRounds: tm.defRounds ?? "",
        defWins: tm.defWins ?? "",
        defLosses: tm.defLosses ?? computeLosses(tm.defRounds, tm.defWins, ""),
        atkPistolWin: tm.atkPistolWin ?? "",
        defPistolWin: tm.defPistolWin ?? "",
        otRounds: tm.otRounds ?? "",
        otWins: tm.otWins ?? "",
        otLosses: tm.otLosses ?? "",
      },
    };
  };

  const [form, setForm] = useState(buildInitial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const firstHalfSide = String(prefill?.teamMetrics?.firstHalf?.side || "")
    .trim()
    .toUpperCase();
  const secondHalfSide = String(prefill?.teamMetrics?.secondHalf?.side || "")
    .trim()
    .toUpperCase();
  const orderedSides = firstHalfSide === "DEF" ? ["DEF", "ATK"] : ["ATK", "DEF"];
  const hasOvertime =
    Number(form.teamMetrics.otRounds || 0) > 0 ||
    Number(form.teamMetrics.otWins || 0) > 0 ||
    Number(form.teamMetrics.otLosses || 0) > 0;
  const showOvertime = !prefill || hasOvertime;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPS = (i, k, v) =>
    setForm((f) => {
      const ps = [...f.playerStats];
      ps[i] = { ...ps[i], [k]: v };
      return { ...f, playerStats: ps };
    });
  const setMetric = (k, v) =>
    setForm((f) => ({ ...f, teamMetrics: { ...f.teamMetrics, [k]: v } }));

  const handleSubmit = async () => {
    if (!form.date || !form.opponent) {
      if (onAlert) onAlert("Date and opponent are required.", "Missing Fields");
      else alert("Date and opponent are required.");
      return;
    }
    setSaving(true);
    const teamMetricsWithLosses = {
      ...form.teamMetrics,
      atkLosses: computeLosses(
        form.teamMetrics.atkRounds,
        form.teamMetrics.atkWins,
        form.teamMetrics.atkLosses,
      ),
      defLosses: computeLosses(
        form.teamMetrics.defRounds,
        form.teamMetrics.defWins,
        form.teamMetrics.defLosses,
      ),
    };
    const result = await dispatch({
      type: "ADD_MATCH",
      payload: {
        ...form,
        playerStats: form.playerStats.map((ps) => ({
          ...ps,
          acs: +ps.acs,
          kills: +ps.kills,
          deaths: +ps.deaths,
          assists: +ps.assists,
          first_bloods: +ps.first_bloods,
          adr: +ps.adr,
          kast: +ps.kast,
          fkRate: +(+ps.fkRate / 100).toFixed(2),
          clutchRate: +(+ps.clutchRate / 100).toFixed(2),
        })),
        teamMetrics: {
          ...Object.fromEntries(
            Object.entries(teamMetricsWithLosses)
              .filter(([k]) => !["atkPistolWin", "defPistolWin"].includes(k))
              .map(([k, v]) => [k, +v]),
          ),
          atkPistolWin: teamMetricsWithLosses.atkPistolWin,
          defPistolWin: teamMetricsWithLosses.defPistolWin,
        },
      },
    });
    setSaving(false);
    if (result?.ok === false) {
      if (onAlert)
        onAlert(result.error || "Failed to save match.", "Save Failed");
      else alert(result.error || "Failed to save match.");
      return;
    }
    if (onSaved) onSaved(result?.data);
    else onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">
            {prefill ? "OCR Import — Review Match" : "New Match"}
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-tabs">
          {STEPS.map((t, i) => (
            <button
              key={t}
              className={`form-tab${step === i ? " active" : ""}`}
              onClick={() => setStep(i)}
            >
              {i + 1}. {t}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="form-grid">
            <FF
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setField("date", v)}
            />
            <FF
              label="Opponent"
              value={form.opponent}
              onChange={(v) => setField("opponent", v)}
              placeholder="Team name"
            />
            <FS
              label="Map"
              value={form.map}
              options={mapNames}
              onChange={(v) => setField("map", v)}
            />
            <FS
              label="Type"
              value={form.type}
              options={["Scrim", "Tournament"]}
              onChange={(v) => setField("type", v)}
            />
            <FS
              label="Result"
              value={form.result}
              options={["Win", "Loss"]}
              onChange={(v) => setField("result", v)}
            />
            <FF
              label="Score"
              value={form.score}
              onChange={(v) => setField("score", v)}
              placeholder="13-9"
            />
            <FF
              label="Tournament"
              value={form.tournament || ""}
              onChange={(v) => setField("tournament", v)}
              placeholder="Optional"
            />
          </div>
        )}

        {step === 1 && (
          <div style={styles.formPlayersTable}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Player", "Agent", "ACS", "K", "D", "A", "FB"].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.playerStats.map((ps, i) => (
                  <tr
                    key={i}
                    style={i % 2 === 0 ? styles.trEven : styles.trOdd}
                  >
                    <td style={styles.td}>
                      <input
                        className="inline-input"
                        style={{ width: 90 }}
                        type="text"
                        value={ps.player}
                        onChange={(e) => setPS(i, "player", e.target.value)}
                        placeholder="IGN"
                      />
                    </td>
                    <td style={styles.td}>
                      <select
                        className="inline-select"
                        value={ps.agent}
                        onChange={(e) => setPS(i, "agent", e.target.value)}
                      >
                        {agentNames.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </td>
                    {["acs", "kills", "deaths", "assists", "first_bloods"].map((k) => (
                      <td key={k} style={styles.td}>
                        <input
                          className="inline-input"
                          type="number"
                          value={ps[k]}
                          onChange={(e) => setPS(i, k, e.target.value)}
                          placeholder="0"
                          min="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {step === 2 && (
          <div style={{ padding: 24, overflowY: "auto" }}>
            {orderedSides.map((side, idx) => {
              const isAtk = side === "ATK";
              const title = isAtk ? "Attack" : "Defense";
              const roundsKey = isAtk ? "atkRounds" : "defRounds";
              const winsKey = isAtk ? "atkWins" : "defWins";
              const lossesKey = isAtk ? "atkLosses" : "defLosses";
              const pistolKey = isAtk ? "atkPistolWin" : "defPistolWin";
              const short = isAtk ? "ATK" : "DEF";
              const computedLosses = computeLosses(
                form.teamMetrics[roundsKey],
                form.teamMetrics[winsKey],
                form.teamMetrics[lossesKey],
              );
              const halfSuffix =
                firstHalfSide === side
                  ? " (1st Half)"
                  : secondHalfSide === side
                    ? " (2nd Half)"
                    : "";
              return (
                <div
                  key={side}
                  style={{
                    marginTop: idx === 0 ? 0 : 14,
                    paddingTop: idx === 0 ? 0 : 14,
                    borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div
                    className="form-label"
                    style={{ marginBottom: 10, color: "var(--text2)" }}
                  >
                    {title}
                    {halfSuffix}
                  </div>
                  <div className="form-grid" style={{ padding: 0 }}>
                    {[
                      [roundsKey, `${short} Rounds`],
                      [winsKey, `${short} Wins`],
                      [lossesKey, `${short} Loss`],
                    ].map(([k, l]) => (
                      <FF
                        key={k}
                        label={l}
                        type="number"
                        value={k === lossesKey ? computedLosses : form.teamMetrics[k]}
                        onChange={(v) => setMetric(k, v)}
                        placeholder="0"
                        readOnly={k === lossesKey}
                      />
                    ))}
                    <FS
                      label={`${short} Pistol`}
                      value={form.teamMetrics[pistolKey]}
                      options={["Win", "Loss"]}
                      onChange={(v) => setMetric(pistolKey, v)}
                    />
                  </div>
                </div>
              );
            })}
            {showOvertime && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div
                  className="form-label"
                  style={{ marginBottom: 10, color: "var(--text2)" }}
                >
                  Overtime
                </div>
                <div className="form-grid" style={{ padding: 0 }}>
                  {[
                    ["otRounds", "OT Rounds"],
                    ["otWins", "OT Wins"],
                    ["otLosses", "OT Loss"],
                  ].map(([k, l]) => (
                    <FF
                      key={k}
                      label={l}
                      type="number"
                      value={form.teamMetrics[k]}
                      onChange={(v) => setMetric(k, v)}
                      placeholder="0"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="form-actions">
          {step > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          )}
          {step < 2 && (
            <button
              className="btn-primary"
              onClick={() => setStep((s) => s + 1)}
            >
              Next →
            </button>
          )}
          {step === 2 && (
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Match"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FF({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly = false,
}) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FS({ label, value, options, onChange }) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <select
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ color: value === "" ? "var(--text3)" : "inherit" }}
      >
        {value === "" && (
          <option value="" disabled>
            Select {label}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}



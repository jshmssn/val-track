// ============================================================
// src/components/MatchForm.jsx
// 3-step modal form for recording a new match.
//
// TO EXPAND:
//   - Add edit mode (pre-fill form with existing match data)
//   - Add form validation library (react-hook-form + zod)
//   - Replace alert() with a toast notification system
// ============================================================
import { useState } from "react";
// Fallback static lists used only if the DB reference API is unavailable
import {
  PLAYERS as FALLBACK_PLAYERS,
  AGENTS as FALLBACK_AGENTS,
  MAPS as FALLBACK_MAPS,
} from "../data/sampleData";
import { styles } from "../styles/tokens";

function buildBlankMatch(playerNames) {
  const names =
    playerNames && playerNames.length > 0 ? playerNames : FALLBACK_PLAYERS;
  return {
    date: "",
    opponent: "",
    type: "Scrim",
    result: "Win",
    score: "",
    map: "Ascent",
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
    })),
    teamMetrics: {
      atkRounds: "",
      atkWins: "",
      defRounds: "",
      defWins: "",
      atkPistolWin: "",
      defPistolWin: "",
    },
  };
}

const STEPS = ["Match Info", "Player Stats", "Team Metrics"];

export function MatchForm({ dispatch, onClose, prefill, refData }) {
  // Use DB reference data when available, fall back to static lists
  const agentNames =
    refData?.agentNames?.length > 0 ? refData.agentNames : FALLBACK_AGENTS;
  const mapNames =
    refData?.mapNames?.length > 0 ? refData.mapNames : FALLBACK_MAPS;
  const playerNames =
    refData?.playerNames?.length > 0 ? refData.playerNames : FALLBACK_PLAYERS;

  const buildInitial = () => {
    if (!prefill) return buildBlankMatch(playerNames);

    // Use extracted players directly from AI — do NOT remap through PLAYERS list
    const extractedStats = prefill.playerStats || [];

    // Timeline-only flow: playerStats is empty [] but playerAgentMap has the 5 players.
    // Seed blank stat rows from the agent map so all 5 players appear in the form.
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
    });

    const ps =
      extractedStats.length > 0
        ? extractedStats.map((s) => ({
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
          }))
        : agentMap.length > 0
          ? // Seed from playerAgentMap (timeline-only import — stats will be filled in manually)
            agentMap.map((entry) => blankRow(entry.player, entry.agent))
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
        defRounds: tm.defRounds ?? "",
        defWins: tm.defWins ?? "",
        atkPistolWin: tm.atkPistolWin ?? "",
        defPistolWin: tm.defPistolWin ?? "",
      },
    };
  };

  const [form, setForm] = useState(buildInitial);
  const [step, setStep] = useState(0);

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const setPlayerField = (i, key, val) =>
    setForm((f) => {
      const ps = [...f.playerStats];
      ps[i] = { ...ps[i], [key]: val };
      return { ...f, playerStats: ps };
    });

  const setMetric = (key, val) =>
    setForm((f) => ({ ...f, teamMetrics: { ...f.teamMetrics, [key]: val } }));

  const handleSubmit = () => {
    if (!form.date || !form.opponent) {
      alert("Date and opponent are required.");
      return;
    }
    const payload = {
      ...form,
      playerStats: form.playerStats.map((ps) => ({
        ...ps,
        acs: +ps.acs,
        kills: +ps.kills,
        deaths: +ps.deaths,
        assists: +ps.assists,
        adr: +ps.adr,
        kast: +ps.kast,
        fkRate: +(+ps.fkRate / 100).toFixed(2),
        clutchRate: +(+ps.clutchRate / 100).toFixed(2),
      })),
      teamMetrics: {
        ...Object.fromEntries(
          Object.entries(form.teamMetrics)
            .filter(([k]) => !["atkPistolWin", "defPistolWin"].includes(k))
            .map(([k, v]) => [k, +v]),
        ),
        atkPistolWin: form.teamMetrics.atkPistolWin,
        defPistolWin: form.teamMetrics.defPistolWin,
      },
    };
    dispatch({ type: "ADD_MATCH", payload });
    onClose();
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>
            {prefill ? "✦ AI IMPORT — REVIEW MATCH" : "NEW MATCH"}
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Step tabs */}
        <div style={styles.formTabs}>
          {STEPS.map((t, i) => (
            <button
              key={t}
              style={{
                ...styles.formTab,
                ...(step === i ? styles.formTabActive : {}),
              }}
              onClick={() => setStep(i)}
            >
              {i + 1}. {t}
            </button>
          ))}
        </div>

        {/* Step 0 — Match Info */}
        {step === 0 && (
          <div style={styles.formGrid}>
            <FormField
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setField("date", v)}
            />
            <FormField
              label="Opponent"
              value={form.opponent}
              onChange={(v) => setField("opponent", v)}
              placeholder="Team name"
            />
            <FormSelect
              label="Map"
              value={form.map}
              options={mapNames}
              onChange={(v) => setField("map", v)}
            />
            <FormSelect
              label="Type"
              value={form.type}
              options={["Scrim", "Tournament"]}
              onChange={(v) => setField("type", v)}
            />
            <FormSelect
              label="Result"
              value={form.result}
              options={["Win", "Loss"]}
              onChange={(v) => setField("result", v)}
            />
            <FormField
              label="Score (e.g. 13-9)"
              value={form.score}
              onChange={(v) => setField("score", v)}
              placeholder="13-9"
            />
            <FormField
              label="Tournament (optional)"
              value={form.tournament || ""}
              onChange={(v) => setField("tournament", v)}
              placeholder="VCT Americas Stage 1"
            />
          </div>
        )}

        {/* Step 1 — Player Stats */}
        {step === 1 && (
          <div style={styles.formPlayersTable}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  {["Player", "Agent", "ACS", "K", "D", "A"].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.playerStats.map((ps, i) => (
                  <tr
                    key={ps.player}
                    style={i % 2 === 0 ? styles.trEven : styles.trOdd}
                  >
                    <td style={styles.td}>
                      <input
                        style={{ ...styles.inlineInput, width: 90 }}
                        type="text"
                        value={ps.player}
                        onChange={(e) =>
                          setPlayerField(i, "player", e.target.value)
                        }
                        placeholder="Player IGN"
                      />
                    </td>
                    <td style={styles.td}>
                      <select
                        style={styles.inlineSelect}
                        value={ps.agent}
                        onChange={(e) =>
                          setPlayerField(i, "agent", e.target.value)
                        }
                      >
                        {agentNames.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </td>
                    {["acs", "kills", "deaths", "assists"].map((k) => (
                      <td key={k} style={styles.td}>
                        <input
                          style={styles.inlineInput}
                          type="number"
                          value={ps[k]}
                          onChange={(e) => setPlayerField(i, k, e.target.value)}
                          placeholder="0"
                          step="1"
                          min="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={styles.formNote}>
              ⚠ Enter FK% and Clutch% as whole numbers (e.g. 45 for 45%).
            </div>
          </div>
        )}

        {/* Step 2 — Team Metrics */}
        {step === 2 && (
          <div style={styles.formGrid}>
            {[
              ["atkRounds", "ATK Rounds Played"],
              ["atkWins", "ATK Rounds Won"],
              ["defRounds", "DEF Rounds Played"],
              ["defWins", "DEF Rounds Won"],
            ].map(([k, label]) => (
              <FormField
                key={k}
                label={label}
                type="number"
                value={form.teamMetrics[k]}
                onChange={(v) => setMetric(k, v)}
                placeholder="0"
              />
            ))}
            <FormSelect
              label="ATK Pistol"
              value={form.teamMetrics.atkPistolWin}
              options={["Win", "Loss"]}
              onChange={(v) => setMetric("atkPistolWin", v)}
            />
            <FormSelect
              label="DEF Pistol"
              value={form.teamMetrics.defPistolWin}
              options={["Win", "Loss"]}
              onChange={(v) => setMetric("defPistolWin", v)}
            />
          </div>
        )}

        {/* Actions */}
        <div style={styles.formActions}>
          {step > 0 && (
            <button
              style={styles.secondaryBtn}
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          )}
          {step < 2 && (
            <button
              style={styles.primaryBtn}
              onClick={() => setStep((s) => s + 1)}
            >
              Next →
            </button>
          )}
          {step === 2 && (
            <button style={styles.primaryBtn} onClick={handleSubmit}>
              SAVE MATCH
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function FormField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div style={styles.formField}>
      <label style={styles.formLabel}>{label}</label>
      <input
        style={styles.formInput}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FormSelect({ label, value, options, onChange, placeholder }) {
  return (
    <div style={styles.formField}>
      <label style={styles.formLabel}>{label}</label>
      <select
        style={{
          ...styles.formInput,
          color: value === "" ? "#8a9bb0" : "inherit",
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {/* Placeholder option shown when value is empty (e.g. AI returned null) */}
        {value === "" && (
          <option value="" disabled>
            {placeholder || `Select ${label}`}
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

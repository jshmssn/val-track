import { useEffect, useMemo, useState } from "react";

const PLAYBOOK_KEY = "val_track_team_playbook_v1";
const EMPTY_FORM = {
  title: "",
  map: "All Maps",
  phase: "Both",
  stratType: "Default",
  tags: "",
  trigger: "",
  setup: "",
  execution: "",
  contingency: "",
  notes: "",
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readPlaybook() {
  try {
    const raw = window.localStorage.getItem(PLAYBOOK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writePlaybook(items) {
  window.localStorage.setItem(PLAYBOOK_KEY, JSON.stringify(items));
}

function normalizeTags(tagsText) {
  return String(tagsText || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function TeamPlaybookModule({ matches = [], mapNames = [] }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [mapFilter, setMapFilter] = useState("All Maps");
  const [form, setForm] = useState(EMPTY_FORM);

  const mapOptions = useMemo(() => {
    const fromMatches = new Set((matches || []).map((m) => m.map).filter(Boolean));
    const fromRef = new Set((mapNames || []).filter(Boolean));
    return ["All Maps", ...new Set([...fromRef, ...fromMatches])];
  }, [matches, mapNames]);

  useEffect(() => {
    const saved = readPlaybook();
    setItems(saved);
    if (saved.length) setSelectedId(saved[0].id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (mapFilter !== "All Maps" && item.map !== mapFilter) return false;
      if (!q) return true;
      return [item.title, item.map, item.phase, item.stratType, ...(item.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, mapFilter, search]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  const stats = useMemo(() => {
    const total = items.length;
    const mapped = new Set(items.map((x) => x.map).filter((m) => m && m !== "All Maps")).size;
    const execs = items.filter((x) => x.stratType === "Exec").length;
    return { total, mapped, execs };
  }, [items]);

  function clearForm() {
    setForm(EMPTY_FORM);
  }

  function createPlay() {
    const title = form.title.trim();
    if (!title) return;
    const next = [
      {
        id: uid("play"),
        title,
        map: form.map,
        phase: form.phase,
        stratType: form.stratType,
        tags: normalizeTags(form.tags),
        trigger: form.trigger.trim(),
        setup: form.setup.trim(),
        execution: form.execution.trim(),
        contingency: form.contingency.trim(),
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...items,
    ];
    setItems(next);
    setSelectedId(next[0].id);
    writePlaybook(next);
    clearForm();
  }

  function updateSelected(patch) {
    if (!selected) return;
    const next = items.map((item) =>
      item.id === selected.id
        ? {
            ...item,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    setItems(next);
    writePlaybook(next);
  }

  function removeSelected() {
    if (!selected) return;
    const next = items.filter((item) => item.id !== selected.id);
    setItems(next);
    setSelectedId(next[0]?.id || "");
    writePlaybook(next);
  }

  return (
    <div className="playbook-layout">
      <div className="playbook-summary">
        <article className="playbook-card">
          <p>Total Plays</p>
          <strong>{stats.total}</strong>
        </article>
        <article className="playbook-card">
          <p>Maps Covered</p>
          <strong>{stats.mapped}</strong>
        </article>
        <article className="playbook-card">
          <p>Exec Plans</p>
          <strong>{stats.execs}</strong>
        </article>
      </div>

      <section className="playbook-create">
        <h3>Add Strategy</h3>
        <div className="playbook-grid">
          <input
            className="playbook-input"
            placeholder="Play title (ex: B Split Crunch)"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
          <select
            className="playbook-input"
            value={form.map}
            onChange={(e) => setForm((p) => ({ ...p, map: e.target.value }))}
          >
            {mapOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
          <select
            className="playbook-input"
            value={form.phase}
            onChange={(e) => setForm((p) => ({ ...p, phase: e.target.value }))}
          >
            {["Attack", "Defense", "Both"].map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
          <select
            className="playbook-input"
            value={form.stratType}
            onChange={(e) => setForm((p) => ({ ...p, stratType: e.target.value }))}
          >
            {["Default", "Exec", "Anti-Strat", "Retake", "Pistol", "Eco"].map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <input
          className="playbook-input"
          placeholder="Tags (comma separated: mid, anti-op, fast hit)"
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
        />
        <textarea
          className="playbook-textarea"
          rows={2}
          placeholder="Trigger condition (when to call this)"
          value={form.trigger}
          onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
        />
        <textarea
          className="playbook-textarea"
          rows={2}
          placeholder="Setup (positioning/util plan)"
          value={form.setup}
          onChange={(e) => setForm((p) => ({ ...p, setup: e.target.value }))}
        />
        <textarea
          className="playbook-textarea"
          rows={2}
          placeholder="Execution (step-by-step)"
          value={form.execution}
          onChange={(e) => setForm((p) => ({ ...p, execution: e.target.value }))}
        />
        <textarea
          className="playbook-textarea"
          rows={2}
          placeholder="Contingency (if plan fails)"
          value={form.contingency}
          onChange={(e) => setForm((p) => ({ ...p, contingency: e.target.value }))}
        />
        <textarea
          className="playbook-textarea"
          rows={2}
          placeholder="Extra notes"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
        <div className="playbook-actions">
          <button className="add-btn" onClick={createPlay} disabled={!form.title.trim()}>
            Save Strategy
          </button>
        </div>
      </section>

      <section className="playbook-library">
        <div className="playbook-toolbar">
          <input
            className="playbook-input"
            placeholder="Search title/tag/map"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="playbook-input"
            value={mapFilter}
            onChange={(e) => setMapFilter(e.target.value)}
          >
            {mapOptions.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="playbook-content">
          <div className="playbook-list">
            {filtered.map((item) => (
              <button
                key={item.id}
                className={`playbook-list-item${item.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.title}</strong>
                <span>
                  {item.map} | {item.phase} | {item.stratType}
                </span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">No strategies found</div>}
          </div>

          <div className="playbook-editor">
            {!selected && <div className="empty-state">Select a strategy to edit</div>}
            {selected && (
              <>
                <input
                  className="playbook-input"
                  value={selected.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                />
                <div className="playbook-grid">
                  <select
                    className="playbook-input"
                    value={selected.map}
                    onChange={(e) => updateSelected({ map: e.target.value })}
                  >
                    {mapOptions.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                  <select
                    className="playbook-input"
                    value={selected.phase}
                    onChange={(e) => updateSelected({ phase: e.target.value })}
                  >
                    {["Attack", "Defense", "Both"].map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                  <select
                    className="playbook-input"
                    value={selected.stratType}
                    onChange={(e) => updateSelected({ stratType: e.target.value })}
                  >
                    {["Default", "Exec", "Anti-Strat", "Retake", "Pistol", "Eco"].map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <input
                  className="playbook-input"
                  value={(selected.tags || []).join(", ")}
                  onChange={(e) => updateSelected({ tags: normalizeTags(e.target.value) })}
                />
                <textarea
                  className="playbook-textarea"
                  rows={2}
                  value={selected.trigger || ""}
                  onChange={(e) => updateSelected({ trigger: e.target.value })}
                />
                <textarea
                  className="playbook-textarea"
                  rows={2}
                  value={selected.setup || ""}
                  onChange={(e) => updateSelected({ setup: e.target.value })}
                />
                <textarea
                  className="playbook-textarea"
                  rows={2}
                  value={selected.execution || ""}
                  onChange={(e) => updateSelected({ execution: e.target.value })}
                />
                <textarea
                  className="playbook-textarea"
                  rows={2}
                  value={selected.contingency || ""}
                  onChange={(e) => updateSelected({ contingency: e.target.value })}
                />
                <textarea
                  className="playbook-textarea"
                  rows={2}
                  value={selected.notes || ""}
                  onChange={(e) => updateSelected({ notes: e.target.value })}
                />
                <div className="playbook-actions">
                  <button className="filter-reset" onClick={removeSelected}>
                    Delete Strategy
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

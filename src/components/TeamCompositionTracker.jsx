import { useEffect, useMemo, useState } from 'react';
import { compositionApi } from '../api/matchesApi';

const EMPTY_COMP = { name: '', notes: '', agents: [] };
const EMPTY_GAME = { match_id: '', notes: '', agents: [] };
const LOCAL_KEY = 'val_track_compositions_v1';

const UI = {
  pageBg: 'radial-gradient(1200px 280px at 8% -20%, rgba(56,189,248,0.16), transparent 52%), radial-gradient(1000px 260px at 95% -18%, rgba(45,212,191,0.12), transparent 50%)',
  panelBg: 'linear-gradient(180deg, rgba(11,18,30,0.96), rgba(7,12,23,0.97))',
  panelBorder: 'rgba(71,132,255,0.24)',
  panelBorderSoft: 'rgba(148,163,184,0.22)',
  textDim: '#91a5c8',
  textSoft: '#b9c8e0',
  textStrong: '#eef5ff',
  teal: '#2dd4bf',
  sky: '#38bdf8',
  red: '#f43f5e',
  amber: '#f59e0b',
};

const ROLE_ORDER = ['Duelist', 'Controller', 'Sentinel', 'Initiator', 'Flex'];
const AGENT_ROLE = {
  Astra: 'Controller', Breach: 'Initiator', Brimstone: 'Controller', Chamber: 'Sentinel',
  Clove: 'Controller', Cypher: 'Sentinel', Deadlock: 'Sentinel', Fade: 'Initiator',
  Gekko: 'Initiator', Harbor: 'Controller', Iso: 'Duelist', Jett: 'Duelist',
  'KAY/O': 'Initiator', Killjoy: 'Sentinel', Neon: 'Duelist', Omen: 'Controller',
  Phoenix: 'Duelist', Raze: 'Duelist', Reyna: 'Duelist', Sage: 'Sentinel',
  Skye: 'Initiator', Sova: 'Initiator', Tejo: 'Initiator', Veto: 'Sentinel',
  Viper: 'Controller', Vyse: 'Sentinel', Waylay: 'Duelist', Yoru: 'Duelist',
};

function safePct(w, t) {
  return t ? Math.round((w / t) * 100) : 0;
}

function parseScoreline(scoreline) {
  const [usRaw, themRaw] = String(scoreline || '').split('-');
  const us = Number(usRaw) || 0;
  const them = Number(themRaw) || 0;
  return { us, them, diff: us - them };
}

function compMomentum(games) {
  const recent = [...games].slice(0, 5);
  if (!recent.length) return 0;
  const score = recent.reduce((sum, g, idx) => sum + (g.result === 'Win' ? 3 : -2) * (5 - idx), 0);
  return Math.max(0, Math.min(100, Math.round(((score + 30) / 60) * 100)));
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal() {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocal(items) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function normalizeComp(comp) {
  return {
    ...comp,
    agents: Array.isArray(comp?.agents) ? comp.agents.filter(Boolean) : [],
    games: Array.isArray(comp?.games) ? comp.games : [],
  };
}

function isMissingEndpointError(err) {
  const msg = String(err?.message || '');
  return msg.includes('compositions.php') && (msg.includes('HTTP 404') || msg.includes('non-JSON'));
}

function groupAgentsByRole(agents) {
  const grouped = Object.fromEntries(ROLE_ORDER.map((r) => [r, []]));
  for (const agent of agents || []) grouped[AGENT_ROLE[agent] || 'Flex'].push(agent);
  return ROLE_ORDER.map((role) => ({ role, agents: grouped[role] || [] })).filter((x) => x.agents.length > 0);
}

export function TeamCompositionTracker({ agentNames = [], matches = [] }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [localMode, setLocalMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [compForm, setCompForm] = useState(EMPTY_COMP);
  const [gameForm, setGameForm] = useState(EMPTY_GAME);
  const [editingGameId, setEditingGameId] = useState(null);
  const [busy, setBusy] = useState('');

  const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);
  const canCreateComp = useMemo(() => compForm.name.trim().length > 0 && (compForm.agents || []).length > 0, [compForm]);
  const availableAgents = useMemo(() => [...new Set((agentNames || []).filter(Boolean))].sort(), [agentNames]);
  const groupedAgents = useMemo(() => groupAgentsByRole(availableAgents), [availableAgents]);

  const matchOptions = useMemo(
    () => [...(matches || [])]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map((m) => ({
        id: m.id,
        date: m.date || '',
        map: m.map || '',
        opponent: m.opponent || '',
        result: m.result || '',
        score: m.score || '',
        label: `${m.date || '-'} | ${m.map || '-'} | vs ${m.opponent || '-'} | ${m.result || '-'} ${m.score || ''}`,
      })),
    [matches],
  );

  const selectedMatch = useMemo(
    () => matchOptions.find((m) => m.id === gameForm.match_id) || null,
    [matchOptions, gameForm.match_id],
  );

  const enriched = useMemo(
    () => items.map((comp) => {
      const games = comp.games || [];
      const wins = games.filter((g) => g.result === 'Win').length;
      const losses = games.filter((g) => g.result === 'Loss').length;
      return {
        ...comp,
        perf: {
          played: games.length,
          wins,
          losses,
          winRate: safePct(wins, games.length),
          momentum: compMomentum(games),
        },
      };
    }),
    [items],
  );

  const sorted = useMemo(
    () => [...enriched].sort((a, b) => b.perf.winRate - a.perf.winRate || b.perf.played - a.perf.played),
    [enriched],
  );

  const summary = useMemo(() => {
    const totalComps = enriched.length;
    const totalLogs = enriched.reduce((sum, comp) => sum + comp.perf.played, 0);
    const best = [...enriched].sort((a, b) => b.perf.winRate - a.perf.winRate)[0] || null;
    return { totalComps, totalLogs, best };
  }, [enriched]);

  const recentLogs = useMemo(
    () =>
      sorted
        .flatMap((comp) => (comp.games || []).map((g) => ({ ...g, compName: comp.name })))
        .sort((a, b) => String(b.played_at || '').localeCompare(String(a.played_at || '')))
        .slice(0, 8),
    [sorted],
  );

  async function load() {
    try {
      setLoading(true);
      setError('');
      if (localMode) {
        const local = readLocal().map(normalizeComp);
        setItems(local);
        if (!selectedId && local.length) setSelectedId(local[0].id);
        if (selectedId && !local.some((d) => d.id === selectedId)) setSelectedId(local[0]?.id || null);
        return;
      }

      const data = await compositionApi.list();
      setItems((data || []).map(normalizeComp));
      if (!selectedId && data?.length) setSelectedId(data[0].id);
      if (selectedId && !data?.some((d) => d.id === selectedId)) setSelectedId(data?.[0]?.id || null);
    } catch (err) {
      if (isMissingEndpointError(err)) {
        const local = readLocal().map(normalizeComp);
        setLocalMode(true);
        setItems(local);
        setError('Composition API is not deployed (404). Running in local mode on this browser.');
      } else {
        setError(err.message || 'Failed to load compositions');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCompFormAgent(agent) {
    setCompForm((prev) => {
      const has = (prev.agents || []).includes(agent);
      return {
        ...prev,
        agents: has ? prev.agents.filter((a) => a !== agent) : [...(prev.agents || []), agent],
      };
    });
  }

  function toggleSelectedAgent(agent) {
    if (!selected) return;
    const current = selected.agents || [];
    const has = current.includes(agent);
    const next = has ? current.filter((a) => a !== agent) : [...current, agent];
    persistSelectedAgents(next);
  }

  function toggleGameAgent(agent) {
    setGameForm((prev) => {
      const has = (prev.agents || []).includes(agent);
      return {
        ...prev,
        agents: has ? prev.agents.filter((a) => a !== agent) : [...(prev.agents || []), agent],
      };
    });
  }
  async function createComposition(e) {
    e.preventDefault();
    const name = compForm.name.trim();
    if (!name) return alert('Composition name is required.');
    if (!(compForm.agents || []).length) return alert('Pick at least one agent for this composition.');

    try {
      setBusy('create-comp');
      if (localMode) {
        writeLocal([
          {
            id: newId('comp'),
            name,
            notes: compForm.notes.trim(),
            agents: compForm.agents || [],
            games: [],
          },
          ...readLocal(),
        ]);
      } else {
        await compositionApi.createComposition({
          name,
          notes: compForm.notes.trim(),
          agents: compForm.agents || [],
        });
      }
      setCompForm(EMPTY_COMP);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create composition');
    } finally {
      setBusy('');
    }
  }

  async function saveCompositionMeta() {
    if (!selected) return;
    const name = (selected.name || '').trim();
    if (!name) return alert('Composition name is required.');

    try {
      setBusy('save-comp');
      if (!(selected.agents || []).length) return alert('Pick at least one agent before saving.');

      if (localMode) {
        writeLocal(
          readLocal().map((x) =>
            x.id === selected.id
              ? { ...x, name, notes: selected.notes || '', agents: selected.agents || [] }
              : x,
          ),
        );
      } else {
        await compositionApi.updateComposition(selected.id, {
          name,
          notes: selected.notes || '',
          agents: selected.agents || [],
        });
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update composition');
    } finally {
      setBusy('');
    }
  }

  async function persistSelectedAgents(nextAgents) {
    if (!selected) return;
    const clean = Array.from(new Set((nextAgents || []).filter(Boolean)));

    setItems((prev) => prev.map((x) => (x.id === selected.id ? { ...x, agents: clean } : x)));

    try {
      setBusy('save-agents');
      if (localMode) {
        writeLocal(readLocal().map((x) => (x.id === selected.id ? { ...x, agents: clean } : x)));
      } else {
        await compositionApi.updateComposition(selected.id, { agents: clean });
      }
    } catch (err) {
      setError(err.message || 'Failed to save agents');
    } finally {
      setBusy('');
    }
  }

  async function addOrUpdateGame(e) {
    e.preventDefault();
    if (!selected) return;
    if (!gameForm.match_id) return alert('Please select a previous match.');

    const fallbackMeta = selectedMatch || {};
    const payload = {
      composition_id: selected.id,
      match_id: gameForm.match_id,
      played_at: fallbackMeta.date || '',
      map_name: fallbackMeta.map || '',
      opponent_name: fallbackMeta.opponent || '',
      result: fallbackMeta.result || 'Loss',
      scoreline: fallbackMeta.score || '',
      agents: gameForm.agents,
      notes: gameForm.notes,
    };

    try {
      setBusy('save-game');
      if (editingGameId) {
        if (localMode) {
          writeLocal(
            readLocal().map((comp) => {
              if (comp.id !== selected.id) return comp;
              return {
                ...comp,
                games: (comp.games || []).map((g) =>
                  g.id === editingGameId ? { ...g, ...payload, id: editingGameId } : g,
                ),
              };
            }),
          );
        } else {
          await compositionApi.updateGame(editingGameId, payload);
        }
      } else if (localMode) {
        writeLocal(
          readLocal().map((comp) => {
            if (comp.id !== selected.id) return comp;
            return {
              ...comp,
              games: [{ id: newId('game'), ...payload }, ...(comp.games || [])],
            };
          }),
        );
      } else {
        await compositionApi.addGame(payload);
      }
      setEditingGameId(null);
      setGameForm(EMPTY_GAME);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save game record');
    } finally {
      setBusy('');
    }
  }

  function startEditGame(game) {
    setEditingGameId(game.id);
    setGameForm({
      match_id: game.match_id || '',
      agents: Array.isArray(game.agents) ? game.agents : [],
      notes: game.notes || '',
    });
  }

  async function removeComposition(id) {
    if (!window.confirm('Delete this composition and all its records?')) return;
    try {
      setBusy(`del-comp-${id}`);
      if (localMode) writeLocal(readLocal().filter((x) => x.id !== id));
      else await compositionApi.deleteComposition(id);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete composition');
    } finally {
      setBusy('');
    }
  }

  async function removeGame(id) {
    if (!window.confirm('Delete this game record?')) return;
    try {
      setBusy(`del-game-${id}`);
      if (localMode) {
        writeLocal(
          readLocal().map((comp) =>
            comp.id !== selected?.id
              ? comp
              : { ...comp, games: (comp.games || []).filter((g) => g.id !== id) },
          ),
        );
      } else {
        await compositionApi.deleteGame(id);
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete game record');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="empty-state">Loading compositions...</div>;

  return (
    <div className="tcx-root" style={{ display: 'grid', gap: 14, background: UI.pageBg, padding: 10, borderRadius: 16 }}>
      <style>{`
        .tcx-root { position: relative; overflow: hidden; }
        .tcx-root::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 0%, rgba(56,189,248,0.05) 50%, transparent 100%);
          mix-blend-mode: screen;
        }
        .tcx-panel {
          backdrop-filter: blur(8px);
          animation: tcxFadeUp 420ms ease-out both;
        }
        .tcx-panel:nth-of-type(2) { animation-delay: 60ms; }
        .tcx-panel:nth-of-type(3) { animation-delay: 120ms; }
        .tcx-main-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); gap: 14px; }
        .tcx-builder-form-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
        .tcx-log-form-grid { display: grid; grid-template-columns: 1.6fr 1fr auto; gap: 8px; }
        .tcx-kpi {
          transition: transform 160ms ease, box-shadow 200ms ease, border-color 200ms ease;
        }
        .tcx-kpi:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 18px rgba(2, 132, 199, 0.2);
          border-color: rgba(56,189,248,0.4);
        }
        .tcx-comp-card {
          transition: transform 170ms ease, box-shadow 200ms ease, border-color 200ms ease, filter 200ms ease;
        }
        .tcx-comp-card:hover {
          transform: translateY(-3px) scale(1.01);
          box-shadow: 0 16px 26px rgba(56,189,248,0.2);
          border-color: rgba(56,189,248,0.55);
          filter: saturate(1.08);
        }
        .tcx-chip {
          transition: transform 120ms ease, filter 140ms ease, box-shadow 140ms ease;
        }
        .tcx-chip:hover {
          transform: translateY(-1px);
          filter: brightness(1.08);
          box-shadow: 0 6px 12px rgba(2, 132, 199, 0.25);
        }
        @keyframes tcxFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1200px) {
          .tcx-main-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .tcx-builder-form-grid, .tcx-log-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      {error && <div className="error-banner">Error: {error}</div>}
      {localMode && (
        <div className="error-banner">
          Team Composition is in local-only mode because `backend/api/compositions.php` is unavailable on this server.
        </div>
      )}

      <section
        className="tcx-panel"
        style={{
          border: `1px solid ${UI.panelBorder}`,
          borderRadius: 16,
          background:
            'radial-gradient(1100px 260px at 0% -30%, rgba(56,189,248,0.2), transparent 50%), radial-gradient(900px 260px at 100% -30%, rgba(45,212,191,0.16), transparent 52%), linear-gradient(180deg, rgba(7,13,24,0.98), rgba(5,9,18,0.98))',
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', color: UI.textDim, fontFamily: 'var(--mono)' }}>TEAM COMPOSITION TRACKER</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: UI.textStrong, marginTop: 4 }}>Composition Control Room</div>
            <div style={{ fontSize: 12, color: UI.textSoft, marginTop: 4 }}>Build comps, lock agents, and attach real match outcomes in one flow.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StepPill done={!!compForm.name.trim()} idx={1} text="Name" />
            <StepPill done={(compForm.agents || []).length > 0} idx={2} text="Agents" />
            <StepPill done={!!selected && (selected.games || []).length > 0} idx={3} text="Logs" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Kpi label="Comps" value={String(summary.totalComps)} tint={UI.sky} />
            <Kpi label="Logs" value={String(summary.totalLogs)} tint={UI.teal} />
            <Kpi label="Best WR" value={summary.best ? `${summary.best.perf.winRate}%` : '-'} tint="#34d399" />
          </div>
        </div>
      </section>
      <section className="tcx-main-grid">
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="tcx-panel" style={{ border: `1px solid ${UI.panelBorder}`, borderRadius: 16, background: UI.panelBg, padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: UI.textDim, fontFamily: 'var(--mono)' }}>COMPOSITION BUILDER</div>
              <div style={{ fontSize: 11, color: (compForm.agents || []).length ? '#34d399' : UI.amber, fontFamily: 'var(--mono)' }}>{(compForm.agents || []).length}/5 selected</div>
            </div>
            <form onSubmit={createComposition} style={{ display: 'grid', gap: 10 }}>
              <div className="tcx-builder-form-grid">
                <input className="form-input" placeholder="Team composition name" value={compForm.name} style={{ color: UI.textStrong, fontWeight: 900, borderColor: 'rgba(56,189,248,0.55)', boxShadow: '0 0 0 1px rgba(56,189,248,0.16), inset 0 0 0 1px rgba(255,255,255,0.03)', background: 'linear-gradient(180deg, rgba(12,27,47,0.96), rgba(8,18,33,0.96))' }} onChange={(e) => setCompForm((f) => ({ ...f, name: e.target.value }))} />
                <input className="form-input" placeholder="Identity / notes / map pool" value={compForm.notes} onChange={(e) => setCompForm((f) => ({ ...f, notes: e.target.value }))} />
                <button className="btn-primary" disabled={busy === 'create-comp' || !canCreateComp} style={{ background: 'linear-gradient(180deg, #f43f5e, #e11d48)', border: '1px solid rgba(251,113,133,0.45)', minWidth: 128 }}>{busy === 'create-comp' ? 'Creating...' : 'Create Comp'}</button>
              </div>

              <div style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, padding: '9px 10px', background: 'rgba(15,23,42,0.55)' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: UI.textDim, fontFamily: 'var(--mono)' }}>SELECTED LINEUP</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                  {(compForm.agents || []).length ? (compForm.agents || []).map((agent) => (
                    <span key={`sel-${agent}`} style={{ padding: '4px 9px', borderRadius: 999, fontSize: 11, border: '1px solid rgba(56,189,248,0.48)', color: '#eaf7ff', background: 'rgba(56,189,248,0.15)' }}>{agent}</span>
                  )) : <span style={{ color: UI.textDim, fontSize: 11 }}>No agents selected yet</span>}
                </div>
              </div>

              {groupedAgents.map((group) => (
                <RoleRow key={`new-${group.role}`} role={group.role}>
                  {group.agents.map((agent) => {
                    const active = (compForm.agents || []).includes(agent);
                    return (
                      <button key={`new-agent-${agent}`} type="button" className="btn-secondary tcx-chip" onClick={() => toggleCompFormAgent(agent)} style={{ padding: '6px 10px', borderRadius: 8, borderColor: active ? 'rgba(56,189,248,0.65)' : 'rgba(148,163,184,0.22)', color: active ? '#f8fdff' : '#9fb0cb', background: active ? 'linear-gradient(180deg, rgba(14,165,233,0.85), rgba(2,132,199,0.95))' : 'rgba(15,23,42,0.62)' }}>{active ? `${agent} x` : agent}</button>
                    );
                  })}
                </RoleRow>
              ))}
            </form>
          </section>

          {selected && (
            <section className="tcx-panel" style={{ border: `1px solid ${UI.panelBorder}`, borderRadius: 16, background: UI.panelBg, padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="form-input" value={selected.name || ''} style={{ color: UI.textStrong, fontWeight: 900, borderColor: 'rgba(56,189,248,0.55)', boxShadow: '0 0 0 1px rgba(56,189,248,0.16)' }} onChange={(e) => setItems((prev) => prev.map((x) => (x.id === selected.id ? { ...x, name: e.target.value } : x)))} />
                    <input className="form-input" value={selected.notes || ''} placeholder="Composition notes" onChange={(e) => setItems((prev) => prev.map((x) => (x.id === selected.id ? { ...x, notes: e.target.value } : x)))} />
                  </div>
                  <div style={{ fontSize: 11, color: UI.textSoft }}>Selected agents ({(selected.agents || []).length}): {(selected.agents || []).length ? (selected.agents || []).join(', ') : 'none'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={saveCompositionMeta} disabled={busy === 'save-comp'}>{busy === 'save-comp' ? 'Saving...' : 'Save'}</button>
                  <button className="btn-secondary" onClick={() => removeComposition(selected.id)} disabled={busy === `del-comp-${selected.id}`}>Delete</button>
                </div>
              </div>

              {groupedAgents.map((group) => (
                <RoleRow key={`edit-${group.role}`} role={group.role}>
                  {group.agents.map((agent) => {
                    const active = (selected.agents || []).includes(agent);
                    return (
                      <button key={`edit-agent-${agent}`} type="button" className="btn-secondary tcx-chip" onClick={() => toggleSelectedAgent(agent)} style={{ padding: '6px 10px', borderRadius: 8, borderColor: active ? 'rgba(56,189,248,0.65)' : 'rgba(148,163,184,0.22)', color: active ? '#f8fdff' : '#9fb0cb', background: active ? 'linear-gradient(180deg, rgba(14,165,233,0.85), rgba(2,132,199,0.95))' : 'rgba(15,23,42,0.62)' }}>{active ? `[ON] ${agent}` : agent}</button>
                    );
                  })}
                </RoleRow>
              ))}
            </section>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 12 }}>
          <section className="tcx-panel" style={{ border: `1px solid ${UI.panelBorderSoft}`, borderRadius: 14, background: UI.panelBg, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: UI.textDim, letterSpacing: '0.12em', fontFamily: 'var(--mono)' }}>SAVED COMPOSITIONS</div>
            {sorted.map((comp) => <CompCard key={comp.id} comp={comp} active={selectedId === comp.id} onClick={() => setSelectedId(comp.id)} />)}
            {sorted.length === 0 && <div className="empty-state">No compositions yet.</div>}
          </section>

          <section className="tcx-panel" style={{ border: `1px solid ${UI.panelBorderSoft}`, borderRadius: 14, background: UI.panelBg, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: UI.textDim, letterSpacing: '0.12em', fontFamily: 'var(--mono)' }}>RECENT MATCH LOGS</div>
            {recentLogs.length ? recentLogs.map((log) => (
              <div key={`log-${log.id}`} style={{ border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 9px', background: 'rgba(15,23,42,0.62)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ color: UI.textStrong, fontSize: 12, fontWeight: 700 }}>{log.opponent_name || 'Opponent'} on {log.map_name || '-'}</div>
                  <div style={{ color: log.result === 'Win' ? '#34d399' : '#fb7185', fontSize: 12, fontWeight: 800 }}>{log.result || '-'}</div>
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: UI.textDim }}>{log.played_at || '-'} | {log.compName || '-'}</div>
              </div>
            )) : <div className="empty-state">No logs in view.</div>}
          </section>
        </aside>
      </section>

      {selected && (
        <section className="tcx-panel" style={{ border: `1px solid ${UI.panelBorder}`, borderRadius: 16, background: UI.panelBg, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.13em', color: UI.textDim, fontFamily: 'var(--mono)' }}>LOG MATCH RESULT</div>
            <div style={{ fontSize: 12, color: UI.textSoft }}>Attach outcome to <strong style={{ color: UI.textStrong }}>{selected.name}</strong></div>
          </div>

          <form onSubmit={addOrUpdateGame} style={{ display: 'grid', gap: 8 }}>
            <div className="tcx-log-form-grid">
              <select className="form-input" value={gameForm.match_id} onChange={(e) => setGameForm((f) => ({ ...f, match_id: e.target.value }))}>
                <option value="">Select previous match</option>
                {matchOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <input className="form-input" placeholder="Notes / adjustments" value={gameForm.notes} onChange={(e) => setGameForm((f) => ({ ...f, notes: e.target.value }))} />
              <button className="btn-primary" disabled={busy === 'save-game' || !gameForm.match_id} style={{ background: 'linear-gradient(180deg, #14b8a6, #0f766e)', border: '1px solid rgba(94,234,212,0.45)' }}>{busy === 'save-game' ? 'Saving...' : editingGameId ? 'Update' : 'Add Log'}</button>
            </div>
            <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10, padding: '8px 10px', background: selectedMatch ? 'linear-gradient(160deg, rgba(20,184,166,0.16), rgba(255,255,255,0.01))' : 'rgba(15,23,42,0.62)', fontSize: 12, color: selectedMatch ? 'var(--text)' : UI.textDim }}>
              {selectedMatch ? `Selected: ${selectedMatch.date} | ${selectedMatch.map} | vs ${selectedMatch.opponent} | ${selectedMatch.result} ${selectedMatch.score}` : 'Select a previous match to auto-fill map/opponent/result/score.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => setGameForm((f) => ({ ...f, agents: [...(selected?.agents || [])] }))}>Use Comp Agents</button>
              <button type="button" className="btn-secondary" onClick={() => setGameForm((f) => ({ ...f, agents: [] }))}>Clear Log Agents</button>
              {editingGameId && <button type="button" className="btn-secondary" onClick={() => { setEditingGameId(null); setGameForm(EMPTY_GAME); }}>Cancel Edit</button>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableAgents.map((agent) => {
                const active = (gameForm.agents || []).includes(agent);
                return <button key={`log-agent-${agent}`} type="button" className="btn-secondary tcx-chip" onClick={() => toggleGameAgent(agent)} style={{ padding: '6px 9px', borderColor: active ? UI.red : 'rgba(148,163,184,0.22)', color: active ? '#fff' : '#9fb0cb', background: active ? 'linear-gradient(180deg, #f43f5e, #e11d48)' : 'rgba(15,23,42,0.62)' }}>{active ? `[ON] ${agent}` : agent}</button>;
              })}
            </div>
          </form>

          <div style={{ overflowX: 'auto' }}>
            <table className="stats-table" style={{ minWidth: 860 }}>
              <thead><tr><th>Date</th><th>Map</th><th>Opponent</th><th>Result</th><th>Score</th><th>Round Diff</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>
                {(selected.games || []).map((g) => {
                  const diff = parseScoreline(g.scoreline).diff;
                  return <tr key={g.id}>
                    <td>{g.played_at || '-'}</td>
                    <td>{g.map_name || '-'}</td>
                    <td>{g.opponent_name || '-'}</td>
                    <td style={{ color: g.result === 'Win' ? '#34d399' : '#fb7185' }}>{g.result}</td>
                    <td>{g.scoreline || '-'}</td>
                    <td>{g.scoreline ? (diff > 0 ? `+${diff}` : diff) : '-'}</td>
                    <td><div>{g.notes || '-'}</div><div style={{ fontSize: 10, color: UI.textDim, marginTop: 2 }}>Agents: {(g.agents || []).length ? g.agents.join(', ') : 'none'}</div></td>
                    <td style={{ display: 'flex', gap: 6 }}><button className="btn-secondary" onClick={() => startEditGame(g)}>Edit</button><button className="btn-secondary" onClick={() => removeGame(g.id)} disabled={busy === `del-game-${g.id}`}>Del</button></td>
                  </tr>;
                })}
                {(selected.games || []).length === 0 && <tr><td colSpan={8} style={{ color: UI.textDim }}>No game logs yet for this composition.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, tint }) {
  return (
    <div className="tcx-kpi" style={{ border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, background: 'rgba(15,23,42,0.66)', padding: '8px 10px' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#8ea4c7', fontFamily: 'var(--mono)' }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 16, fontWeight: 900, color: tint }}>{value}</div>
    </div>
  );
}

function StepPill({ done, idx, text }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 10px', border: done ? '1px solid rgba(52,211,153,0.45)' : '1px solid rgba(244,63,94,0.45)', background: done ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.1)', color: done ? '#34d399' : '#fb7185', fontSize: 11, letterSpacing: '0.08em', fontFamily: 'var(--mono)' }}>
      <strong style={{ fontSize: 10 }}>{idx}</strong>
      <span>{text}</span>
    </span>
  );
}

function RoleRow({ role, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#9cb3d4', letterSpacing: '0.08em', fontFamily: 'var(--mono)', paddingTop: 5 }}>{role.toUpperCase()}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

function CompCard({ comp, active, onClick }) {
  return (
    <button className="tcx-comp-card" onClick={onClick} style={{ textAlign: 'left', border: active ? '1px solid rgba(56,189,248,0.58)' : '1px solid rgba(148,163,184,0.22)', borderRadius: 12, padding: 10, cursor: 'pointer', color: '#e6eefc', background: active ? 'linear-gradient(180deg, rgba(56,189,248,0.15), rgba(8,13,23,0.95))' : 'linear-gradient(180deg, rgba(15,23,42,0.78), rgba(10,15,27,0.9))', boxShadow: active ? '0 10px 24px rgba(56,189,248,0.18)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, color: '#f1f6ff' }}>{comp.name}</div>
        <div style={{ fontSize: 11, color: '#34d399', fontFamily: 'var(--mono)' }}>{comp.perf.winRate}% WR</div>
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#91a5c8' }}>{comp.perf.wins}W-{comp.perf.losses}L | Momentum {comp.perf.momentum}%</div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#91a5c8' }}>{(comp.agents || []).length ? comp.agents.join(' | ') : 'No agents selected'}</div>
      <div style={{ marginTop: 7, height: 4, borderRadius: 999, background: 'rgba(148,163,184,0.2)' }}>
        <div style={{ width: `${Math.max(6, comp.perf.winRate)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #22d3ee, #34d399)' }} />
      </div>
    </button>
  );
}

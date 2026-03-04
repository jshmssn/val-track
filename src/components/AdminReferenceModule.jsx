import { useMemo, useState } from 'react';
import { referenceApi } from '../api/matchesApi';

const AGENT_ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel', 'Unassigned'];

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ');
}

export function AdminReferenceModule({ maps = [], agents = [], onRefresh }) {
  const [mapName, setMapName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('Unassigned');
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [writeBlocked, setWriteBlocked] = useState(false);

  const sortedMaps = useMemo(() => [...maps].sort((a, b) => a.name.localeCompare(b.name)), [maps]);
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => `${a.role}-${a.name}`.localeCompare(`${b.role}-${b.name}`)),
    [agents],
  );

  const mapNamesSet = useMemo(
    () => new Set(sortedMaps.map((m) => normalizeName(m.name).toLowerCase())),
    [sortedMaps],
  );
  const agentNamesSet = useMemo(
    () => new Set(sortedAgents.map((a) => normalizeName(a.name).toLowerCase())),
    [sortedAgents],
  );

  async function runAction(key, fn, okMessage) {
    try {
      setBusyKey(key);
      setNotice({ type: '', text: '' });
      await fn();
      await onRefresh?.();
      setNotice({ type: 'ok', text: okMessage });
    } catch (err) {
      const msg = err.message || 'Request failed';
      if (/method not allowed/i.test(msg)) {
        setWriteBlocked(true);
        setNotice({
          type: 'err',
          text: 'Server is read-only for reference updates. Deploy updated backend/api/reference.php to enable Add/Delete/Edit.',
        });
      } else {
        setNotice({ type: 'err', text: msg });
      }
    } finally {
      setBusyKey('');
    }
  }

  function submitMap(e) {
    e.preventDefault();
    const name = normalizeName(mapName);
    if (!name) return setNotice({ type: 'err', text: 'Map name is required.' });
    if (mapNamesSet.has(name.toLowerCase())) {
      return setNotice({ type: 'err', text: `Map "${name}" already exists.` });
    }
    runAction('add-map', () => referenceApi.addMap(name), `Map "${name}" added.`).then(() => setMapName(''));
  }

  function submitAgent(e) {
    e.preventDefault();
    const name = normalizeName(agentName);
    if (!name) return setNotice({ type: 'err', text: 'Agent name is required.' });
    if (agentNamesSet.has(name.toLowerCase())) {
      return setNotice({ type: 'err', text: `Agent "${name}" already exists.` });
    }
    runAction(
      'add-agent',
      () => referenceApi.addAgent(name, agentRole),
      `Agent "${name}" added.`,
    ).then(() => setAgentName(''));
  }

  return (
    <div className="adminref-layout">
      {notice.text && (
        <div className={`adminref-notice ${notice.type === 'ok' ? 'ok' : 'err'}`}>
          {notice.text}
        </div>
      )}

      <div className="adminref-kpis">
        <div className="adminref-kpi">
          <span className="kpi-label">Active Maps</span>
          <strong className="kpi-value">{sortedMaps.length}</strong>
        </div>
        <div className="adminref-kpi">
          <span className="kpi-label">Active Agents</span>
          <strong className="kpi-value">{sortedAgents.length}</strong>
        </div>
      </div>

      <div className="adminref-grid">
        <section className="adminref-panel">
          <div className="adminref-head">
            <h3>Maps</h3>
            <span className="adminref-count">{sortedMaps.length} active</span>
          </div>
          <p className="adminref-help">Add or remove maps available in forms and analytics modules.</p>
          <form className="adminref-form" onSubmit={submitMap}>
            <input
              className="adminref-input"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder="Add map name"
            />
            <button className="adminref-btn" type="submit" disabled={writeBlocked || busyKey === 'add-map'}>
              {busyKey === 'add-map' ? 'Adding...' : 'Add Map'}
            </button>
          </form>
          <div className="adminref-list">
            {sortedMaps.map((map) => (
              <div key={map.id} className="adminref-row">
                <span className="adminref-itemname">{map.name}</span>
                <button
                  className="adminref-del"
                  disabled={writeBlocked || busyKey === `del-map-${map.id}`}
                  onClick={() =>
                    runAction(
                      `del-map-${map.id}`,
                      () => referenceApi.deleteMap(map.id),
                      `Map "${map.name}" deleted.`,
                    )
                  }
                >
                  {busyKey === `del-map-${map.id}` ? '...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="adminref-panel">
          <div className="adminref-head">
            <h3>Agents</h3>
            <span className="adminref-count">{sortedAgents.length} active</span>
          </div>
          <p className="adminref-help">Manage the current agent pool for tracking and auto-import mapping.</p>
          <form className="adminref-form adminref-form-agent" onSubmit={submitAgent}>
            <input
              className="adminref-input"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Add agent name"
            />
            <select
              className="adminref-select"
              value={agentRole}
              onChange={(e) => setAgentRole(e.target.value)}
            >
              {AGENT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button className="adminref-btn" type="submit" disabled={writeBlocked || busyKey === 'add-agent'}>
              {busyKey === 'add-agent' ? 'Adding...' : 'Add Agent'}
            </button>
          </form>
          <div className="adminref-table-wrap">
            <table className="adminref-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <div className="adminref-agent-cell">
                        <span className="adminref-agent-dot" />
                        <span className="adminref-agent-name">{agent.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="adminref-role-badge">{agent.role || 'Unassigned'}</span>
                    </td>
                    <td className="adminref-actions-cell">
                      <button
                        className="adminref-del"
                        disabled={writeBlocked || busyKey === `del-agent-${agent.id}`}
                        onClick={() =>
                          runAction(
                            `del-agent-${agent.id}`,
                            () => referenceApi.deleteAgent(agent.id),
                            `Agent "${agent.name}" deleted.`,
                          )
                        }
                      >
                        {busyKey === `del-agent-${agent.id}` ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedAgents.length === 0 && (
                  <tr>
                    <td colSpan={3} className="adminref-empty-table">No agents found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

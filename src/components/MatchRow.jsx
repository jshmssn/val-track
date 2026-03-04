import { useState } from 'react';
import { MatchStatsModal } from './MatchStatsModal';

function EditMatchModal({ match, mapOptions = [], onClose, onSave }) {
  const [form, setForm] = useState({
    date: match.date || '',
    map: match.map || '',
    opponent: match.opponent || '',
    type: match.type || 'Scrim',
    result: match.result || 'Win',
    score: match.score || '',
  });
  const [saving, setSaving] = useState(false);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.date || !form.map) {
      alert('Date and map are required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: match.id,
        date: form.date,
        map: form.map,
        opponent: form.opponent,
        type: form.type,
        result: form.result,
        score: form.score,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Edit Match Details</div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label className="form-label">Date</label>
            <input
              className="form-input"
              type="date"
              value={form.date}
              onChange={(e) => setField('date', e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Map</label>
            <select
              className="form-input"
              value={form.map}
              onChange={(e) => setField('map', e.target.value)}
              style={{ color: form.map === '' ? 'var(--text3)' : 'inherit' }}
            >
              {form.map === '' && (
                <option value="" disabled>
                  Select Map
                </option>
              )}
              {mapOptions.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Opponent</label>
            <input
              className="form-input"
              value={form.opponent}
              onChange={(e) => setField('opponent', e.target.value)}
              placeholder="Team name"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Score</label>
            <input
              className="form-input"
              value={form.score}
              onChange={(e) => setField('score', e.target.value)}
              placeholder="13-9"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Type</label>
            <select
              className="form-input"
              value={form.type}
              onChange={(e) => setField('type', e.target.value)}
            >
              <option value="Scrim">Scrim</option>
              <option value="Tournament">Tournament</option>
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Result</label>
            <select
              className="form-input"
              value={form.result}
              onChange={(e) => setField('result', e.target.value)}
            >
              <option value="Win">Win</option>
              <option value="Loss">Loss</option>
              <option value="Draw">Draw</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MatchRow({ match, onDelete, onUpdate, mapOptions = [] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const isWin = match.result === 'Win';
  const isDraw = match.result === 'Draw';
  const rc = isWin ? 'var(--emerald)' : isDraw ? 'var(--amber)' : 'var(--red)';
  const hasStats = (match.playerStats || []).length > 0;

  return (
    <>
      <div className="match-card" onClick={() => setOpen(true)}>
        <div
          className="match-result-bar"
          style={{ background: rc, color: 'transparent', fontSize: 0, minWidth: 8 }}
        />

        <div className="match-score-cell">
          <div className="match-score-num" style={{ color: rc }}>
            {match.score || '\u2014'}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text3)',
              fontFamily: 'var(--mono)',
              marginTop: 2,
              letterSpacing: '0.06em',
            }}
          >
            {isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'}
          </div>
        </div>

        <div className="match-info-cell">
          <div className="match-opponent">{match.opponent || '\u2014'}</div>
          <div className="match-meta-row">
            <span className="meta-chip">{match.map}</span>
            <span className="meta-dot">&middot;</span>
            <span className="meta-chip">{match.date}</span>
            {match.type === 'Tournament' && match.tournament && (
              <>
                <span className="meta-dot">&middot;</span>
                <span className="meta-chip" style={{ color: 'var(--amber)' }}>
                  {match.tournament}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="match-actions" onClick={(e) => e.stopPropagation()}>
          {hasStats && <span className="players-pill">{match.playerStats.length}P</span>}
          {match.type === 'Tournament' ? (
            <span
              className="type-badge"
              style={{
                background: 'rgba(245,158,11,0.15)',
                color: 'var(--amber)',
                borderColor: 'rgba(245,158,11,0.3)',
                border: '1px solid',
              }}
            >
              TOURN
            </span>
          ) : (
            <span className="type-badge" style={{ background: 'var(--s3)', color: 'var(--text3)' }}>
              SCRIM
            </span>
          )}
          {onUpdate && (
            <button
              className="type-badge"
              style={{
                background: 'rgba(14,165,233,0.12)',
                color: 'var(--sky)',
                border: '1px solid rgba(14,165,233,0.35)',
              }}
              onClick={() => setEditing(true)}
            >
              EDIT
            </button>
          )}
          {onDelete && (
            <button
              className="del-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this match?')) onDelete(match.id);
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {open && <MatchStatsModal match={match} onClose={() => setOpen(false)} />}
      {editing && (
        <EditMatchModal
          match={match}
          mapOptions={mapOptions}
          onClose={() => setEditing(false)}
          onSave={(payload) => onUpdate(payload)}
        />
      )}
    </>
  );
}

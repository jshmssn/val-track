import { useEffect, useState } from "react";

export function PlayerNoteModal({
  open,
  player = "",
  initialBody = "",
  saving = false,
  onSave,
  onDelete,
  onClose,
}) {
  const [body, setBody] = useState(initialBody || "");

  useEffect(() => {
    if (open) setBody(initialBody || "");
  }, [open, initialBody]);

  if (!open) return null;

  const trimmed = body.trim();

  return (
    <div className="alert-modal-overlay" onClick={onClose}>
      <div className="alert-modal-box note-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="alert-modal-head">
          <span className="alert-modal-title">Player Note: {player || "-"}</span>
          <button className="alert-modal-close" onClick={onClose} aria-label="Close note modal">
            x
          </button>
        </div>
        <div className="alert-modal-body">
          <textarea
            className="note-modal-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add coaching note for this player in this match..."
            rows={6}
            autoFocus
          />
        </div>
        <div className="alert-modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {!!initialBody?.trim() && (
            <button className="btn-secondary note-delete-btn" onClick={onDelete} disabled={saving}>
              Delete
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => onSave && onSave(trimmed)}
            disabled={saving || !trimmed}
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}


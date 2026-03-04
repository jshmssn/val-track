export function ConfirmModal({
  open,
  title = "Confirm",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="alert-modal-overlay" onClick={onCancel}>
      <div className="alert-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="alert-modal-head">
          <span className="alert-modal-title">{title}</span>
          <button className="alert-modal-close" onClick={onCancel} aria-label="Close confirm">
            ✕
          </button>
        </div>
        <div className="alert-modal-body">{message}</div>
        <div className="alert-modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

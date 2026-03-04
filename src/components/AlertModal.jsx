export function AlertModal({ open, title = "Notice", message = "", onClose }) {
  if (!open) return null;

  return (
    <div className="alert-modal-overlay" onClick={onClose}>
      <div className="alert-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="alert-modal-head">
          <span className="alert-modal-title">{title}</span>
          <button className="alert-modal-close" onClick={onClose} aria-label="Close alert">
            ✕
          </button>
        </div>
        <div className="alert-modal-body">{message}</div>
        <div className="alert-modal-actions">
          <button className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

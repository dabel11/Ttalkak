export function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" type="button" onClick={onCancel}>취소</button>
          <button className="confirm-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

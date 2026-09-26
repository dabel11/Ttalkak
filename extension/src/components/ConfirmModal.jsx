import { useModalFocus } from "../hooks/useModalFocus";

export function ConfirmModal({ title, message, confirmLabel, danger = true, onCancel, onConfirm }) {
  const dialogRef = useModalFocus(onCancel);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" ref={dialogRef} tabIndex={-1}>
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" type="button" onClick={onCancel} data-modal-initial-focus>취소</button>
          <button className={danger ? "confirm-danger" : "confirm-primary"} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

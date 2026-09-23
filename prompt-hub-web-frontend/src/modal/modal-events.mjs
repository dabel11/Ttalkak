const modalFocusTrapCleanups = new WeakMap();

function bindModalEvents(root, actions, state) {
  const bind = (selector, handler) => root.querySelectorAll(selector).forEach((node) => node.addEventListener("click", handler));
  bind("[data-close-auth]", () => { state.authView = null; state.authError = ""; actions.render(); actions.restoreAuthFocus?.(); });
  bind("[data-close-admin-user-block]", () => { state.adminBlockTarget = null; actions.render(); });
  root.querySelectorAll(".modal-backdrop.visible").forEach((node) => node.addEventListener("mousedown", (event) => { if (event.target === node) actions.closeTop(); }));
  bind("[data-close-detail]", () => { state.detailPromptId = null; state.detailHighlightCommentId = null; actions.render(); });
  bind("[data-close-prompt-edit]", () => { state.editingPromptId = null; actions.render(); });
  bind("[data-close-revision-request]", () => { state.adminRequestTargetKey = null; actions.render(); });
  bind("[data-close-report]", () => { state.reportPromptId = null; state.reportCommentId = null; actions.render(); });
  bind("[data-close-execute]", () => { state.executeMessageId = null; state.executePromptId = null; actions.renderPreservingScroll(); });
  bind("[data-cancel-confirm]", () => actions.closeTop());
  bind("[data-confirm-alternative]", async () => actions.runConfirmedAction(true));
  bind("[data-confirm-action]", async () => actions.runConfirmedAction(false));

  modalFocusTrapCleanups.get(root)?.();
  const modals = [...root.querySelectorAll(".modal")];
  const activeModal = modals.at(-1);
  if (!activeModal) {
    modalFocusTrapCleanups.delete(root);
    return;
  }
  const focusableSelector = ":is(button,input,textarea,select):not(:disabled),a[href],[tabindex]:not([tabindex='-1'])";
  const trapFocus = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...activeModal.querySelectorAll(focusableSelector)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if ((event.shiftKey ? root.activeElement === first : root.activeElement === last) || !activeModal.contains(root.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
  root.addEventListener("keydown", trapFocus, true);
  modalFocusTrapCleanups.set(root, () => root.removeEventListener("keydown", trapFocus, true));
}
export { bindModalEvents };

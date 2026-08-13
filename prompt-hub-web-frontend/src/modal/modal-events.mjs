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
}
export { bindModalEvents };

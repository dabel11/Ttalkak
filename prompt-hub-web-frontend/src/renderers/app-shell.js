(function attachAppShellRenderer(global) {
  "use strict";

  function renderAppShell(ctx) {
    const {
      state,
      escapeHtml,
      persistState,
      Sidebar,
      Header,
      Page,
      PromptDetailModal,
      PromptEditModal,
      AdminRevisionRequestModal,
      AuthModal,
      ReportModal,
      ExecuteModal,
      ConfirmModal,
      AdminUserBlockModal,
      bindEvents,
      focusActiveModal,
      restorePendingMessageScroll,
      scrollToPendingLatestMessage,
      scrollToHighlightedComment,
      hydrateBackendMakeDataIfNeeded,
      hydrateBackendMyPageDataIfNeeded,
      hydrateBackendAdminDataIfNeeded,
    } = ctx;

    persistState();
    document.querySelector("#app").innerHTML = `
      <div class="app-shell">
        ${Sidebar()}
        <main class="main-area">
          ${Header()}
          <section class="content-area">${Page()}</section>
        </main>
        ${state.detailPromptId ? PromptDetailModal() : ""}
        ${state.editingPromptId ? PromptEditModal() : ""}
        ${state.adminRequestTargetKey ? AdminRevisionRequestModal() : ""}
        ${state.authView ? AuthModal() : ""}
        ${state.reportPromptId || state.reportCommentId ? ReportModal() : ""}
        ${state.executeMessageId || state.executePromptId ? ExecuteModal() : ""}
        ${state.confirmAction ? ConfirmModal() : ""}
        ${state.adminBlockTarget ? AdminUserBlockModal() : ""}
        ${state.notice ? `<div class="toast" role="status">${escapeHtml(state.notice)}</div>` : ""}
      </div>
    `;
    bindEvents();
    focusActiveModal();
    restorePendingMessageScroll();
    scrollToPendingLatestMessage();
    scrollToHighlightedComment();
    hydrateBackendMakeDataIfNeeded();
    hydrateBackendMyPageDataIfNeeded();
    hydrateBackendAdminDataIfNeeded();
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    renderAppShell,
  });
})(window);

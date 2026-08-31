  "use strict";

  function createHomeController(ctx) {
    let searchCommitTimer = null;
    let searchTipTimer = null;
    let recoveryNoticeTimer = null;
    let retryPromise = null;

    function cancelSearchCommit() {
      globalThis.clearTimeout(searchCommitTimer);
      searchCommitTimer = null;
    }

    function restoreSearchFocus() {
      const state = ctx.state;
      if (state.detailPromptId || state.authView || state.reportPromptId || state.reportCommentId || state.confirmAction) return;
      const nextInput = ctx.root.querySelector("[data-tag-search]");
      if (!nextInput) return;
      const activeElement = ctx.document.activeElement;
      const isEditingField = activeElement && activeElement !== ctx.document.body && activeElement !== nextInput && activeElement.matches?.("input, textarea, select, [contenteditable='true']");
      if (isEditingField) return;
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }

    function commitSearchQuery(value) {
      cancelSearchCommit();
      if (!ctx.applySearchQuery(value)) return false;
      ctx.refresh();
      ctx.render();
      restoreSearchFocus();
      return true;
    }

    function scheduleSearchCommit(value) {
      cancelSearchCommit();
      searchCommitTimer = globalThis.setTimeout(() => commitSearchQuery(value), ctx.debounceMs);
    }

    function showSearchTipOnce() {
      if (ctx.state.searchTipShown) return false;
      ctx.state.searchTipShown = true;
      ctx.state.searchTipVisible = true;
      globalThis.clearTimeout(searchTipTimer);
      ctx.render();
      restoreSearchFocus();
      searchTipTimer = globalThis.setTimeout(() => {
        ctx.state.searchTipVisible = false;
        ctx.root.querySelector("[data-search-help]")?.classList.remove("show-tip");
      }, 2000);
      return true;
    }

    function changeScope(value) {
      ctx.applyScope(ctx.validScope(value));
      ctx.refresh();
      ctx.render();
      restoreSearchFocus();
    }

    function changeSort(value) {
      ctx.applySort(value);
      ctx.refresh();
      ctx.render();
    }

    function changePage(value) {
      ctx.applyPage(value);
      if (ctx.state.backendStatus === "connected") ctx.refresh();
      ctx.render();
    }

    async function retryHomeLoad({ automatic = false } = {}) {
      if (retryPromise) return retryPromise;
      ctx.state.backendStatus = "checking";
      ctx.state.backendRecoveryNotice = "";
      ctx.state.backendStatusMessage = automatic ? "서버 연결 복구를 자동으로 확인 중입니다." : "Home 프롬프트를 다시 불러오는 중입니다.";
      ctx.render();
      retryPromise = Promise.resolve(ctx.refresh()).then(() => {
        if (ctx.state.backendStatus !== "connected") return;
        ctx.state.backendRecoveryNotice = "연결이 복구되어 프롬프트 목록을 갱신했습니다.";
        ctx.render();
        globalThis.clearTimeout(recoveryNoticeTimer);
        recoveryNoticeTimer = globalThis.setTimeout(() => {
          ctx.state.backendRecoveryNotice = "";
          ctx.render();
        }, 2400);
        recoveryNoticeTimer?.unref?.();
      }).finally(() => { retryPromise = null; });
      return retryPromise;
    }

    return Object.freeze({ cancelSearchCommit, changePage, changeScope, changeSort, commitSearchQuery, restoreSearchFocus, retryHomeLoad, scheduleSearchCommit, showSearchTipOnce });
  }

export { createHomeController };

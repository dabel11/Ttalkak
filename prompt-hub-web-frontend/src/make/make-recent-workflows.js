(function attach(global) {
  "use strict";
  function createMakeRecentWorkflows(ctx) {
    const { state, savedPrompts, render, showNotice, getMakeApi, getMakeApiToken, isBackendNumericId, hasBackendAuthToken, deleteMakeThreadState, handleBackendAccessError, refreshMakeThreadsFromBackend, updateRecentMakeThreadState, getMakeMutationStateContext, openRecentMakeThreadState, openSavedMakePromptState, startNewMakeChatState } = ctx;

    async function performDeleteThread(threadId) {
      const thread = state.recentThreads.find((item) => item.id === threadId || item.serverId === threadId);
      const backendThreadId = thread?.serverId || (isBackendNumericId(threadId) ? threadId : "");
      const api = getMakeApi();
      if (!state.isLoggedIn || !backendThreadId || !api?.deleteMakeThread || !hasBackendAuthToken()) {
        performDeleteThreadLocal(threadId);
        render();
        return;
      }
      try {
        await api.deleteMakeThread(backendThreadId, getMakeApiToken());
        deleteMakeThreadState(state, threadId);
        showNotice("대화를 삭제했습니다.");
        render();
        refreshMakeThreadsFromBackend();
      } catch (error) {
        const status = Number(error?.status || error?.payload?.status || 0);
        if (status === 404) {
          showNotice("이미 삭제되었거나 접근할 수 없는 대화입니다.");
          deleteMakeThreadState(state, threadId);
          render();
          refreshMakeThreadsFromBackend();
          return;
        }
        handleBackendAccessError(error, "대화 삭제 요청에 실패했습니다.");
        render();
      }
    }

    function performDeleteThreadLocal(threadId) {
      deleteMakeThreadState(state, threadId);
      showNotice("대화를 삭제했습니다.");
    }

    function updateRecentThread(threadId) {
      updateRecentMakeThreadState(getMakeMutationStateContext(), threadId);
    }

    function openRecentThread(threadId) {
      const thread = state.recentThreads.find((item) => item.id === threadId);
      if (!thread) return;

      openRecentMakeThreadState(state, thread);
      render();
    }

    function openSavedMakePrompt(promptId) {
      const prompt = savedPrompts.find((item) => item.id === promptId);
      if (!prompt?.messages?.length) return;

      openSavedMakePromptState(getMakeMutationStateContext(), promptId, prompt);
      render();
    }

    function startNewChat() {
      startNewMakeChatState(state);
      render();
    }

    function getRecentThreadKey(text) {
      return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function getRecentThreadKeyFromThread(thread) {
      return thread.id || thread.dedupeKey || "";
    }

    return Object.freeze({ performDeleteThreadLocal, performDeleteThread, updateRecentThread, openRecentThread, openSavedMakePrompt, startNewChat, getRecentThreadKeyFromThread, getRecentThreadKey });
  }
  const api = Object.freeze({ createMakeRecentWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakMakeRecentWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);

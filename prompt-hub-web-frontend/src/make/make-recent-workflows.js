(function attach(global) {
  "use strict";
  function createMakeRecentWorkflows(ctx) {
    const { state, savedPrompts, render, showNotice, makePreview, makePromptTitle, getMakeApi, getMakeApiToken, isBackendNumericId, hasBackendAuthToken, deleteMakeThreadState, handleBackendAccessError, refreshMakeThreadsFromBackend, updateRecentMakeThreadState, getMakeMutationStateContext, openRecentMakeThreadState, openSavedMakePromptState, startNewMakeChatState } = ctx;

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

    function splitThreadFromMessage(messageId) {
      const splitIndex = state.messages.findIndex((item) => item.id === messageId && item.role === "user");
      if (splitIndex <= 0) return false;
      const sourceThread = state.recentThreads.find(
        (item) => item.id === state.activeThreadId || item.serverId === state.activeThreadId,
      );
      if (!sourceThread || isBackendNumericId(sourceThread.serverId || sourceThread.id)) return false;
      const sourceMessages = state.messages.slice(0, splitIndex).map((item) => ({ ...item }));
      const splitMessages = state.messages.slice(splitIndex).map((item) => ({ ...item }));
      const lastSource = [...sourceMessages].reverse().find((item) => item.role === "assistant" || item.role === "user");
      sourceThread.messages = sourceMessages;
      sourceThread.preview = makePreview(lastSource?.content || lastSource?.answer || "");
      const firstUser = splitMessages.find((item) => item.role === "user");
      const lastSplit = [...splitMessages].reverse().find((item) => item.role === "assistant" || item.role === "user");
      const threadId = `split-thread-${Date.now()}`;
      const newThread = {
        id: threadId,
        dedupeKey: threadId,
        title: makePromptTitle(firstUser?.content || "분리한 대화"),
        preview: makePreview(lastSplit?.content || lastSplit?.answer || ""),
        createdAt: Date.now(),
        folderId: sourceThread?.folderId || "uncategorized",
        serverId: "",
        messages: splitMessages,
      };
      state.messages = splitMessages;
      state.activeThreadId = threadId;
      state.recentThreads = [newThread, ...state.recentThreads.filter((item) => item.id !== threadId)].slice(0, 8);
      showNotice("선택한 메시지부터 새 대화로 분리했습니다.");
      render();
      return true;
    }

    function getRecentThreadKey(text) {
      return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function getRecentThreadKeyFromThread(thread) {
      return thread.id || thread.dedupeKey || "";
    }

    return Object.freeze({ performDeleteThreadLocal, performDeleteThread, updateRecentThread, openRecentThread, openSavedMakePrompt, startNewChat, splitThreadFromMessage, getRecentThreadKeyFromThread, getRecentThreadKey });
  }
  const api = Object.freeze({ createMakeRecentWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakMakeRecentWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);

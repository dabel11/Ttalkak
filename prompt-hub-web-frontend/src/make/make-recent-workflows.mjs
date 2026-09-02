// @ts-check
/** @param {Record<string, any>} ctx */
export function createMakeRecentWorkflows(ctx) {
    const { state, savedPrompts, render, showNotice, makePreview, makePromptTitle, getMakeApi, getMakeApiToken, isBackendNumericId, canSplitMakeThread, findMakeThread, hasBackendAuthToken, deleteMakeThreadState, handleBackendAccessError, refreshMakeThreadsFromBackend, updateRecentMakeThreadState, getMakeMutationStateContext, openRecentMakeThreadState, openSavedMakePromptState, startNewMakeChatState } = ctx;

    /** @param {TtalkakId} threadId */
    async function performDeleteThread(threadId) {
      const thread = state.recentThreads.find((/** @type {TtalkakStateEntity} */ item) => item.id === threadId || item.serverId === threadId);
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
        const failure = /** @type {{status?: number, payload?: {status?: number}}} */ (error);
        const status = Number(failure?.status || failure?.payload?.status || 0);
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

    /** @param {TtalkakId} threadId */
    function performDeleteThreadLocal(threadId) {
      deleteMakeThreadState(state, threadId);
      showNotice("대화를 삭제했습니다.");
    }

    /** @param {TtalkakId} threadId */
    function updateRecentThread(threadId) {
      updateRecentMakeThreadState(getMakeMutationStateContext(), threadId);
    }

    /** @param {TtalkakId} threadId */
    function openRecentThread(threadId) {
      const thread = state.recentThreads.find((/** @type {TtalkakStateEntity} */ item) => item.id === threadId);
      if (!thread) return;

      openRecentMakeThreadState(state, thread);
      render();
    }

    /** @param {TtalkakId} promptId */
    function openSavedMakePrompt(promptId) {
      const prompt = savedPrompts.find((/** @type {TtalkakStateEntity} */ item) => item.id === promptId);
      if (!prompt?.messages?.length) return;

      openSavedMakePromptState(getMakeMutationStateContext(), promptId, prompt);
      render();
    }

    function startNewChat() {
      startNewMakeChatState(state);
      render();
    }

    /** @param {TtalkakId} messageId */
    function splitThreadFromMessage(messageId) {
      const splitIndex = state.messages.findIndex((/** @type {TtalkakStateEntity} */ item) => item.id === messageId && item.role === "user");
      if (splitIndex <= 0) return false;
      const sourceThread = findMakeThread(state.recentThreads, state.activeThreadId);
      if (!canSplitMakeThread(sourceThread, isBackendNumericId)) return false;
      const sourceMessages = state.messages.slice(0, splitIndex).map((/** @type {TtalkakStateEntity} */ item) => ({ ...item }));
      const splitMessages = state.messages.slice(splitIndex).map((/** @type {TtalkakStateEntity} */ item) => ({ ...item }));
      const lastSource = [...sourceMessages].reverse().find((/** @type {TtalkakStateEntity} */ item) => item.role === "assistant" || item.role === "user");
      sourceThread.messages = sourceMessages;
      sourceThread.preview = makePreview(lastSource?.content || lastSource?.answer || "");
      const firstUser = splitMessages.find((/** @type {TtalkakStateEntity} */ item) => item.role === "user");
      const lastSplit = [...splitMessages].reverse().find((/** @type {TtalkakStateEntity} */ item) => item.role === "assistant" || item.role === "user");
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
      state.recentThreads = [newThread, ...state.recentThreads.filter((/** @type {TtalkakStateEntity} */ item) => item.id !== threadId)].slice(0, 8);
      showNotice("선택한 메시지부터 새 대화로 분리했습니다.");
      render();
      return true;
    }

    /** @param {unknown} text */
    function getRecentThreadKey(text) {
      return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    /** @param {TtalkakStateEntity} thread */
    function getRecentThreadKeyFromThread(thread) {
      return thread.id || thread.dedupeKey || "";
    }

    return Object.freeze({ performDeleteThreadLocal, performDeleteThread, updateRecentThread, openRecentThread, openSavedMakePrompt, startNewChat, splitThreadFromMessage, getRecentThreadKeyFromThread, getRecentThreadKey });
  }

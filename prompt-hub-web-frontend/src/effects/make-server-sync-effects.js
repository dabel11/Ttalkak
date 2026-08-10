(function attachMakeServerSyncEffects(global) {
  "use strict";

  function createMakeServerSyncEffects(ctx) {
    const {
      applyMakeThreadsResult,
      buildMakeImproveHistory,
      canUseDemoFallback,
      getApiFailureMessage,
      getBackendDataEffectContext,
      getBackendFolderId,
      getMakeApi,
      getMakeApiToken,
      handleBackendAccessError,
      handleMakeBackendSyncError,
      hasBackendAuthToken,
      isBackendNumericId,
      makePreview,
      makePromptTitle,
      normalizeRecentThreads,
      openRecentMakeThreadState,
      polishPrompt,
      queueLatestMakeThreadScroll,
      render,
      renderPreservingMakeScroll,
      scrollToMakeLatestMessage,
      state,
      reportWarning,
    } = ctx;

    async function createBackendMakeThread(thread) {
      const api = getMakeApi();
      if (!hasBackendAuthToken()) return "";
      if (!api?.createMakeThread || !thread) return "";

      const messages = Array.isArray(thread.messages) && thread.messages.length
        ? thread.messages
        : state.messages;
      try {
        const payload = {
          title: thread.title || makePromptTitle(messages.find((message) => message.role === "user")?.content || "새 대화"),
          preview: makePreview(thread.preview || messages[messages.length - 1]?.content || ""),
          folderId: getBackendFolderId(thread.folderId),
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            mode: message.mode || "improve",
            answer: message.answer || "",
            improvedPrompt: message.improvedPrompt || "",
            questions: message.questions || [],
            changes: message.changes || [],
            fields: message.fields || [],
            techniques: message.techniques || [],
            summary: message.summary || "",
            sources: message.sources || [],
            ragStatus: message.ragStatus || "",
            ragMessage: message.ragMessage || "",
            sourcePrompt: message.sourcePrompt || "",
          })),
        };
        const result = await api.createMakeThread(
          payload,
          getMakeApiToken(),
        );
        return String(result?.id || result?.threadId || result?.data?.id || result?.data?.threadId || "");
      } catch (error) {
        handleMakeBackendSyncError(
          error,
          "대화 저장 요청에 실패해 로컬 데모 대화만 유지합니다.",
          "대화 저장 요청에 실패했습니다.",
          "[TTALKAK] /api/make/threads 저장 호출에 실패했습니다.",
          { keepSession: true },
        );
        return "";
      }
    }

    async function ensureBackendMakeThreadId(thread) {
      if (!thread) return "";
      if (isBackendNumericId(thread.serverId)) return String(thread.serverId);
      if (isBackendNumericId(thread.id)) {
        thread.serverId = String(thread.id);
        return thread.serverId;
      }

      const serverId = await createBackendMakeThread(thread);
      if (serverId) {
        thread.serverId = serverId;
        return serverId;
      }
      return "";
    }

    function getMakeThreadById(threadId = state.activeThreadId) {
      if (!threadId) return null;
      return state.recentThreads.find((item) => item.id === threadId || item.serverId === threadId) || null;
    }

    function getMakeBackendThreadId(threadId = state.activeThreadId) {
      const thread = getMakeThreadById(threadId);
      const candidate = thread?.serverId || (isBackendNumericId(thread?.id) ? thread.id : "") || (isBackendNumericId(threadId) ? threadId : "");
      return isBackendNumericId(candidate) ? String(candidate) : "";
    }

    function getImproveResultThreadId(result) {
      if (!result || typeof result !== "object") return "";
      const candidate =
        result.threadId ||
        result.thread_id ||
        result.raw?.threadId ||
        "";
      return isBackendNumericId(candidate) ? String(candidate) : "";
    }

    function applyImproveThreadId(threadId, result) {
      const backendThreadId = getImproveResultThreadId(result);
      if (!backendThreadId) return "";

      state.pendingMakeImproveThread = { localThreadId: String(threadId || ""), backendThreadId };
      const thread = getMakeThreadById(threadId);
      if (thread) thread.serverId = backendThreadId;
      return backendThreadId;
    }

    function applyPendingImproveThreadId(threadId) {
      const pending = state.pendingMakeImproveThread;
      if (!pending?.backendThreadId || String(pending.localThreadId || "") !== String(threadId || "")) return;

      const thread = getMakeThreadById(threadId);
      if (thread) thread.serverId = pending.backendThreadId;
      state.pendingMakeImproveThread = null;
    }

    function shouldUseImproveThreadSync() {
      return state.isLoggedIn && hasBackendAuthToken();
    }

    function buildMakeImprovePayload(prompt, history, threadId, { messageId = "", category = "" } = {}) {
      const payload = { prompt, category: category || "prompt_techniques" };
      if (shouldUseImproveThreadSync()) {
        const backendThreadId = getMakeBackendThreadId(threadId);
        if (backendThreadId) payload.threadId = Number(backendThreadId);
        if (messageId) payload.messageId = String(messageId);
        if (category) payload.category = String(category);
        return payload;
      }

      payload.history = history;
      return payload;
    }

    async function improvePromptWithBackend(prompt, {
      history = buildMakeImproveHistory(),
      threadId = state.activeThreadId,
      messageId = "",
      category = "",
    } = {}) {
      const api = getMakeApi();
      if (!api?.improvePrompt) {
        if (canUseDemoFallback()) {
          const fallbackText = polishPrompt(prompt);
          return { text: fallbackText, mode: "improve", improvedPrompt: fallbackText };
        }
        const error = Object.assign(new Error("Make 첨삭 API wrapper가 없어 서버 요청을 보낼 수 없습니다."), { code: "API_NOT_CONFIGURED" });
        throw error;
      }

      try {
        const improved = await api.improvePrompt(
          buildMakeImprovePayload(prompt, history, threadId, { messageId, category }),
          getMakeApiToken(),
        );
        applyImproveThreadId(threadId, improved);
        const improvedText = typeof improved === "string" ? improved : improved?.text || "";
        const ragStatus = typeof improved === "object" && improved ? String(improved.ragStatus || improved.rag_status || "").toLowerCase() : "";
        if (ragStatus === "no_evidence" || ragStatus === "no_evidence_found" || ragStatus === "fallback") {
          global.TtalkakMakeState.setMakeBackendState(state, "connected", "Make API 연결됨: 관련 근거 없이 기본 방식으로 다듬었습니다.");
        } else {
          global.TtalkakMakeState.setMakeBackendState(state, "connected", "Make API 연결됨: POST /api/prompts/improve 응답을 반영했습니다.");
        }
        return typeof improved === "object" && improved
          ? { ...improved, text: improvedText || polishPrompt(prompt), mode: improved.mode || "improve" }
          : { text: improvedText || polishPrompt(prompt), mode: "improve", improvedPrompt: improvedText || polishPrompt(prompt) };
      } catch (error) {
        const status = Number(error?.status || error?.payload?.status || 0);
        const code = String(error?.payload?.code || error?.code || "").toUpperCase();
        const normalizedError = global.TtalkakMakeMessageModel.classifyMakeError(error);
        let fallbackMessage = normalizedError.message;
        if (status === 404) {
          fallbackMessage = canUseDemoFallback()
            ? "요청한 프롬프트 또는 리소스를 찾지 못해 데모 첨삭을 표시합니다."
            : "요청한 프롬프트 또는 리소스를 찾지 못했습니다.";
        } else if (status === 429 && (code === "FREE_TRIAL_LIMIT_EXCEEDED" || code === "TRIAL_LIMIT_EXCEEDED")) {
          fallbackMessage = "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
        } else if (canUseDemoFallback()) {
          fallbackMessage = `${normalizedError.message} 지금은 데모 첨삭을 표시합니다.`;
        }
        global.TtalkakMakeState.setMakeBackendState(state, "fallback", canUseDemoFallback()
          ? `Make 데모 데이터 표시 중: ${fallbackMessage}`
          : getApiFailureMessage("Make 첨삭 API"));
        handleBackendAccessError(error, fallbackMessage);
        reportWarning("make-sync", "improve-prompt", error);
        if (!canUseDemoFallback()) throw error;
        const fallbackText = polishPrompt(prompt);
        return { text: fallbackText, mode: "improve", improvedPrompt: fallbackText };
      }
    }

    async function syncMakeThreadWithBackend(threadId) {
      if (!hasBackendAuthToken()) return;
      const thread = state.recentThreads.find((item) => item.id === threadId);
      if (!thread) return;
      const serverId = await createBackendMakeThread(thread);
      if (serverId) thread.serverId = serverId;
    }

    async function refreshMakeThreadsFromBackend({ shouldRender = true, quiet = false } = {}) {
      const api = getMakeApi();
      if (!api?.getMakeThreads || !hasBackendAuthToken()) return;

      try {
        const threads = await api.getMakeThreads(getMakeApiToken());
        applyMakeThreadsResult(getBackendDataEffectContext(), threads);
        if (shouldRender) render();
      } catch (error) {
        if (quiet) return;
        handleBackendAccessError(error, "최근 대화 목록을 다시 불러오지 못했습니다.");
      }
    }

    async function refreshActiveMakeThreadFromBackend(threadId = state.activeThreadId, { quiet = false, preserveScroll = false, scrollToLatest = false } = {}) {
      const api = getMakeApi();
      const backendThreadId = String(getMakeBackendThreadId(threadId) || threadId || "");
      const renderThread = () => {
        if (scrollToLatest) {
          render();
          requestAnimationFrame(() => {
            scrollToMakeLatestMessage(state, { behavior: "auto" });
          });
          return;
        }
        if (preserveScroll) {
          renderPreservingMakeScroll();
          return;
        }
        render();
      };
      if (api?.getMakeThread && hasBackendAuthToken() && isBackendNumericId(backendThreadId)) {
        try {
          const refreshedThread = await api.getMakeThread(backendThreadId, getMakeApiToken());
          if (refreshedThread?.id) {
            global.TtalkakMakeState.setMakeRecentThreads(state, [
              refreshedThread,
              ...state.recentThreads.filter((thread) => {
                const id = String(thread.id || "");
                const serverId = String(thread.serverId || "");
                return id !== String(refreshedThread.id) && serverId !== String(refreshedThread.serverId || refreshedThread.id);
              }),
            ].slice(0, 8));
            normalizeRecentThreads();
            openRecentMakeThreadState(state, refreshedThread);
            if (scrollToLatest) queueLatestMakeThreadScroll(refreshedThread);
            renderThread();
            return refreshedThread;
          }
        } catch (error) {
          if (Number(error?.status || 0) !== 404) {
            if (quiet) return null;
            handleBackendAccessError(error, "최근 대화를 다시 불러오지 못했습니다.");
          }
        }
      }

      await refreshMakeThreadsFromBackend({ shouldRender: false, quiet });
      const refreshedThread = state.recentThreads.find((thread) => {
        const id = String(thread.id || "");
        const serverId = String(thread.serverId || "");
        return Boolean(backendThreadId) && (id === backendThreadId || serverId === backendThreadId);
      });

      if (refreshedThread) {
        openRecentMakeThreadState(state, refreshedThread);
        if (scrollToLatest) queueLatestMakeThreadScroll(refreshedThread);
      }
      renderThread();
      return refreshedThread;
    }

    return Object.freeze({
      applyPendingImproveThreadId,
      createBackendMakeThread,
      ensureBackendMakeThreadId,
      getMakeBackendThreadId,
      getMakeThreadById,
      improvePromptWithBackend,
      refreshActiveMakeThreadFromBackend,
      refreshMakeThreadsFromBackend,
      shouldUseImproveThreadSync,
      syncMakeThreadWithBackend,
    });
  }

  global.TtalkakMakeServerSyncEffects = Object.freeze({
    createMakeServerSyncEffects,
  });
})(window);

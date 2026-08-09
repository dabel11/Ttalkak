(function attachMakeWorkflows(global) {
  "use strict";
  function createMakeWorkflows(ctx) {
    const { state, savedPrompts, popularPrompts, promptTemplates, executeTargets, document, window, render, renderPreservingMakeScroll, showNotice, openConfirmAction, guardAdminUserAction, findPromptById, getFinalPromptText, makePreview, copyTextToClipboard, makePromptTitle, normalizeSearchText, persistState, getMakeApi, getMakeApiToken, handleMakeBackendSyncError, getMakeThreadById, getMakeBackendThreadId, isBackendNumericId, normalizeMakeFolders, normalizeRecentThreads, hydrateBackendMakeDataIfNeeded, getMakeServerSyncEffects, getMakeServerSyncContext, getMakeControllerContext, submitMakePrompt, openAuth, deleteMakeThreadState, createLocalMakeFolderState, removeLocalMakeFolderState, restoreMakeThreadFolderState, MAX_CUSTOM_MAKE_FOLDERS, canUseDemoFallback, deleteMakeFolderState, getMakeMutationStateContext, toggleSavedMakeMessageState, updateRecentMakeThreadState, openRecentMakeThreadState, openSavedMakePromptState, startNewMakeChatState, autosizeTextarea, hasBackendAuthToken, handleBackendAccessError } = ctx;
    let templateToggleTimer = null;

    function performDeleteThreadLocal(threadId) {
      deleteMakeThreadState(state, threadId);
      showNotice("대화를 삭제했습니다.");
    }

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

    function guardMakeFolderMutation(clearSelection) {
      if (guardAdminUserAction()) {
        clearSelection?.();
        render();
        return true;
      }

      if (!state.isLoggedIn) {
        clearSelection?.();
        showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
        render();
        return true;
      }

      return false;
    }

    function normalizeMakeFolderName(name) {
      return String(name || "").trim();
    }

    function hasMakeFolderName(name) {
      return state.makeFolders.some((folder) => folder.name === name);
    }

    function createLocalMakeFolder(name) {
      return createLocalMakeFolderState(state, name);
    }

    function removeLocalMakeFolder(folderId) {
      removeLocalMakeFolderState(state, folderId);
    }

    function restoreThreadFolder(thread, folderId) {
      restoreMakeThreadFolderState(thread, folderId);
    }

    async function createMakeFolder(folderName) {
      if (guardMakeFolderMutation(() => { state.creatingFolder = false; })) return;

      if (getCustomMakeFolderCount() >= MAX_CUSTOM_MAKE_FOLDERS) {
        showNotice(`폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`);
        state.creatingFolder = false;
        render();
        return;
      }

      const cleanName = normalizeMakeFolderName(folderName);
      if (!cleanName) {
        showNotice("폴더 이름을 입력해주세요.");
        return;
      }

      if (hasMakeFolderName(cleanName)) {
        showNotice("이미 같은 이름의 폴더가 있습니다.");
        return;
      }

      const folder = createLocalMakeFolder(cleanName);
      state.activeFolderId = folder.id;
      state.creatingFolder = false;
      const backendFolderId = await createBackendMakeFolder({ name: cleanName });
      if (backendFolderId) {
        folder.serverId = backendFolderId;
      } else if (!canUseDemoFallback()) {
        removeLocalMakeFolder(folder.id);
        state.activeFolderId = "all";
        showNotice("서버 폴더 생성에 실패해 변경을 취소했습니다.");
        render();
        return;
      }
      showNotice("폴더를 추가했습니다.");
      render();
    }

    async function createMakeFolderAndMoveThread(threadId, folderName) {
      if (guardMakeFolderMutation(() => { state.creatingThreadFolderId = null; })) return;

      const thread = state.recentThreads.find((item) => item.id === threadId);
      if (!thread) return;

      if (getCustomMakeFolderCount() >= MAX_CUSTOM_MAKE_FOLDERS) {
        showNotice(`폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`);
        state.creatingThreadFolderId = null;
        render();
        return;
      }

      const cleanName = normalizeMakeFolderName(folderName);
      if (!cleanName) {
        showNotice("폴더 이름을 입력해주세요.");
        return;
      }

      if (hasMakeFolderName(cleanName)) {
        showNotice("이미 같은 이름의 폴더가 있습니다.");
        return;
      }

      const previousFolderId = thread.folderId;
      const folder = createLocalMakeFolder(cleanName);
      thread.folderId = folder.id;
      state.activeFolderId = folder.id;
      state.openThreadMenuId = null;
      state.creatingThreadFolderId = null;
      const backendFolderId = await createBackendMakeFolder({ name: cleanName });
      if (backendFolderId) {
        folder.serverId = backendFolderId;
        await moveThreadToFolderOnBackend(thread, backendFolderId);
      } else {
        console.warn("[TTALKAK] 새 폴더 서버 id가 없어 대화 이동 API는 건너뜁니다.");
        if (!canUseDemoFallback()) {
          removeLocalMakeFolder(folder.id);
          restoreThreadFolder(thread, previousFolderId);
          state.activeFolderId = thread.folderId;
          showNotice("서버 폴더 생성에 실패해 변경을 취소했습니다.");
          render();
          return;
        }
      }
      showNotice("새 폴더를 만들고 대화를 이동했습니다.");
      render();
    }

    function getCustomMakeFolderCount() {
      return state.makeFolders.filter((folder) => folder.id !== "all" && folder.id !== "uncategorized").length;
    }

    async function renameMakeFolder(folderId, name) {
      if (guardMakeFolderMutation(() => { state.editingFolderId = null; })) return;

      const folder = state.makeFolders.find((item) => item.id === folderId);
      const cleanName = normalizeMakeFolderName(name);
      if (!folder || !cleanName) return;

      state.editingFolderId = null;
      const backendUpdated = await updateBackendMakeFolderName(folderId, cleanName);
      if (!backendUpdated && !canUseDemoFallback()) {
        showNotice("폴더 이름 수정 요청에 실패했습니다.");
        render();
        return;
      }
      folder.name = cleanName;
      showNotice("폴더 이름을 수정했습니다.");
      render();
    }

    async function performDeleteFolder(folderId) {
      if (guardMakeFolderMutation()) return;

      if (!folderId || folderId === "uncategorized") return;
      const previousFolders = state.makeFolders.map((folder) => ({ ...folder }));
      const previousThreadFolders = state.recentThreads.map((thread) => ({ id: thread.id, folderId: thread.folderId }));
      const previousActiveFolderId = state.activeFolderId;
      const backendDeleted = await deleteBackendMakeFolder(folderId);
      if (!backendDeleted && !canUseDemoFallback()) {
        state.makeFolders = previousFolders;
        previousThreadFolders.forEach((previous) => {
          const thread = state.recentThreads.find((item) => item.id === previous.id);
          restoreThreadFolder(thread, previous.folderId);
        });
        state.activeFolderId = previousActiveFolderId;
        showNotice("폴더 삭제 요청에 실패했습니다.");
        render();
        return;
      }
      deleteMakeFolderState(getMakeMutationStateContext(), folderId);
      showNotice("폴더를 삭제했습니다.");
      render();
    }

    async function moveThreadToFolder(threadId, folderId) {
      if (guardMakeFolderMutation()) return;

      const thread = state.recentThreads.find((item) => item.id === threadId);
      if (!thread) return;
      const previousFolderId = thread.folderId;
      thread.folderId = folderId || "uncategorized";
      const backendMoved = await moveThreadToFolderOnBackend(thread, getBackendFolderId(thread.folderId));
      if (!backendMoved && !canUseDemoFallback()) {
        restoreThreadFolder(thread, previousFolderId);
        showNotice("대화 폴더 이동 요청에 실패해 변경을 취소했습니다.");
        render();
        return;
      }
      showNotice("대화 폴더를 변경했습니다.");
      render();
    }

    async function moveThreadToFolderOnBackend(thread, backendFolderId) {
      const api = getMakeApi();
      if (!api?.moveMakeThread) return canUseDemoFallback();

      const backendThreadId = await ensureBackendMakeThreadId(thread);
      if (!backendThreadId) {
        console.warn("[TTALKAK] 서버 대화 id가 없어 폴더 이동 API는 건너뜁니다.");
        return canUseDemoFallback();
      }

      try {
        await api.moveMakeThread(
          backendThreadId,
          { folderId: isBackendNumericId(backendFolderId) ? Number(backendFolderId) : null },
          getMakeApiToken(),
        );
        return true;
      } catch (error) {
        handleMakeBackendSyncError(
          error,
          "대화 폴더 이동 요청에 실패해 로컬 데모 상태만 유지합니다.",
          "대화 폴더 이동 요청에 실패했습니다.",
          "[TTALKAK] /api/make/threads/{id}/folder 호출에 실패했습니다.",
        );
        return false;
      }
    }

    function countThreadsInFolder(folderId) {
      return state.recentThreads.filter((thread) => getThreadFolderId(thread) === folderId).length;
    }

    function getThreadFolderId(thread) {
      return thread.folderId || "uncategorized";
    }

    function getActiveFolderName() {
      if (state.activeFolderId === "all") return "최근 대화";
      return state.makeFolders.find((folder) => folder.id === state.activeFolderId)?.name || "최근 대화";
    }

    async function copyMakeMessage(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      const finalPrompt = getFinalPromptText(message);

      await copyTextToClipboard(finalPrompt);

      state.copiedMessageId = messageId;
      showNotice("프롬프트를 복사했습니다.");
      window.setTimeout(() => {
        if (state.copiedMessageId !== messageId) return;
        state.copiedMessageId = "";
        render();
      }, 1100);
    }

    function saveMakeMessage(messageId) {
      if (guardAdminUserAction()) return;

      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      const finalPrompt = getFinalPromptText(message);
      const result = toggleSavedMakeMessageState(getMakeMutationStateContext(), message, finalPrompt);
      showNotice(result === "removed" ? "메시지 저장을 해제했습니다." : "메시지를 저장했습니다.");
      render();
    }

    async function resendEditedMessage(messageId, value) {
      return window.TtalkakMakeController.resendEdited(getMakeControllerContext(), messageId, value);
    }

    function openShareFromMakeMessage(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        showNotice("공유하려면 로그인이 필요합니다.");
        return;
      }

      const finalPrompt = getFinalPromptText(message);
      state.shareDraft = {
        promptId: `make-share-${message.id}`,
        title: makePromptTitle(message.sourcePrompt || finalPrompt),
        text: finalPrompt,
        tags: [],
      };
      state.shareError = "";
      state.route = "share";
      render();
    }

    function openExecuteModal(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      if (!confirmPlaceholderExecution(getFinalPromptText(message))) return;
      state.executeMessageId = messageId;
      state.executePromptId = null;
      renderPreservingMakeScroll();
    }

    function openPromptExecuteModal(promptId) {
      const prompt = findPromptById(promptId);
      if (!prompt) return;
      if (!confirmPlaceholderExecution(String(prompt.text || ""))) return;
      state.executePromptId = promptId;
      state.executeMessageId = null;
      renderPreservingMakeScroll();
    }

    function confirmPlaceholderExecution(text) {
      if (!hasPromptPlaceholders(text)) return true;
      return window.confirm(
        "아직 채워지지 않은 정보가 있습니다.\n\n그대로 실행하거나, 취소한 뒤 질문에 답해 더 정확하게 만들 수 있습니다.",
      );
    }

    function hasPromptPlaceholders(text) {
      return /\[[^\]\n]{1,80}\]/.test(String(text || ""));
    }

    async function executeMakeMessage(messageId, targetId) {
      const message = state.messages.find((item) => item.id === messageId);
      const prompt = findPromptById(state.executePromptId);
      const finalPrompt = message ? getFinalPromptText(message) : String(prompt?.text || "").trim();
      if (!finalPrompt) return;
      const target = getExecuteTarget(targetId);
      if (!target) return;
      const copied = await copyTextToClipboard(finalPrompt);
      const opened = window.open(target.url, "_blank", "noopener,noreferrer");

      state.executeMessageId = null;
      state.executePromptId = null;
      if (!opened) {
        showNotice(`${target.name} 팝업이 차단되었습니다. 프롬프트는 복사했으니 새 탭에서 직접 열어 붙여넣어 주세요.`);
      } else if (copied) {
        showNotice(`${target.name}로 이동합니다. 복사된 프롬프트를 입력란에 붙여넣어 실행하세요.`);
      } else {
        showNotice(`${target.name}로 이동합니다. 복사가 제한되면 Make의 Copy 버튼으로 다시 복사해주세요.`);
      }
      renderPreservingMakeScroll();
    }

    function getExecuteTarget(targetId) {
      const targets = {
        chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
        gemini: { name: "Google Gemini", url: "https://gemini.google.com/" },
        claude: { name: "Claude", url: "https://claude.ai/" },
      };

      return targets[targetId] || null;
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

    function getRecentThreadKeyFromThread(thread) {
      return thread.id || thread.dedupeKey || "";
    }

    function getRecentThreadKey(text) {
      return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function applyTemplate(templateId) {
      const template = promptTemplates.find((item) => item.id === templateId);
      if (!template) return;

      window.TtalkakMakeState.setMakeComposerDraft(state, template.prompt);
      render();
      window.setTimeout(() => {
        const textarea = document.querySelector("[data-autosize-textarea]");
        if (!textarea) return;
        textarea.focus();
        const firstBlankLine = textarea.value.split("\n").findIndex((line) => /:\s*$/.test(line));
        const lines = textarea.value.split("\n");
        const targetLineIndex = firstBlankLine >= 0 ? firstBlankLine : lines.length - 1;
        const cursorPosition = lines.slice(0, targetLineIndex + 1).join("\n").length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
        autosizeTextarea(textarea);
      }, 0);
    }

    function toggleTemplateBar(button) {
      window.clearTimeout(templateToggleTimer);

      if (state.templateCollapsed) {
        state.templateCollapsed = false;
        render();
        return;
      }

      const templateBar = button.closest(".make-template-bar");
      if (!templateBar) {
        state.templateCollapsed = true;
        render();
        return;
      }

      templateBar.classList.add("collapsing");
      button.setAttribute("aria-label", "분야 버튼 펼치기");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = "&gt;";
      templateToggleTimer = window.setTimeout(() => {
        state.templateCollapsed = true;
        render();
      }, 190);
    }

    async function createBackendMakeFolder(payload) {
      const api = getMakeApi();
      if (!api?.createMakeFolder) return "";

      try {
        const result = await api.createMakeFolder(payload, getMakeApiToken());
        return String(result?.id || result?.folderId || result?.data?.id || result?.data?.folderId || "");
      } catch (error) {
        handleMakeBackendSyncError(
          error,
          "폴더 생성 요청에 실패해 로컬 데모 폴더만 유지합니다.",
          "폴더 생성 요청에 실패했습니다.",
          "[TTALKAK] /api/make/folders 생성 호출에 실패했습니다.",
        );
        return "";
      }
    }

    async function updateBackendMakeFolderName(folderId, name) {
      const backendFolderId = getBackendFolderId(folderId);
      if (!backendFolderId) return true;

      const api = getMakeApi();
      if (!api?.updateMakeFolder) return canUseDemoFallback();

      try {
        await api.updateMakeFolder(backendFolderId, { name }, getMakeApiToken());
        return true;
      } catch (error) {
        handleMakeBackendSyncError(
          error,
          "폴더 이름 수정 요청에 실패해 로컬 데모 상태만 유지합니다.",
          "폴더 이름 수정 요청에 실패했습니다.",
          "[TTALKAK] /api/make/folders/{id} 수정 호출에 실패했습니다.",
        );
        return false;
      }
    }

    async function deleteBackendMakeFolder(folderId) {
      const backendFolderId = getBackendFolderId(folderId);
      if (!backendFolderId) return true;

      const api = getMakeApi();
      if (!api?.deleteMakeFolder) return canUseDemoFallback();

      try {
        await api.deleteMakeFolder(backendFolderId, getMakeApiToken());
        return true;
      } catch (error) {
        handleMakeBackendSyncError(
          error,
          "폴더 삭제 요청에 실패해 로컬 데모 상태만 유지합니다.",
          "폴더 삭제 요청에 실패했습니다.",
          "[TTALKAK] /api/make/folders/{id} 삭제 호출에 실패했습니다.",
        );
        return false;
      }
    }

    async function createBackendMakeThread(thread) {
      return getMakeServerSyncEffects().createBackendMakeThread(thread);
    }

    async function ensureBackendMakeThreadId(thread) {
      return getMakeServerSyncEffects().ensureBackendMakeThreadId(thread);
    }

    function getBackendFolderId(folderId) {
      if (!folderId || folderId === "all" || folderId === "uncategorized") return null;
      const folder = state.makeFolders.find((item) => item.id === folderId || item.serverId === folderId);
      const candidate = folder?.serverId || folderId;
      return isBackendNumericId(candidate) ? Number(candidate) : null;
    }

    async function syncMakeThreadWithBackend(threadId) {
      return getMakeServerSyncEffects().syncMakeThreadWithBackend(threadId);
    }

    async function refreshMakeThreadsFromBackend({ shouldRender = true, quiet = false } = {}) {
      return getMakeServerSyncEffects().refreshMakeThreadsFromBackend({ shouldRender, quiet });
    }

    async function refreshActiveMakeThreadFromBackend(threadId = state.activeThreadId, { quiet = false, preserveScroll = false, scrollToLatest = false } = {}) {
      return getMakeServerSyncEffects().refreshActiveMakeThreadFromBackend(threadId, { quiet, preserveScroll, scrollToLatest });
    }

    return Object.freeze({ performDeleteThreadLocal, performDeleteThread, guardMakeFolderMutation, normalizeMakeFolderName, hasMakeFolderName, createLocalMakeFolder, removeLocalMakeFolder, restoreThreadFolder, createMakeFolder, createMakeFolderAndMoveThread, getCustomMakeFolderCount, renameMakeFolder, performDeleteFolder, moveThreadToFolder, moveThreadToFolderOnBackend, countThreadsInFolder, getThreadFolderId, getActiveFolderName, copyMakeMessage, saveMakeMessage, resendEditedMessage, openShareFromMakeMessage, openExecuteModal, openPromptExecuteModal, confirmPlaceholderExecution, hasPromptPlaceholders, executeMakeMessage, getExecuteTarget, updateRecentThread, openRecentThread, openSavedMakePrompt, startNewChat, getRecentThreadKeyFromThread, getRecentThreadKey, applyTemplate, toggleTemplateBar, createBackendMakeFolder, updateBackendMakeFolderName, deleteBackendMakeFolder, createBackendMakeThread, ensureBackendMakeThreadId, getBackendFolderId, syncMakeThreadWithBackend, refreshMakeThreadsFromBackend, refreshActiveMakeThreadFromBackend });
  }
  const api = Object.freeze({ createMakeWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakMakeWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);

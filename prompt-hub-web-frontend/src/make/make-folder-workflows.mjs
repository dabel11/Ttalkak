"use strict";
export function createMakeFolderWorkflows(ctx) {
    const { state, render, showNotice, guardAdminUserAction, createLocalMakeFolderState, removeLocalMakeFolderState, restoreMakeThreadFolderState, MAX_CUSTOM_MAKE_FOLDERS, canUseDemoFallback, deleteMakeFolderState, getMakeMutationStateContext, getMakeApi, getMakeApiToken, isBackendNumericId, handleMakeBackendSyncError, ensureBackendMakeThreadId, reportWarning } = ctx;

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
        reportWarning("make-folders", "missing-created-folder-id", "Created folder has no server id");
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
        reportWarning("make-folders", "missing-thread-id", "Thread has no server id");
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

    function getBackendFolderId(folderId) {
      if (!folderId || folderId === "all" || folderId === "uncategorized") return null;
      const folder = state.makeFolders.find((item) => item.id === folderId || item.serverId === folderId);
      const candidate = folder?.serverId || folderId;
      return isBackendNumericId(candidate) ? Number(candidate) : null;
    }

    return Object.freeze({ guardMakeFolderMutation, normalizeMakeFolderName, hasMakeFolderName, createLocalMakeFolder, removeLocalMakeFolder, restoreThreadFolder, createMakeFolder, createMakeFolderAndMoveThread, getCustomMakeFolderCount, renameMakeFolder, performDeleteFolder, moveThreadToFolder, moveThreadToFolderOnBackend, countThreadsInFolder, getThreadFolderId, getActiveFolderName, createBackendMakeFolder, updateBackendMakeFolderName, deleteBackendMakeFolder, getBackendFolderId });
  }

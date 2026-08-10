(function attachPromptWorkflows(global) {
  "use strict";
  function createPromptWorkflows(ctx) {
    const { state, savedPrompts, popularPrompts, commentsByPrompt, render, showNotice, openAuth, openConfirmAction, findPromptById, findCommentById, findCommentContextById, guardAdminUserAction, isBackendNumericId, hasBackendAuthToken, callBackendApi, handleBackendAccessError, getAuthToken, getPromptMutationStateContext, getCommentMutationStateContext, applyPromptReportedState, applyCommentReportedState, applyEditedPromptState, makeRevisionRequestKey, removePromptByIdState, refreshBackendHomePrompts, refreshMyPageDataAfterMutation, hydrateBackendAdminDataIfNeeded, normalizeTag, parseSharedTags, stampCurrentUserOwnedPrompts, isDemoAuthToken, applyPublishedSavedPromptState, applyDeletedPromptState, applyUnsharedPromptState, SAVED_PAGE_SIZE } = ctx;

    function openReportPrompt(promptId) {
      if (!findPromptById(promptId)) return;
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        showNotice("로그인 후 신고할 수 있습니다.");
        render();
        return;
      }
      if (state.reportedPromptIds.has(promptId)) {
        showNotice("이미 신고한 프롬프트입니다.");
        return;
      }
      state.reportPromptId = promptId;
      state.reportCommentId = null;
      render();
    }

    function openReportComment(commentId) {
      if (!findCommentById(commentId)) return;
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        showNotice("로그인 후 신고할 수 있습니다.");
        render();
        return;
      }
      if (state.reportedCommentIds.has(commentId)) {
        showNotice("이미 신고한 댓글입니다.");
        return;
      }
      state.reportCommentId = commentId;
      state.reportPromptId = null;
      render();
    }

    function submitReport(type, targetId, reason) {
      if (type === "comment") {
        reportComment(targetId, reason);
        return;
      }
      reportPrompt(targetId, reason);
    }

    async function reportPrompt(promptId, reason) {
      const content = String(reason || "").trim();
      if (!content) {
        showNotice("신고 사유를 입력해주세요.");
        return;
      }

      if (isBackendNumericId(promptId) && state.backendStatus === "connected") {
        const token = getAuthToken();
        if (!token || isDemoAuthToken(token)) {
          showNotice("실제 로그인 후 프롬프트를 신고할 수 있습니다.");
          openAuth("login");
          return;
        }
        try {
          await window.TTALKAK_API?.reportPrompt?.(promptId, { reason: content }, token);
        } catch (error) {
          handleBackendAccessError(error, "신고 요청에 실패했습니다.");
          return;
        }
      }

      applyPromptReportedState(getPromptMutationStateContext(), promptId, content);
      showNotice("신고가 접수되었습니다.");
      refreshMyPageDataAfterMutation();
      render();
    }

    async function reportComment(commentId, reason) {
      const content = String(reason || "").trim();
      if (!content) {
        showNotice("댓글 신고 사유를 입력해주세요.");
        return;
      }

      const context = findCommentContextById(commentId);
      if (isBackendNumericId(commentId) && state.backendStatus === "connected") {
        const token = getAuthToken();
        if (!token || isDemoAuthToken(token)) {
          showNotice("실제 로그인 후 댓글을 신고할 수 있습니다.");
          openAuth("login");
          return;
        }
        try {
          await window.TTALKAK_API?.reportComment?.(commentId, { reason: content }, token);
        } catch (error) {
          handleBackendAccessError(error, "댓글 신고 요청에 실패했습니다.");
          return;
        }
      }

      applyCommentReportedState(getPromptMutationStateContext(), commentId, content, context);
      showNotice("댓글 신고가 접수되었습니다.");
      refreshMyPageDataAfterMutation();
      render();
    }

    function deleteOwnPrompt(promptId) {
      const prompt = findPromptById(promptId);
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        showNotice("로그인 후 본인 프롬프트만 삭제할 수 있습니다.");
        return;
      }
      if (!prompt || prompt.source !== "mine") return;

      openConfirmAction({
        type: "delete-prompt",
        targetId: promptId,
        title: "프롬프트 삭제",
        message: "이 프롬프트를 정말 삭제할까요? 삭제하면 Saved와 Home에서 모두 사라집니다.",
        confirmLabel: "삭제",
        danger: true,
      });
    }

    function unshareOwnPrompt(promptId) {
      const prompt = findPromptById(promptId);
      if (guardAdminUserAction()) return;

      if (!state.adminMode && !state.isLoggedIn) {
        state.authView = "login";
        showNotice("로그인 후 본인 프롬프트만 공유 취소할 수 있습니다.");
        return;
      }
      if (!prompt || (prompt.source !== "mine" && !state.adminMode)) return;

      openConfirmAction({
        type: "unshare-prompt",
        targetId: promptId,
        title: "공유 취소",
        message: "공유를 취소하면 Home과 검색 결과에서 이 프롬프트가 사라집니다. 계속할까요?",
        confirmLabel: "공유 취소",
        danger: false,
      });
    }

    async function publishSavedPrompt(promptId) {
      const prompt = savedPrompts.find((item) => item.id === promptId);
      if (!prompt || prompt.source !== "mine") return;
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        render();
        return;
      }

      let backendPrompt = null;
      if (isBackendNumericId(promptId) && hasBackendAuthToken() && window.TTALKAK_API?.shareExistingPrompt) {
        try {
          backendPrompt = await window.TTALKAK_API.shareExistingPrompt(promptId, getAuthToken() || undefined);
        } catch (error) {
          handleBackendAccessError(error, "공유 상태 변경 요청에 실패했습니다.");
          return;
        }
      }

      applyPublishedSavedPromptState(getCommentMutationStateContext(), prompt, backendPrompt);
      showNotice("프롬프트를 공유됨 상태로 전환했습니다.");
      render();
    }

    async function updateOwnPrompt(promptId, formData) {
      const prompt = findPromptById(promptId);
      if (!prompt || prompt.source !== "mine") return;
      if (guardAdminUserAction()) return;

      const title = String(formData.get("title") || "").trim();
      const text = String(formData.get("text") || "").trim();
      const tags = parseSharedTags(String(formData.get("tags") || ""));

      if (!title || !text) {
        showNotice("제목과 프롬프트를 입력해주세요. 해시태그는 선택 사항입니다.");
        return;
      }

      let backendPrompt = null;
      if (isBackendNumericId(promptId) && window.TTALKAK_API?.updatePrompt) {
        try {
          backendPrompt = await window.TTALKAK_API.updatePrompt(
            promptId,
            { title, text, tags },
            getAuthToken() || undefined,
          );
        } catch (error) {
          handleBackendAccessError(error, "프롬프트 수정 요청에 실패했습니다.");
          return;
        }
      }

      const nextValues = backendPrompt
        ? { ...backendPrompt, source: "mine", savedByMe: prompt.savedByMe, isShared: prompt.isShared }
        : { title, text, tags, updatedAt: Date.now() };

      applyEditedPromptState(getCommentMutationStateContext(), promptId, nextValues, makeRevisionRequestKey("prompt", promptId));
      showNotice("프롬프트를 수정했습니다.");
      await refreshMyPageDataAfterMutation();
      render();
    }

    function performDeletePrompt(promptId) {
      if (isBackendNumericId(promptId)) {
        callBackendApi("deletePrompt", promptId);
      }
      applyDeletedPromptState(
        getPromptMutationStateContext(),
        promptId,
        SAVED_PAGE_SIZE,
      );
      showNotice("\uD504\uB86C\uD504\uD2B8\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
    }

    function performUnsharePrompt(promptId) {
      const prompt = findPromptById(promptId);
      if (!prompt || prompt.source !== "mine") return;

      applyUnsharedPromptState(getCommentMutationStateContext(), promptId, prompt);
      if (isBackendNumericId(promptId)) {
        callBackendApi("unsharePrompt", promptId);
      }
      showNotice("프롬프트 공유를 취소했습니다.");
    }

    function removePromptById(list, promptId) {
      removePromptByIdState(list, promptId);
    }

    return Object.freeze({ openReportPrompt, openReportComment, submitReport, reportPrompt, reportComment, deleteOwnPrompt, unshareOwnPrompt, publishSavedPrompt, updateOwnPrompt, performDeletePrompt, performUnsharePrompt, removePromptById });
  }
  const api = Object.freeze({ createPromptWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakPromptWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);

import { classifyMakeError } from "../utils/make-message-model.mjs";

  "use strict";

  function handleBackendAccessErrorEffect(ctx, error, fallbackMessage = "요청을 처리하지 못했습니다.", options = {}) {
    const {
      clearAuthenticatedSession,
      getAuthToken,
      getBackendErrorCode,
      getBackendErrorMessage,
      isDemoAuthToken,
      showNotice,
      state,
    } = ctx;
    const status = Number(error?.status || error?.payload?.status || 0);
    const code = getBackendErrorCode(error);
    const backendMessage = getBackendErrorMessage(error);
    const normalized = classifyMakeError(error);

    if (code === "ACCOUNT_BLOCKED") {
      clearAuthenticatedSession({ keepRoute: true });
      state.authView = "login";
      showNotice(backendMessage || "차단된 계정입니다. 관리자에게 문의해주세요.");
      return true;
    }

    if (code === "SESSION_UUID_REQUIRED") {
      if (getAuthToken()) {
        clearSessionPreservingPendingGuestTransfer(clearAuthenticatedSession, state, options.recoveryPrompt);
      } else {
        state.pendingGuestThreadTransferId = state.activeThreadId || null;
        state.pendingGuestThreadTransferErrorCode = state.pendingGuestThreadTransferId ? "SESSION_UUID_REQUIRED" : "";
      }
      state.authView = "login";
      showNotice("로그인이 만료되었습니다. 다시 로그인해주세요.");
      return true;
    }

    if (normalized.kind === "guest_limit") {
      state.pendingGuestThreadTransferId = state.activeThreadId || null;
      state.pendingGuestThreadTransferErrorCode = code || "FREE_TRIAL_LIMIT_EXCEEDED";
      state.authView = "login";
      showNotice(backendMessage || normalized.message);
      return true;
    }

    if (normalized.requiresLogin) {
      return handleLoginRequired(
        ctx,
        backendMessage || normalized.message,
        fallbackMessage,
        Boolean(options.keepSession),
        options.recoveryPrompt,
      );
    }

    const domainMessage = getDomainErrorMessage(status, code);
    if (domainMessage) {
      showNotice(backendMessage || domainMessage);
      return true;
    }

    return handleNormalizedError({ backendMessage, fallbackMessage, normalized, showNotice });
  }

  function getDomainErrorMessage(status, code) {
    if (status === 403 || ["ACCESS_DENIED", "OWNER_ONLY", "ADMIN_ONLY", "ADMIN_ACCOUNT_PROTECTED"].includes(code)) return "이 작업을 수행할 권한이 없습니다.";
    if (status === 404 || code === "RESOURCE_NOT_FOUND") return "요청한 대상을 찾을 수 없습니다.";
    if (status === 400 || ["VALIDATION_FAILED", "INVALID_REQUEST", "BLOCK_REASON_REQUIRED"].includes(code)) return "입력값을 확인해주세요.";
    if (status === 409 || ["CONFLICT", "INVALID_STATE", "ACCOUNT_WITHDRAWN"].includes(code)) return "현재 상태에서는 처리할 수 없습니다.";
    return "";
  }

  function handleLoginRequired(ctx, message, fallbackMessage, keepSession, recoveryPrompt) {
    const { clearAuthenticatedSession, getAuthToken, isDemoAuthToken, showNotice, state } = ctx;
    const token = getAuthToken();
    if (keepSession) {
      showNotice(fallbackMessage || message);
      return true;
    }
    if ((!token && state.isLoggedIn) || (token && !isDemoAuthToken(token))) {
      clearSessionPreservingPendingGuestTransfer(clearAuthenticatedSession, state, recoveryPrompt);
      state.authView = "login";
    }
    showNotice(message);
    return true;
  }

  function clearSessionPreservingPendingGuestTransfer(clearAuthenticatedSession, state, recoveryPrompt) {
    const guestThread = getPendingGuestThread(state);
    const thread = guestThread || createAuthRecoveryThread(recoveryPrompt);
    const pendingErrorCode = guestThread
      ? state.pendingGuestThreadTransferErrorCode || "FREE_TRIAL_LIMIT_EXCEEDED"
      : "AUTHENTICATION_REQUIRED";
    clearAuthenticatedSession({ keepRoute: true });
    if (!thread) return;
    state.recentThreads = [thread];
    state.activeThreadId = thread.id;
    state.messages = thread.messages.map((message) => ({ ...message }));
    state.pendingGuestThreadTransferId = thread.id;
    state.pendingGuestThreadTransferErrorCode = pendingErrorCode;
    state.route = "make";
  }

  function getPendingGuestThread(state) {
    const pendingThreadId = String(state.pendingGuestThreadTransferId || "");
    if (!pendingThreadId) return null;
    const sourceThread = state.recentThreads?.find((thread) => String(thread?.id || "") === pendingThreadId);
    if (!sourceThread) return null;
    if (sourceThread.serverId || /^\d+$/.test(sourceThread.id)) return null;
    const messages = String(state.activeThreadId || "") === pendingThreadId
      ? state.messages
      : sourceThread.messages;
    return { ...sourceThread, messages: cloneMessages(messages) };
  }

  function createAuthRecoveryThread(recoveryPrompt) {
    const content = String(recoveryPrompt || "").trim();
    if (!content) return null;
    const createdAt = Date.now();
    const recoveryId = `auth-recovery-${createdAt}`;
    const recoveryMessage = {
      id: `user-${createdAt}`,
      role: "user",
      content,
      retryMode: "follow-up",
    };
    return {
      id: recoveryId,
      title: content,
      preview: content,
      createdAt,
      folderId: "uncategorized",
      messages: [recoveryMessage],
    };
  }

  function cloneMessages(messages) {
    return Array.isArray(messages) ? messages.map((message) => ({ ...message })) : [];
  }

  function handleNormalizedError({ backendMessage, fallbackMessage, normalized, showNotice }) {
    switch (normalized.kind) {
      case "network":
      case "ai":
      case "contract":
      case "rate_limit":
      case "server":
        showNotice(backendMessage || normalized.message);
        return true;
      default:
        showNotice(backendMessage || normalized.message || fallbackMessage);
        return true;
    }
  }

  const errorEffects = Object.freeze({
    handleBackendAccessErrorEffect,
  });
export { errorEffects };

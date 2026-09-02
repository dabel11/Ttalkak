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

    const domainMessage = getDomainErrorMessage(status, code);
    if (domainMessage) {
      showNotice(backendMessage || domainMessage);
      return true;
    }

    if (normalized.requiresLogin) {
      return handleLoginRequired({
        clearAuthenticatedSession,
        fallbackMessage,
        getAuthToken,
        isDemoAuthToken,
        keepSession: Boolean(options.keepSession),
        message: backendMessage || normalized.message,
        showNotice,
        state,
      });
    }

    return handleNormalizedError({ backendMessage, fallbackMessage, normalized, showNotice });
  }

  function getDomainErrorMessage(status, code) {
    if (status === 403 || ["ACCESS_DENIED", "OWNER_ONLY", "ADMIN_ONLY", "ADMIN_ACCOUNT_PROTECTED"].includes(code)) return "이 작업을 수행할 권한이 없습니다.";
    if (status === 404 || code === "RESOURCE_NOT_FOUND") return "요청한 대상을 찾을 수 없습니다.";
    if (status === 400 || ["VALIDATION_FAILED", "INVALID_REQUEST", "BLOCK_REASON_REQUIRED"].includes(code)) return "입력값을 확인해주세요.";
    if (status === 409 || ["CONFLICT", "INVALID_STATE", "ACCOUNT_WITHDRAWN"].includes(code)) return "현재 상태에서는 처리할 수 없습니다.";
    if (["FREE_TRIAL_LIMIT_EXCEEDED", "TRIAL_LIMIT_EXCEEDED"].includes(code)) return "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
    return "";
  }

  function handleLoginRequired({ clearAuthenticatedSession, fallbackMessage, getAuthToken, isDemoAuthToken, keepSession, message, showNotice, state }) {
    const token = getAuthToken();
    if (keepSession) {
      showNotice(fallbackMessage || message);
      return true;
    }
    if (!token || isDemoAuthToken(token)) {
      if (!token && state.isLoggedIn) {
        clearAuthenticatedSession({ keepRoute: true });
        state.authView = "login";
      }
      showNotice(message);
      return true;
    }
    clearAuthenticatedSession({ keepRoute: true });
    state.authView = "login";
    showNotice(message);
    return true;
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

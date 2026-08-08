(function attachErrorEffects(global) {
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
    const normalizedError = global.TtalkakMakeMessageModel?.classifyMakeError(error);
    const keepSession = Boolean(options.keepSession);

    return (
      handleBlockedAccountError({ clearAuthenticatedSession, code, backendMessage, showNotice, state }) ||
      handleAuthenticationError({
        clearAuthenticatedSession,
        code,
        backendMessage,
        fallbackMessage,
        getAuthToken,
        isDemoAuthToken,
        keepSession,
        showNotice,
        state,
        status,
      }) ||
      handleForbiddenError({ status, code, backendMessage, showNotice }) ||
      handleNotFoundError({ status, code, backendMessage, showNotice }) ||
      handleInvalidRequestError({ status, code, backendMessage, showNotice }) ||
      handleConflictError({ status, code, backendMessage, showNotice }) ||
      handleRateLimitError({ status, code, backendMessage, normalizedError, showNotice }) ||
      handleTimeoutError({ status, code, backendMessage, normalizedError, showNotice }) ||
      handleAiUnavailableError({ status, code, backendMessage, normalizedError, showNotice }) ||
      handleServerError({ status, code, backendMessage, normalizedError, showNotice }) ||
      handleFallbackBackendError({ backendMessage, fallbackMessage, showNotice })
    );
  }

  function handleBlockedAccountError({ clearAuthenticatedSession, code, backendMessage, showNotice, state }) {
    if (code !== "ACCOUNT_BLOCKED") return false;

    clearAuthenticatedSession({ keepRoute: true });
    state.authView = "login";
    showNotice(backendMessage || "차단된 계정입니다. 관리자에게 문의해주세요.");
    return true;
  }

  function handleAuthenticationError({
    clearAuthenticatedSession,
    code,
    backendMessage,
    fallbackMessage,
    getAuthToken,
    isDemoAuthToken,
    keepSession,
    showNotice,
    state,
    status,
  }) {
    if (status !== 401 && code !== "AUTHENTICATION_REQUIRED" && code !== "LOGIN_REQUIRED") return false;

    const token = getAuthToken();
    if (keepSession) {
      showNotice(fallbackMessage || "백엔드 인증이 필요한 요청입니다. 현재 화면 상태를 유지합니다.");
      return true;
    }

    if (!token || isDemoAuthToken(token)) {
      if (!token && state.isLoggedIn) {
        clearAuthenticatedSession({ keepRoute: true });
        state.authView = "login";
      }
      showNotice(backendMessage || "백엔드 인증이 필요한 요청입니다. 현재 화면 상태를 유지합니다.");
      return true;
    }

    clearAuthenticatedSession({ keepRoute: true });
    state.authView = "login";
    showNotice("로그인이 필요하거나 만료되었습니다. 다시 로그인해주세요.");
    return true;
  }

  function handleForbiddenError({ status, code, backendMessage, showNotice }) {
    if (
      status !== 403 &&
      code !== "ACCESS_DENIED" &&
      code !== "OWNER_ONLY" &&
      code !== "ADMIN_ONLY" &&
      code !== "ADMIN_ACCOUNT_PROTECTED"
    ) {
      return false;
    }

    showNotice(backendMessage || "이 작업을 수행할 권한이 없습니다.");
    return true;
  }

  function handleNotFoundError({ status, code, backendMessage, showNotice }) {
    if (status !== 404 && code !== "RESOURCE_NOT_FOUND") return false;

    showNotice(backendMessage || "요청한 대상을 찾을 수 없습니다.");
    return true;
  }

  function handleInvalidRequestError({ status, code, backendMessage, showNotice }) {
    if (status !== 400 && code !== "VALIDATION_FAILED" && code !== "INVALID_REQUEST" && code !== "BLOCK_REASON_REQUIRED") return false;

    showNotice(backendMessage || "입력값을 확인해주세요.");
    return true;
  }

  function handleConflictError({ status, code, backendMessage, showNotice }) {
    if (status !== 409 && code !== "CONFLICT" && code !== "INVALID_STATE" && code !== "ACCOUNT_WITHDRAWN") return false;

    showNotice(backendMessage || "현재 상태에서는 처리할 수 없습니다.");
    return true;
  }

  function handleRateLimitError({ status, code, backendMessage, normalizedError, showNotice }) {
    if (
      status !== 429 &&
      code !== "RATE_LIMIT_EXCEEDED" &&
      code !== "FREE_TRIAL_LIMIT_EXCEEDED" &&
      code !== "AI_RATE_LIMIT_EXCEEDED"
    ) {
      return false;
    }

    showNotice(
      backendMessage ||
        (code === "FREE_TRIAL_LIMIT_EXCEEDED"
          ? "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요."
          : code === "AI_RATE_LIMIT_EXCEEDED"
            ? normalizedError?.message
            : "요청이 많습니다. 잠시 후 다시 시도해주세요."),
    );
    return true;
  }

  function handleTimeoutError({ status, code, backendMessage, normalizedError, showNotice }) {
    if (status !== 0 && status !== 504 && code !== "REQUEST_TIMEOUT" && code !== "AI_TIMEOUT") return false;

    showNotice(backendMessage || normalizedError?.message);
    return true;
  }

  function handleAiUnavailableError({ status, code, backendMessage, normalizedError, showNotice }) {
    if (status !== 503 && code !== "AI_SERVICE_UNAVAILABLE") return false;

    showNotice(backendMessage || normalizedError?.message);
    return true;
  }

  function handleServerError({ status, code, backendMessage, normalizedError, showNotice }) {
    if (status < 500 && code !== "INTERNAL_SERVER_ERROR") return false;

    showNotice(backendMessage || normalizedError?.message);
    return true;
  }

  function handleFallbackBackendError({ backendMessage, fallbackMessage, showNotice }) {
    if (!backendMessage && !fallbackMessage) return false;

    showNotice(backendMessage || fallbackMessage);
    return true;
  }

  global.TtalkakErrorEffects = Object.freeze({
    ...(global.TtalkakErrorEffects || {}),
    handleBackendAccessErrorEffect,
  });
})(window);

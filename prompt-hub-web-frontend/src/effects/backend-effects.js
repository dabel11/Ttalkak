(function attachBackendEffects(global) {
  "use strict";

  function getBackendErrorCode(error) {
    return String(error?.payload?.code || error?.code || "").trim().toUpperCase();
  }

  function getBackendErrorCodeMessage(code) {
    switch (String(code || "").trim().toUpperCase()) {
      case "AUTHENTICATION_REQUIRED":
      case "LOGIN_REQUIRED":
        return "로그인이 필요하거나 인증이 만료되었습니다.";
      case "ACCESS_DENIED":
        return "이 작업을 수행할 권한이 없습니다.";
      case "OWNER_ONLY":
        return "작성자만 수행할 수 있는 작업입니다.";
      case "ADMIN_ONLY":
        return "관리자 권한이 필요합니다.";
      case "ACCOUNT_BLOCKED":
        return "차단된 계정입니다. 관리자에게 문의해주세요.";
      case "ACCOUNT_WITHDRAWN":
        return "탈퇴한 계정입니다.";
      case "ADMIN_ACCOUNT_PROTECTED":
        return "관리자 계정에는 수행할 수 없는 작업입니다.";
      case "BLOCK_REASON_REQUIRED":
        return "차단 사유가 필요합니다.";
      case "RESOURCE_NOT_FOUND":
        return "요청한 대상을 찾을 수 없습니다.";
      case "VALIDATION_FAILED":
      case "INVALID_REQUEST":
        return "입력값을 확인해주세요.";
      case "CONFLICT":
        return "이미 처리되었거나 중복된 요청입니다.";
      case "INVALID_STATE":
        return "현재 상태에서는 처리할 수 없습니다.";
      case "REQUEST_TIMEOUT":
      case "AI_TIMEOUT":
        return "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
      case "AI_SERVICE_UNAVAILABLE":
        return "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
      case "INTERNAL_SERVER_ERROR":
        return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      case "RATE_LIMIT_EXCEEDED":
        return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
      case "FREE_TRIAL_LIMIT_EXCEEDED":
        return "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
      case "REVISION_REQUEST_NOT_EDITABLE":
        return "현재 상태에서는 수정 요청 사유를 변경할 수 없습니다.";
      case "AUTHOR_REVISION_REQUEST_ALREADY_ACTIVE":
        return "이미 처리 중인 수정 요청이 있습니다.";
      default:
        return "";
    }
  }

  function getBackendErrorMessage(error) {
    const payload = error?.payload;
    const codeMessage = getBackendErrorCodeMessage(getBackendErrorCode(error));
    return String(
      payload?.message ||
        codeMessage ||
        payload?.error ||
        payload?.code ||
        error?.message ||
        "",
    ).trim();
  }

  global.TtalkakBackendEffects = Object.freeze({
    ...(global.TtalkakBackendEffects || {}),
    getBackendErrorCode,
    getBackendErrorCodeMessage,
    getBackendErrorMessage,
  });
})(window);

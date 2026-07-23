export function isAuthExpiredError(error) {
  const status = Number(error?.status || error?.payload?.status || 0);
  const code = String(error?.code || error?.payload?.code || "").toUpperCase();
  return status === 401 || code === "LOGIN_REQUIRED" || code === "AUTHENTICATION_REQUIRED" || code === "ACCOUNT_BLOCKED";
}

export function getApiErrorMessage(status, body) {
  const code = String(body?.code || "").toUpperCase();

  if (code === "ACCOUNT_BLOCKED") return body?.message || "차단된 계정입니다. 관리자에게 문의해주세요.";
  if (code === "THREAD_ID_REQUIRED") return body?.message || "대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.";
  if (code === "THREAD_NOT_FOUND") return body?.message || "이미 삭제되었거나 접근할 수 없는 대화입니다.";
  if (code === "MESSAGE_NOT_FOUND") return body?.message || "수정할 메시지를 찾을 수 없습니다. 대화를 다시 불러와 주세요.";
  if (code === "MESSAGE_NOT_EDITABLE") return body?.message || "수정할 수 없는 메시지입니다. 사용자 메시지만 수정할 수 있습니다.";
  if (code === "REQUEST_TIMEOUT" || code === "AI_TIMEOUT") {
    return body?.message || "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "AI_INVALID_RESPONSE") {
    return body?.message || "AI 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "AI_SERVICE_UNAVAILABLE") {
    return body?.message || "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "AI_RATE_LIMIT_EXCEEDED") {
    return body?.message || "AI 서비스 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "FREE_TRIAL_LIMIT_EXCEEDED") {
    return body?.message || "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
  }
  if (code === "RATE_LIMIT_EXCEEDED") return body?.message || "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  if (status === 400) return body?.message || "요청 내용을 확인해주세요.";
  if (status === 401 || code === "LOGIN_REQUIRED") return body?.message || "로그인이 필요하거나 세션이 만료되었습니다.";
  if (status === 403) return body?.message || "이 작업을 수행할 권한이 없습니다.";
  if (status === 404) return body?.message || "요청한 데이터를 찾을 수 없습니다.";
  if (status === 409) return body?.message || "이미 처리 중인 요청이 있습니다.";
  if (status === 429) return body?.message || "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  if (status === 503) return body?.message || "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
  if (status === 504) return body?.message || "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  if (status >= 500) return body?.message || "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  return body?.message || `요청 처리 중 오류가 발생했습니다. (${status})`;
}

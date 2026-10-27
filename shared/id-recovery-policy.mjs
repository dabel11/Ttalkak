export const ID_RECOVERY_ACCEPTED_NOTICE =
  "입력한 정보와 일치하는 계정이 있으면 등록된 이메일로 아이디 안내를 보내드립니다. Google로 가입한 경우 Google 로그인을 이용해 주세요.";

export const ID_RECOVERY_HELP =
  "이름과 가입할 때 등록한 이메일을 입력해 주세요. 결과는 이메일로 안내됩니다.";

export const ID_RECOVERY_GOOGLE_NOTICE =
  "Google로 가입한 경우 Google 로그인을 이용해 주세요.";

export const ID_RECOVERY_INVALID_INPUT_NOTICE = "이름과 이메일을 확인해주세요.";
export const ID_RECOVERY_RATE_LIMIT_NOTICE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
export const ID_RECOVERY_UNAVAILABLE_NOTICE =
  "아이디 안내 메일 서비스를 현재 사용할 수 없습니다. 잠시 후 다시 시도해주세요.";
export const ID_RECOVERY_FAILURE_NOTICE =
  "아이디 안내 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";

export function getIdRecoveryErrorMessage(error = {}) {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : {};
  const status = Number(error?.status || payload.status || 0);
  const code = String(error?.code || payload.code || "").trim().toUpperCase();
  if (status === 400 || code === "INVALID_REQUEST") return ID_RECOVERY_INVALID_INPUT_NOTICE;
  if (status === 429 || code === "AUTH_RATE_LIMITED") return ID_RECOVERY_RATE_LIMIT_NOTICE;
  if (status === 503 || code === "PASSWORD_RESET_UNAVAILABLE") return ID_RECOVERY_UNAVAILABLE_NOTICE;
  return ID_RECOVERY_FAILURE_NOTICE;
}

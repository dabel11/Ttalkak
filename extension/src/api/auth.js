import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";

function normalizeAuthSession(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const user = data.user || {};
  const accessToken = String(data.accessToken || data.token || data.authToken || data.jwt || "").trim();
  if (!accessToken) throw new Error("로그인 응답에 accessToken이 없습니다.");

  const normalizedUser = {
    id: user.id ?? null,
    userId: user.userId || "",
    nickname: user.nickname || user.name || user.userId || "사용자",
    role: String(user.role || "user").toLowerCase(),
  };

  return {
    accessToken,
    user: normalizedUser,
    displayName: normalizedUser.nickname || normalizedUser.userId || "사용자",
  };
}

export async function requestLogin(config, credentials) {
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return normalizeAuthSession(responseBody);
}

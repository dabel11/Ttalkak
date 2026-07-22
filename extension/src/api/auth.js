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

async function requestJson(config, path, { method = "POST", body, accessToken } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return responseBody;
}

export async function requestLogin(config, credentials) {
  const responseBody = await requestJson(config, "/api/auth/login", { body: credentials });
  return normalizeAuthSession(responseBody);
}

export async function requestSignup(config, payload) {
  const responseBody = await requestJson(config, "/api/auth/signup", { body: payload });
  return normalizeAuthSession(responseBody);
}

export async function requestFindId(config, payload) {
  return requestJson(config, "/api/auth/find-id", { body: payload });
}

export async function requestPasswordReset(config, payload) {
  return requestJson(config, "/api/auth/password-reset/request", { body: payload });
}

export async function requestWithdrawAccount(config, payload, accessToken) {
  return requestJson(config, "/api/auth/withdraw", {
    method: "DELETE",
    body: payload,
    accessToken,
  });
}

export async function requestCheckUserId(config, userId) {
  const query = new URLSearchParams({ userId });
  return requestJson(config, `/api/auth/check-user-id?${query.toString()}`, { method: "GET" });
}

export async function requestCheckNickname(config, nickname) {
  const query = new URLSearchParams({ nickname });
  return requestJson(config, `/api/auth/check-nickname?${query.toString()}`, { method: "GET" });
}

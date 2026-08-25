import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";
import { migrateMakeMessage } from "../../../shared/make-message-model.js";

function unwrapItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeMakeMessage(item, index = 0) {
  return migrateMakeMessage({ ...item, id: item?.id || item?.messageId || `server-message-${index}`, sourcePrompt: item?.sourcePrompt || item?.originalPrompt || item?.prompt || "", saved: Boolean(item?.saved || item?.isSaved), raw: item }, index);
}

export function normalizeMakeThread(item, index = 0) {
  const messages = unwrapItems(item?.messages || item?.chatMessages || item?.conversation).map(normalizeMakeMessage);
  const serverId = item?.id || item?.threadId || item?.conversationId || "";
  const lastMessage = messages[messages.length - 1];
  const firstUserMessage = messages.find((message) => message.role === "user");
  return {
    id: String(serverId || `server-thread-${index}`),
    serverId: serverId ? String(serverId) : "",
    title: String(item?.title || item?.name || firstUserMessage?.content || "대화").trim(),
    preview: String(item?.preview || item?.summary || lastMessage?.content || "").trim(),
    time: item?.updatedAt || item?.createdAt ? "서버 동기화" : "최근",
    messages,
    raw: item,
  };
}

async function parseResponse(res) {
  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    /** @type {Error & { status?: number, code?: string, payload?: any }} */
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }
  return responseBody;
}

export async function requestMakeThreads(config, accessToken, options = {}) {
  if (!accessToken) return [];
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/make/threads`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: options.signal,
  });
  const responseBody = await parseResponse(res);
  return unwrapItems(responseBody).map(normalizeMakeThread);
}

export async function requestMakeThread(config, threadId, accessToken, options = {}) {
  if (!accessToken || !threadId) return null;
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/make/threads/${threadId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: options.signal,
  });
  const responseBody = await parseResponse(res);
  return normalizeMakeThread(responseBody?.data || responseBody);
}

export async function createMakeThread(config, payload, accessToken) {
  if (!accessToken) return null;
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/make/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await parseResponse(res);
  return normalizeMakeThread(responseBody?.data || responseBody);
}

export async function deleteMakeThread(config, threadId, accessToken) {
  if (!accessToken || !threadId) return;
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/make/threads/${threadId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await parseResponse(res);
}

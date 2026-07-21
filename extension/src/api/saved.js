import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";

function unwrapItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag : tag?.name || tag?.tagName || tag?.label || ""))
    .map((tag) => String(tag).replace(/^#+/, "").trim())
    .filter(Boolean);
}

function normalizeSavedPrompt(item, index = 0) {
  const rawText = item?.text || item?.prompt || item?.content || item?.body || item?.description || "";
  const content = String(rawText || item?.title || "").trim();
  const title = String(item?.title || item?.name || content.split(/\n/)[0] || "저장한 프롬프트").trim();
  const promptId = String(item?.promptId || item?.prompt_id || item?.prompt?.id || item?.postId || item?.id || "");
  const id = String(item?.id || promptId || item?.uuid || `server-saved-${index}`);

  return {
    id,
    serverId: promptId || id,
    promptId: promptId || id,
    title,
    preview: String(item?.preview || content).replace(/\s+/g, " ").trim().slice(0, 80),
    content,
    executablePrompt: content,
    sourcePrompt: content,
    source: "server-saved",
    tags: normalizeTags(item?.tags || item?.hashtags || item?.hashTags || item?.tagNames),
    savedByMe: true,
    raw: item,
  };
}

export async function requestSavedPrompts(config, { accessToken, filter = "all", page = 1, size = 50 } = {}) {
  if (!accessToken) return [];
  const query = new URLSearchParams({ filter, page: String(page), size: String(size), pageSize: String(size) });
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/prompts/my?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return unwrapItems(responseBody).map(normalizeSavedPrompt);
}

export function getPromptSaveId(item) {
  const rawId = String(
    item?.promptId || item?.serverId || item?.raw?.promptId || item?.raw?.prompt_id || item?.raw?.prompt?.id || item?.raw?.postId || item?.raw?.id || item?.id || ""
  );
  if (!rawId || rawId.startsWith("library-") || rawId.startsWith("saved-") || rawId.startsWith("assistant-")) return "";
  return rawId;
}

async function requestPromptSaveState(config, promptId, accessToken, method) {
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/prompts/${encodeURIComponent(promptId)}/save`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
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

export function savePrompt(config, promptId, accessToken) {
  return requestPromptSaveState(config, promptId, accessToken, "POST");
}

export function unsavePrompt(config, promptId, accessToken) {
  return requestPromptSaveState(config, promptId, accessToken, "DELETE");
}

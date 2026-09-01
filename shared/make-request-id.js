import { MAKE_ERROR_CODES, MAKE_REQUEST_ID_MAX_LENGTH } from "./make-api-contract.js";

const MAX_REQUEST_ID_LENGTH = MAKE_REQUEST_ID_MAX_LENGTH;

function normalizeText(value) {
  // The backend trims the submitted prompt but otherwise compares it exactly.
  // Reusing an id after collapsing whitespace or Unicode normalization would
  // therefore turn an edited request into REQUEST_ID_REUSED.
  return String(value || "").trim();
}

export function normalizeMakeRequestId(value) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= MAX_REQUEST_ID_LENGTH ? normalized : "";
}

export function createMakeRequestId(cryptoApi = globalThis.crypto) {
  const uuid = cryptoApi?.randomUUID?.();
  if (uuid) return normalizeMakeRequestId(uuid);
  const random = cryptoApi?.getRandomValues?.(new Uint32Array(4));
  const entropy = random ? [...random].map((value) => value.toString(36)).join("") : Math.random().toString(36).slice(2);
  return `make-${Date.now().toString(36)}-${entropy}`.slice(0, MAX_REQUEST_ID_LENGTH);
}

/** @param {{ previousRequestId?: unknown, previousPrompt?: unknown, prompt?: unknown, cryptoApi?: Crypto }} [options] */
export function resolveMakeRequestId({ previousRequestId = "", previousPrompt = "", prompt = "", cryptoApi } = {}) {
  const reusable = normalizeMakeRequestId(previousRequestId);
  if (reusable && normalizeText(previousPrompt) === normalizeText(prompt)) return reusable;
  return createMakeRequestId(cryptoApi);
}

export function isRequestIdReusedError(error) {
  return String(error?.payload?.code || error?.code || "").trim().toUpperCase() === MAKE_ERROR_CODES.requestIdReused;
}

export function isThreadConcurrencyError(error) {
  return String(error?.payload?.code || error?.code || "").trim().toUpperCase() === MAKE_ERROR_CODES.threadConcurrentlyUpdated;
}

export function createMakeRequestCorrelation(value) {
  const requestId = normalizeMakeRequestId(value);
  if (!requestId) return "";
  let hash = 0x811c9dc5;
  for (let index = 0; index < requestId.length; index += 1) {
    hash ^= requestId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `req_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export { MAX_REQUEST_ID_LENGTH };

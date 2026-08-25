// GENERATED FILE. Edit shared/make-request-id.js and run node scripts/build-make-message-model.cjs.
const MAX_REQUEST_ID_LENGTH = 128;

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
  return String(error?.payload?.code || error?.code || "").trim().toUpperCase() === "REQUEST_ID_REUSED";
}

export { MAX_REQUEST_ID_LENGTH };

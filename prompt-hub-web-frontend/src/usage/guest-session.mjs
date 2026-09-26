const GUEST_SESSION_STORAGE_KEY = "ttalkak_guest_session_uuid_v1";
const GUEST_SESSION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

let memorySessionUuid = "";

function isValidGuestSessionUuid(value) {
  return GUEST_SESSION_PATTERN.test(String(value || "").trim());
}

function createSessionUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch (_error) {
    return null;
  }
}

function getOrCreateGuestSessionUuid(storage) {
  const resolvedStorage = storage === undefined ? getDefaultStorage() : storage;
  try {
    const existing = String(resolvedStorage?.getItem(GUEST_SESSION_STORAGE_KEY) || "").trim();
    if (isValidGuestSessionUuid(existing)) {
      memorySessionUuid = existing;
      return existing;
    }
  } catch (_error) {
    // Continue with the in-memory fallback when browser storage is unavailable.
  }

  if (!isValidGuestSessionUuid(memorySessionUuid)) memorySessionUuid = createSessionUuid();
  try {
    resolvedStorage?.setItem(GUEST_SESSION_STORAGE_KEY, memorySessionUuid);
  } catch (_error) {
    // The module-level value keeps the identifier stable for this page session.
  }
  return memorySessionUuid;
}

export {
  GUEST_SESSION_STORAGE_KEY,
  createSessionUuid,
  getOrCreateGuestSessionUuid,
  isValidGuestSessionUuid,
};

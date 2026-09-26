const GUEST_SESSION_STORAGE_KEY = "ttalkak_guest_session_uuid_v1";

function createSessionUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getOrCreateGuestSessionUuid(storage = globalThis.localStorage) {
  try {
    const existing = String(storage?.getItem(GUEST_SESSION_STORAGE_KEY) || "").trim();
    if (existing) return existing;
    const uuid = createSessionUuid();
    storage?.setItem(GUEST_SESSION_STORAGE_KEY, uuid);
    return uuid;
  } catch (_error) {
    return createSessionUuid();
  }
}

export { GUEST_SESSION_STORAGE_KEY, createSessionUuid, getOrCreateGuestSessionUuid };

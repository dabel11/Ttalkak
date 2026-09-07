import { STORAGE } from "../constants";

export function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getChromeLocalStorage() {
  return window.chrome?.storage?.local || null;
}

export async function loadExtensionStorage(key, fallback) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) return loadStorage(key, fallback);

  return new Promise((resolve) => {
    chromeStorage.get([key], (result) => {
      if (window.chrome?.runtime?.lastError) {
        resolve(fallback);
        return;
      }
      resolve(result?.[key] ?? fallback);
    });
  });
}

export async function saveExtensionStorage(key, value) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) {
    saveStorage(key, value);
    return;
  }

  await new Promise((resolve) => chromeStorage.set({ [key]: value }, () => resolve(undefined)));
}

export async function removeExtensionStorage(key) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) {
    try {
      localStorage.removeItem(key);
    } catch {}
    return;
  }

  await new Promise((resolve) => chromeStorage.remove([key], () => resolve(undefined)));
}

function createSessionUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const randomPart = Array.from(window.crypto?.getRandomValues?.(new Uint8Array(16)) || [])
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `session-${Date.now()}-${randomPart || Math.random().toString(36).slice(2)}`;
}

export async function getOrCreateSessionUuid() {
  const existing = await loadExtensionStorage(STORAGE.SESSION_UUID, "");
  if (existing) return existing;
  const sessionUuid = createSessionUuid();
  await saveExtensionStorage(STORAGE.SESSION_UUID, sessionUuid);
  return sessionUuid;
}

import { DEFAULT_RAG_CONFIG, STORAGE } from "../constants";
import { loadStorage } from "../storage/extensionStorage";

export function normalizeBackendConfig(config = {}) {
  return {
    backendApiUrl: config.backendApiUrl || DEFAULT_RAG_CONFIG.backendApiUrl,
  };
}

export function loadBackendConfig() {
  const devConfig = import.meta.env.DEV ? loadStorage(STORAGE.CONFIG, null) || loadStorage(STORAGE.LEGACY_CONFIG, null) : null;
  return normalizeBackendConfig(devConfig || DEFAULT_RAG_CONFIG);
}

export function makeTitle(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "새 프롬프트";
  return t.length > 20 ? `${t.slice(0, 20)}...` : t;
}

export function makePreview(text = "") {
  const p = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return p.length > 44 ? `${p.slice(0, 44)}...` : p;
}

export function promptMatches(item, query) {
  const q = query.trim().replace(/^#/, "").toLowerCase();
  if (!q) return true;
  return `${item.title} ${item.preview} ${item.content || ""} ${(item.tags || []).join(" ")}`
    .toLowerCase()
    .includes(q);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

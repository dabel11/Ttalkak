import { DEFAULT_RAG_CONFIG, STORAGE } from "../constants";
import { loadStorage } from "../storage/extensionStorage";

export function normalizeBackendConfig(config = {}) {
  const legacyUrl = config.serverUrl && !String(config.serverUrl).includes(":8000") ? config.serverUrl : "";
  return {
    ...DEFAULT_RAG_CONFIG,
    ...config,
    backendApiUrl: config.backendApiUrl || legacyUrl || DEFAULT_RAG_CONFIG.backendApiUrl,
  };
}

export function loadBackendConfig() {
  const stored = loadStorage(STORAGE.CONFIG, null);
  const legacy = stored ? null : loadStorage(STORAGE.LEGACY_CONFIG, null);
  return normalizeBackendConfig(stored || legacy || DEFAULT_RAG_CONFIG);
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

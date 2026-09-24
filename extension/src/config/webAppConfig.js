const DEVELOPMENT_WEB_APP_URL = "http://127.0.0.1:4200";

function cleanUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getWebAppUrl() {
  const configured = cleanUrl(import.meta.env?.VITE_WEB_APP_URL);
  if (configured) return configured;
  return import.meta.env?.DEV ? DEVELOPMENT_WEB_APP_URL : "";
}

export async function openWebPricingPage() {
  const baseUrl = getWebAppUrl();
  if (!baseUrl) throw new Error("웹 서비스 주소가 설정되지 않았습니다.");
  const url = `${baseUrl}/#/pricing`;
  if (globalThis.chrome?.tabs?.create) {
    await globalThis.chrome.tabs.create({ url });
    return;
  }
  globalThis.open?.(url, "_blank", "noopener,noreferrer");
}

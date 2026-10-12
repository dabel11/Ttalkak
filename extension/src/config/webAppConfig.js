const DEVELOPMENT_WEB_APP_URL = "http://localhost:4200";

function cleanUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getDefaultWebAppUrl() {
  const configuredUrl = cleanUrl(import.meta.env?.VITE_WEB_APP_URL);
  if (configuredUrl) return configuredUrl;
  return import.meta.env?.DEV ? DEVELOPMENT_WEB_APP_URL : "";
}

export function getBillingPageUrl(webAppUrl = getDefaultWebAppUrl()) {
  const url = new URL(cleanUrl(webAppUrl));
  url.pathname = "/pricing";
  url.searchParams.delete("openBilling");
  url.hash = "";
  return url.toString();
}

export async function openBillingPage(webAppUrl = getDefaultWebAppUrl()) {
  if (!webAppUrl) throw new Error("웹 서비스 주소가 설정되지 않았습니다.");
  const url = getBillingPageUrl(webAppUrl);
  if (globalThis.chrome?.tabs?.create) return globalThis.chrome.tabs.create({ url });
  globalThis.open?.(url, "_blank", "noopener,noreferrer");
  return undefined;
}

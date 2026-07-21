const DEVELOPMENT_BACKEND_API_URL = "http://localhost:8080";

function cleanUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getDefaultBackendApiUrl() {
  const configuredUrl = cleanUrl(import.meta.env.VITE_BACKEND_API_URL);
  if (configuredUrl) return configuredUrl;
  return import.meta.env.DEV ? DEVELOPMENT_BACKEND_API_URL : "";
}

export function assertBackendApiUrl(url) {
  const backendApiUrl = cleanUrl(url);
  if (!backendApiUrl) {
    throw new Error("Backend API URL이 설정되지 않았습니다. 운영 빌드에는 VITE_BACKEND_API_URL을 설정해주세요.");
  }
  return backendApiUrl;
}

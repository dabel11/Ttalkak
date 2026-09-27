export function isReservedProductionHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase().replace(/\.+$/, "");
  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    /(^|\.)example\.(com|org|net)$/i.test(normalized)
  );
}

export function assertProductionBackendApiUrl(mode, backendApiUrl, isVerificationBuild) {
  if (mode !== "production") return;
  const normalizedUrl = String(backendApiUrl || "").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    parsedUrl = null;
  }
  const hostname = parsedUrl?.hostname.toLowerCase() || "";
  const isAllowedVerificationHost = isVerificationBuild && hostname === "api.example.invalid";
  if (
    !normalizedUrl ||
    parsedUrl?.protocol !== "https:" ||
    normalizedUrl.includes("SPRING_BOOT_PRODUCTION_HOST") ||
    (isReservedProductionHostname(hostname) && !isAllowedVerificationHost)
  ) {
    throw new Error("Production extension builds require VITE_BACKEND_API_URL to be set to the Spring Boot HTTPS URL.");
  }
}

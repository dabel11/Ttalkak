import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertProductionBackendApiUrl } from "./build-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

export function validateReleaseConfiguration(env = process.env) {
  const extensionId = String(env.TTALKAK_PRODUCTION_EXTENSION_ID || "").trim();
  const backendApiUrl = String(env.VITE_BACKEND_API_URL || "").trim();
  const supportUrl = String(env.TTALKAK_SUPPORT_URL || "").trim();
  const privacyPolicyUrl = String(env.TTALKAK_PRIVACY_POLICY_URL || "").trim();
  const releaseOwner = String(env.TTALKAK_RELEASE_OWNER || "").trim();
  if (!EXTENSION_ID_PATTERN.test(extensionId)) throw new Error("TTALKAK_PRODUCTION_EXTENSION_ID must be the 32-character Chrome Web Store ID.");
  assertProductionBackendApiUrl("production", backendApiUrl, false);
  for (const [name, value] of [["TTALKAK_PRIVACY_POLICY_URL", privacyPolicyUrl], ["TTALKAK_SUPPORT_URL", supportUrl]]) {
    let hostname = "";
    try { hostname = new URL(value).hostname.replace(/\.$/, "").toLowerCase(); } catch { /* handled below */ }
    if (!/^https:\/\//i.test(value) || !hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".test") || hostname.endsWith(".invalid") || /^127\./.test(hostname)) {
      throw new Error(`${name} must be a public HTTPS URL.`);
    }
  }
  if (!releaseOwner) throw new Error("TTALKAK_RELEASE_OWNER is required.");
  return { backendApiUrl, extensionId, origin: `chrome-extension://${extensionId}`, privacyPolicyUrl, releaseOwner, supportUrl };
}

export function validateProductionArtifact(config, distDir = path.join(root, "dist-prod")) {
  const manifestPath = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("dist-prod/manifest.json is missing. Run npm run build:prod first.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.key) throw new Error("Production manifest must not contain the development public key.");
  const expectedHost = `${new URL(config.backendApiUrl).origin}/*`;
  if (!manifest.host_permissions?.includes(expectedHost)) throw new Error(`Production manifest is missing ${expectedHost}.`);
  const serialized = JSON.stringify(manifest);
  if (/localhost|127\.0\.0\.1|\.test|\.invalid|example\.(?:com|org|net)/i.test(serialized)) throw new Error("Production manifest contains a reserved development host.");
  return manifest;
}

export async function verifyCors(config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${config.backendApiUrl.replace(/\/$/, "")}/api/prompts/improve`, {
    method: "OPTIONS",
    headers: {
      Origin: config.origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const allowMethods = response.headers.get("access-control-allow-methods") || "";
  const allowHeaders = response.headers.get("access-control-allow-headers") || "";
  const allowCredentials = response.headers.get("access-control-allow-credentials");
  if (!response.ok || allowOrigin !== config.origin) throw new Error(`CORS preflight rejected ${config.origin}.`);
  if (!/\bPOST\b/i.test(allowMethods) || !/authorization/i.test(allowHeaders) || !/content-type/i.test(allowHeaders)) throw new Error("CORS preflight does not allow the required method and headers.");
  if (String(allowCredentials).toLowerCase() !== "true") throw new Error("CORS preflight must allow credentials.");
}

export async function verifyPublicPages(config, fetchImpl = globalThis.fetch) {
  for (const [label, url] of [["privacy policy", config.privacyPolicyUrl], ["support", config.supportUrl]]) {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow" });
    if (!response.ok) throw new Error(`Public ${label} URL returned HTTP ${response.status}.`);
  }
}

async function main() {
  const config = validateReleaseConfiguration();
  validateProductionArtifact(config);
  await verifyCors(config);
  await verifyPublicPages(config);
  console.log("Extension release gate passed: configuration, artifact, and CORS are ready.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => { console.error(`Extension release gate failed: ${error.message}`); process.exitCode = 1; });
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kind = process.argv[2];
if (!new Set(["dev", "prod", "verify"]).has(kind)) {
  throw new Error("Usage: node scripts/build-extension.mjs <dev|prod|verify>");
}

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = path.resolve(extensionRoot, "node_modules", "vite", "bin", "vite.js");
const mode = kind === "dev" ? "development" : "production";
const backendApiUrl =
  kind === "dev"
    ? "http://localhost:8080"
    : process.env.VITE_BACKEND_API_URL || (kind === "verify" ? "https://api.example.invalid" : "");

const result = spawnSync(process.execPath, [viteEntry, "build", "--mode", mode], {
  cwd: extensionRoot,
  env: {
    ...process.env,
    TTALKAK_EXTENSION_BUILD_KIND: kind,
    VITE_BACKEND_API_URL: backendApiUrl,
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else if (kind === "verify") {
  const manifestPath = path.resolve(extensionRoot, "dist-verify", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    throw new Error("Verification output must not contain manifest.json.");
  }
}

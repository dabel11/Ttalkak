import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function toHostPermission(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return "https://SPRING_BOOT_PRODUCTION_HOST/*";
  }
}

function assertProductionBackendApiUrl(mode, backendApiUrl) {
  if (mode !== "production") return;
  const normalizedUrl = String(backendApiUrl || "").trim();
  if (!normalizedUrl || normalizedUrl.includes("SPRING_BOOT_PRODUCTION_HOST")) {
    throw new Error("Production extension builds require VITE_BACKEND_API_URL to be set to the Spring Boot HTTPS URL.");
  }
}

function extensionManifestPlugin(mode, backendApiUrl) {
  assertProductionBackendApiUrl(mode, backendApiUrl);
  return {
    name: "ttalkak-extension-manifest",
    closeBundle() {
      const root = process.cwd();
      const sourcePath =
        mode === "production"
          ? path.resolve(root, "manifest.production.example.json")
          : path.resolve(root, "public", "manifest.json");
      const outPath = path.resolve(root, "dist", "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

      if (mode === "production") {
        const productionHost = toHostPermission(backendApiUrl);
        manifest.host_permissions = manifest.host_permissions.map((permission) =>
          permission === "https://SPRING_BOOT_PRODUCTION_HOST/*" ? productionHost : permission
        );
      }

      fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), extensionManifestPlugin(mode, env.VITE_BACKEND_API_URL || "")],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});

import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { assertProductionBackendApiUrl } from "./scripts/build-policy.mjs";

function toHostPermission(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return "https://SPRING_BOOT_PRODUCTION_HOST/*";
  }
}

function extensionManifestPlugin(mode, backendApiUrl, outDir, isVerificationBuild) {
  assertProductionBackendApiUrl(mode, backendApiUrl, isVerificationBuild);
  return {
    name: "ttalkak-extension-manifest",
    closeBundle() {
      const root = process.cwd();
      const sourcePath =
        mode === "production"
          ? path.resolve(root, "manifest.production.example.json")
          : path.resolve(root, "public", "manifest.json");
      const outPath = path.resolve(root, outDir, "manifest.json");
      if (isVerificationBuild) {
        fs.rmSync(outPath, { force: true });
        return;
      }
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
  const isVerificationBuild = process.env.TTALKAK_EXTENSION_BUILD_KIND === "verify";
  const outDir = isVerificationBuild ? "dist-verify" : mode === "production" ? "dist-prod" : "dist-dev";
  const backendApiUrl =
    mode === "development"
      ? env.VITE_BACKEND_API_URL || "http://localhost:8080"
      : process.env.VITE_BACKEND_API_URL || env.VITE_BACKEND_API_URL || "";
  return {
    plugins: [
      react(),
      extensionManifestPlugin(mode, backendApiUrl, outDir, isVerificationBuild),
    ],
    define: {
      "import.meta.env.VITE_BACKEND_API_URL": JSON.stringify(backendApiUrl),
    },
    build: {
      outDir,
      emptyOutDir: true,
    },
  };
});

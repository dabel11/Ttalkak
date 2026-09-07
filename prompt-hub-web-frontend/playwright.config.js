const { defineConfig } = require("@playwright/test");

const e2ePort = Number(process.env.TTALKAK_E2E_PORT || 4174);
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65535) {
  throw new Error(`TTALKAK_E2E_PORT must be a valid TCP port. Received: ${process.env.TTALKAK_E2E_PORT}`);
}
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;

module.exports = defineConfig({
  outputDir: process.env.TTALKAK_E2E_OUTPUT_DIR || "test-results",
  testDir: "./e2e",
  testIgnore: ["cross-browser-smoke.spec.js", "production-loading.spec.js", "live-backend-smoke.spec.js"],
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: e2eBaseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node preview-server.cjs",
    env: { ...process.env, TTALKAK_PREVIEW_PORT: String(e2ePort) },
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

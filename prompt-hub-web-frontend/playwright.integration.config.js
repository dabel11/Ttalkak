const { defineConfig } = require("@playwright/test");

const port = Number(process.env.TTALKAK_INTEGRATION_WEB_PORT || 4176);

module.exports = defineConfig({
  outputDir: process.env.TTALKAK_E2E_OUTPUT_DIR || "test-results-integration",
  testDir: "./e2e",
  testMatch: "live-backend-smoke.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node preview-server.cjs",
    env: { ...process.env, TTALKAK_PREVIEW_PORT: String(port) },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

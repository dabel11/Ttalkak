const base = require("./playwright.config.js");
const { defineConfig } = require("@playwright/test");

const productionPort = Number(process.env.TTALKAK_E2E_PROD_PORT || 4175);
if (!Number.isInteger(productionPort) || productionPort < 1 || productionPort > 65535) {
  throw new Error(`TTALKAK_E2E_PROD_PORT must be a valid TCP port. Received: ${process.env.TTALKAK_E2E_PROD_PORT}`);
}
const productionBaseURL = `http://127.0.0.1:${productionPort}`;

module.exports = defineConfig({
  ...base,
  testMatch: ["startup.spec.js", "production-loading.spec.js"],
  testIgnore: [],
  workers: 1,
  use: { ...base.use, baseURL: productionBaseURL },
  webServer: {
    command: "node preview-server.cjs",
    env: { ...process.env, TTALKAK_PREVIEW_ROOT: process.env.TTALKAK_WEB_OUTPUT_DIR || "dist", TTALKAK_PREVIEW_PORT: String(productionPort) },
    url: productionBaseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

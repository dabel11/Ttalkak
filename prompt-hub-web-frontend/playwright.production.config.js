const base = require("./playwright.config.js");
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  ...base,
  testMatch: ["startup.spec.js", "production-loading.spec.js"],
  testIgnore: [],
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "node preview-server.cjs",
    env: { ...process.env, TTALKAK_PREVIEW_ROOT: "dist", TTALKAK_PREVIEW_PORT: "4174" },
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

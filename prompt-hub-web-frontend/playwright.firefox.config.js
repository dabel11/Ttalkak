const base = require("./playwright.config.js");
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  ...base,
  testMatch: "cross-browser-smoke.spec.js",
  testIgnore: [],
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { ...base.use, browserName: "firefox" },
});

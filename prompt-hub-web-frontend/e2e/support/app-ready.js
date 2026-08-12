const { expect } = require("@playwright/test");

async function gotoApp(page, path = "/") {
  await page.goto(path);
  // Parallel CI workers can delay module evaluation without indicating an app failure.
  await expect(page.locator("html")).toHaveAttribute("data-ttalkak-ready", "true", { timeout: 15_000 });
}

module.exports = { gotoApp };

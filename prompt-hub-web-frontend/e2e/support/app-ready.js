const { expect } = require("@playwright/test");

async function gotoApp(page, path = "/") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-ttalkak-ready", "true");
}

module.exports = { gotoApp };

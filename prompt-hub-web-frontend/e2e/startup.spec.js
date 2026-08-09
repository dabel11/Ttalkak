const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("application starts without page errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await gotoApp(page);
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();
});

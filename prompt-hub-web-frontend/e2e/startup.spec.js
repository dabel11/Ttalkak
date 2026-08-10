const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("application starts without page errors", async ({ page }) => {
  const errors = [];
  const scriptRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "script") scriptRequests.push(request.url());
  });
  await gotoApp(page);
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
  expect(scriptRequests.some((url) => url.includes("demo-data"))).toBe(false);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();
});

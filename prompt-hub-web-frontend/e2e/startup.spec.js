const { test, expect } = require("@playwright/test");

test("application starts without page errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();
});

const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("Firefox starts the app and supports core desktop navigation", async ({ page, browserName }) => {
  expect(browserName).toBe("firefox");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await gotoApp(page);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();

  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".make-page")).toBeVisible();
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeEditable();

  await page.locator('[data-open-auth="login"]').first().click();
  await expect(page.locator("[data-auth-form]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

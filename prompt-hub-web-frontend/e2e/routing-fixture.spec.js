const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("route hashes survive reload and browser history navigation", async ({ page }) => {
  await gotoApp(page, "/#/share");
  await expect(page.locator(".share-page")).toBeVisible();
  await expect(page).toHaveURL(/#\/share$/);

  await page.locator('.sidebar [data-route="make"]').click();
  await expect(page.locator(".make-page")).toBeVisible();
  await expect(page).toHaveURL(/#\/make$/);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ttalkak-ready", "true", { timeout: 15_000 });
  await expect(page.locator(".make-page")).toBeVisible();

  await page.goBack();
  await expect(page.locator(".share-page")).toBeVisible();
  await expect(page).toHaveURL(/#\/share$/);
});

test("protected My Page route redirects signed-out users to login", async ({ page }) => {
  await gotoApp(page, "/#/mypage");
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator("[data-auth-form]")).toBeVisible();
});

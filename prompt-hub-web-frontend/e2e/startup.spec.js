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

test("application distinguishes interactive readiness from initial backend hydration", async ({ page }) => {
  let markHydrationStarted;
  let releaseHydration;
  const hydrationStarted = new Promise((resolve) => { markHydrationStarted = resolve; });
  const hydrationGate = new Promise((resolve) => { releaseHydration = resolve; });

  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        },
        body: "",
      });
      return;
    }
    markHydrationStarted();
    await hydrationGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await hydrationStarted;
  await expect(page.locator("html")).toHaveAttribute("data-ttalkak-ready", "true");
  await expect(page.locator("html")).not.toHaveAttribute("data-ttalkak-hydrated", "true");
  releaseHydration();
  await expect(page.locator("html")).toHaveAttribute("data-ttalkak-hydrated", "true");
  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".make-page")).toBeVisible();
});

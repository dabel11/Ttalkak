const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

function routeChunkRequested(requests, route) {
  return requests.some((url) => new RegExp(`/assets/chunks/${route}-[A-Z0-9]+\\.js$`).test(new URL(url).pathname));
}

test("Home defers Share and Make chunks until their routes are opened", async ({ page }) => {
  const scripts = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });

  await gotoApp(page);
  expect(routeChunkRequested(scripts, "share")).toBe(false);
  expect(routeChunkRequested(scripts, "make")).toBe(false);
  expect(routeChunkRequested(scripts, "admin")).toBe(false);

  await page.locator('[data-route="share"]').first().click();
  await expect(page.locator(".share-page")).toBeVisible();
  expect(routeChunkRequested(scripts, "share")).toBe(true);

  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".make-page")).toBeVisible();
  expect(routeChunkRequested(scripts, "make")).toBe(true);
  expect(routeChunkRequested(scripts, "admin")).toBe(false);
});

test("an administrator session loads the Admin chunk on demand", async ({ page }) => {
  const scripts = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "admin-loading-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [],
      savedPrompts: [],
      state: { route: "admin", adminMode: true, isLoggedIn: true, currentUser: "Admin", currentUserId: 1, currentUserRole: "admin", authToken: "admin-loading-token", token: "admin-loading-token" },
    }));
  });

  await gotoApp(page);
  await expect(page.locator(".admin-page")).toBeVisible();
  expect(routeChunkRequested(scripts, "admin")).toBe(true);
});

test("a route chunk failure renders an actionable status instead of a blank page", async ({ page }) => {
  await page.route(/\/assets\/chunks\/make-[A-Z0-9]+\.js$/, (route) => route.abort("failed"));
  await gotoApp(page);
  await page.locator('[data-route="make"]').first().click();
  const failure = page.locator('[data-route-module-error="make"]');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText("새로고침 후 다시 시도");
});

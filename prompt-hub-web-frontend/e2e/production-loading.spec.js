const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

function routeChunkRequested(requests, route) {
  return requests.some((url) => new RegExp(`/assets/chunks/${route}-runtime-[A-Z0-9]+\\.js$`).test(new URL(url).pathname));
}

test("Home defers Share and Make chunks until their routes are opened", async ({ page }) => {
  const scripts = [];
  const styles = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
    if (request.resourceType() === "stylesheet") styles.push(request.url());
  });

  await gotoApp(page);
  expect(routeChunkRequested(scripts, "secondary")).toBe(false);
  expect(routeChunkRequested(scripts, "make")).toBe(false);
  expect(routeChunkRequested(scripts, "admin")).toBe(false);
  expect(styles.some((url) => new URL(url).pathname.endsWith("/assets/styles/make.css"))).toBe(false);

  await page.locator('[data-route="share"]').first().click();
  await expect(page.locator(".share-page")).toBeVisible();
  expect(routeChunkRequested(scripts, "secondary")).toBe(true);

  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".make-page")).toBeVisible();
  expect(routeChunkRequested(scripts, "make")).toBe(true);
  expect(styles.some((url) => new URL(url).pathname.endsWith("/assets/styles/make.css"))).toBe(true);
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
  await page.locator('[data-admin-tab="users"]').click();
  await expect(page.locator("[data-admin-user-search-form]")).toBeVisible();
  await page.locator('[data-admin-tab="audit"]').click();
  await expect(page.locator('[data-admin-tab="audit"]')).toHaveClass(/active/);
});

test("an administrator login loads working menus without a manual view toggle", async ({ page }) => {
  const adminRequests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "content-type": "application/json",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
    if (pathname.startsWith("/api/admin/")) adminRequests.push(pathname);
    const body = pathname === "/api/auth/login"
      ? { accessToken: "admin-production-fixture-token", member: { id: 1, userId: "admin", nickname: "Production Admin", role: "ADMIN" } }
      : { items: [] };
    return route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  await gotoApp(page);
  await page.locator('[data-open-auth="login"]').click();
  await page.locator('[data-auth-form] input[name="userId"]').fill("admin");
  await page.locator('[data-auth-form] input[name="password"]').fill("fixture-only-password");
  await page.locator('[data-auth-form]').getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".topbar-account > summary")).toContainText("Production Admin");
  await expect(page.locator(".admin-page")).toBeVisible();
  await page.locator('[data-admin-tab="users"]').click();
  await expect(page.locator("[data-admin-user-search-form]")).toBeVisible();
  expect(adminRequests).toContain("/api/admin/reports");
  await page.reload();
  await expect(page.locator(".topbar-account > summary")).toContainText("Production Admin");
  await expect(page.locator("[data-admin-user-search-form]")).toBeVisible();
});

test("a route chunk failure renders an actionable status instead of a blank page", async ({ page }) => {
  await page.route(/\/assets\/chunks\/make-runtime-[A-Z0-9]+\.js$/, (route) => route.abort("failed"));
  await gotoApp(page);
  await page.locator('[data-route="make"]').first().click();
  const failure = page.locator('[data-route-module-error="make"]');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText("새로고침 후 다시 시도");
});

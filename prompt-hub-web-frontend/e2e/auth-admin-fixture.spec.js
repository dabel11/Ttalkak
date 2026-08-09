const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const API_PATTERN = "http://localhost:8080/**";
const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

async function seed(page, state = {}, token = "", popularPrompts = []) {
  await page.addInitScript(({ storageKey, tokenKey, statePayload, authToken, prompts }) => {
    if (sessionStorage.getItem("ttalkak-auth-admin-seeded")) return;
    localStorage.clear();
    if (authToken) localStorage.setItem(tokenKey, authToken);
    localStorage.setItem(storageKey, JSON.stringify({ state: statePayload, savedPrompts: [], popularPrompts: prompts }));
    sessionStorage.setItem("ttalkak-auth-admin-seeded", "true");
  }, {
    storageKey: STORAGE_KEY,
    tokenKey: TOKEN_KEY,
    authToken: token,
    prompts: popularPrompts,
    statePayload: { route: "home", isLoggedIn: false, currentUserRole: "user", ...state },
  });
}

async function mockBackend(page, handler) {
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS, body: "" });
    if (handler && await handler(route, request)) return;
    return route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) });
  });
}

test("login accepts a valid auth contract and rejects a malformed response", async ({ page }) => {
  let malformed = false;
  await seed(page);
  await mockBackend(page, async (route, request) => {
    if (new URL(request.url()).pathname !== "/api/auth/login") return false;
    const body = malformed
      ? { accessToken: "invalid-without-user" }
      : { accessToken: "fixture-token", member: { memberId: 7, username: "fixture", nickname: "Fixture User", role: "ROLE_USER" } };
    await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(body) });
    malformed = true;
    return true;
  });

  await page.goto("/");
  await page.locator('[data-open-auth="login"]').click();
  await page.locator('[data-auth-form] input[name="userId"]').fill("fixture");
  await page.locator('[data-auth-form] input[name="password"]').fill("password123!");
  await page.locator('[data-auth-form]').getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".login-button.logged-in")).toContainText("Fixture User");

  await page.locator("[data-logout]").click();
  await page.locator("[data-confirm-action]").click();
  await page.locator('[data-open-auth="login"]').click();
  await page.locator('[data-auth-form] input[name="userId"]').fill("fixture");
  await page.locator('[data-auth-form] input[name="password"]').fill("password123!");
  await page.locator('[data-auth-form]').getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("[data-auth-error]")).toContainText("token and user identity");
  await expect(page.locator("[data-auth-form]")).toBeVisible();
});

test("an expired authenticated session returns to the login state", async ({ page }) => {
  await seed(page, { isLoggedIn: true, currentUser: "Expired User", currentUserId: "9", authToken: "expired", token: "expired" }, "expired", [{ id: 88, title: "Fixture", text: "Fixture", source: "community", isShared: true }]);
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/prompts/88/save" && request.method() === "POST") {
      await route.fulfill({ status: 401, headers: HEADERS, body: JSON.stringify({ code: "AUTH_EXPIRED", message: "Session expired" }) });
      return true;
    }
    if (url.pathname === "/api/prompts" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [{ id: 88, title: "Fixture", text: "Fixture", source: "community", isShared: true }] }) });
      return true;
    }
    return false;
  });
  await page.goto("/");
  await page.locator('[data-save-prompt="88"]').click();
  await expect(page.locator('[data-open-auth="login"]')).toBeVisible();
});

test("administrator report and tag mutations update through fixture APIs", async ({ page }) => {
  let reportStatus = "pending";
  let tagStatus = "pending";
  await seed(page, { isLoggedIn: true, currentUser: "Admin", currentUserId: "1", currentUserRole: "admin", adminMode: true, route: "admin", authToken: "admin-token", token: "admin-token" }, "admin-token");
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/reports" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [{ id: 1, type: "prompt", targetId: 88, status: reportStatus, reason: "spam" }] }) }); return true;
    }
    if (url.pathname === "/api/admin/tags" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [{ id: 2, name: "fixture-tag", status: tagStatus, useCount: 3 }] }) }); return true;
    }
    if (["/api/admin/prompts", "/api/admin/revision-requests", "/api/admin/audit-logs"].includes(url.pathname) && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) }); return true;
    }
    if (/^\/api\/admin\/reports\/[^/]+\/status$/.test(url.pathname) && request.method() === "PATCH") {
      reportStatus = request.postDataJSON().status;
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ id: 1, type: "prompt", targetId: 88, status: reportStatus, reason: "spam" }) }); return true;
    }
    if (/^\/api\/admin\/tags\/[^/]+\/status$/.test(url.pathname) && request.method() === "PATCH") {
      tagStatus = request.postDataJSON().status;
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ id: 2, name: "fixture-tag", status: tagStatus, useCount: 3 }) }); return true;
    }
    return false;
  });

  const reportsLoaded = page.waitForResponse((response) => response.url().endsWith("/api/admin/reports") && response.request().method() === "GET");
  await page.goto("/");
  await reportsLoaded;
  await page.locator('[data-admin-report-status="prompt:88:reviewed"]').click();
  await expect(page.locator(".toast")).toContainText("검토 완료");
  await page.locator('[data-admin-tab="tags"]').click();
  await page.locator('[data-admin-tag-action="approved:fixture-tag"]').click();
  await expect(page.locator(".toast")).toContainText("검토 완료");
});

test("administrator user block failure rolls back and a retry succeeds", async ({ page }) => {
  let failBlock = true;
  await seed(page, { isLoggedIn: true, currentUser: "Admin", currentUserId: "1", currentUserRole: "admin", adminMode: true, route: "admin", adminTab: "users", authToken: "admin-token", token: "admin-token" }, "admin-token");
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (["/api/admin/reports", "/api/admin/tags", "/api/admin/prompts", "/api/admin/revision-requests", "/api/admin/audit-logs"].includes(url.pathname)) {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) }); return true;
    }
    if (url.pathname === "/api/admin/users" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [{ id: 5, nickname: "Target User", blocked: false }] }) }); return true;
    }
    if (url.pathname === "/api/admin/users/5/activity" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ memberId: 5, nickname: "Target User", blocked: false }) }); return true;
    }
    if (/^\/api\/admin\/users\/5\/(prompts|comments|replies|reports\/submitted|reports\/received)$/.test(url.pathname)) {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) }); return true;
    }
    if (url.pathname === "/api/admin/users/5/block" && request.method() === "PATCH") {
      if (failBlock) { failBlock = false; await route.fulfill({ status: 500, headers: HEADERS, body: JSON.stringify({ code: "SERVER_ERROR" }) }); }
      else await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ memberId: 5, nickname: "Target User", blocked: true }) });
      return true;
    }
    return false;
  });

  await page.goto("/");
  const search = page.locator("[data-admin-user-search-form]");
  await search.locator('input[name="nickname"]').fill("Target User");
  await search.locator('button[type="submit"]').click();
  await page.locator('[data-admin-user-select="5"]').click();
  await page.locator('[data-admin-user-block="5"]').click();
  await page.locator('[data-admin-user-block-form] textarea[name="reason"]').fill("fixture reason");
  await page.locator('[data-admin-user-block-form] button[type="submit"]').click();
  await expect(page.locator('[data-admin-user-block="5"]')).toBeVisible();

  await page.locator('[data-admin-user-block-form] textarea[name="reason"]').fill("fixture reason");
  await page.locator('[data-admin-user-block-form] button[type="submit"]').click();
  await expect(page.locator('[data-admin-user-unblock="5"]')).toBeVisible();
});

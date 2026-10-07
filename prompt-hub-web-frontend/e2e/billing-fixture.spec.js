const { test, expect } = require("@playwright/test");
const { gotoApp, waitForAppHydration } = require("./support/app-ready.js");

const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const API_PATTERN = "http://localhost:8080/**";
const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-session-uuid",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

async function seed(page, state = {}, token = "") {
  await page.addInitScript(({ storageKey, tokenKey, statePayload, authToken }) => {
    localStorage.clear();
    sessionStorage.clear();
    if (authToken) localStorage.setItem(tokenKey, authToken);
    localStorage.setItem(storageKey, JSON.stringify({
      state: statePayload,
      savedPrompts: [],
      popularPrompts: [],
    }));
  }, {
    storageKey: STORAGE_KEY,
    tokenKey: TOKEN_KEY,
    authToken: token,
    statePayload: {
      route: "home",
      isLoggedIn: false,
      currentUserRole: "user",
      ...state,
    },
  });
}

async function mockBackend(page, handler) {
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: HEADERS, body: "" });
      return;
    }
    if (handler && await handler(route, request)) return;
    await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) });
  });
}

async function openBilling(page) {
  const accountSummary = page.locator(".topbar-account > summary");
  await accountSummary.click();
  await page.locator("[data-open-billing]").click();
  return accountSummary;
}

test("pending billing can be rechecked without starting another payment and returns focus on close", async ({ page }) => {
  await seed(page, {
    isLoggedIn: true,
    currentUser: "결제 회원",
    currentUserId: "27",
    authToken: "member-token",
    token: "member-token",
  }, "member-token");

  const calls = new Map();
  await mockBackend(page, async (route, request) => {
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    calls.set(key, (calls.get(key) || 0) + 1);
    if (path === "/api/me/billing/setup" && request.method() === "POST") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({
        clientKey: "test_ck_fixture",
        customerKey: "fixture-customer",
        amount: 5000,
        cardRegistered: true,
      }) });
      return true;
    }
    if (path === "/api/me/billing" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({
        cardRegistered: true,
        autoRenew: true,
        paymentStatus: "PENDING",
      }) });
      return true;
    }
    if (path === "/api/me/usage" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({
        plan: "FREE",
        used: 25000,
        limit: 100000,
        remaining: 75000,
        quotaEnforced: true,
        usageAvailable: true,
      }) });
      return true;
    }
    return false;
  });

  await gotoApp(page);
  await waitForAppHydration(page);
  const accountSummary = await openBilling(page);
  const dialog = page.getByRole("dialog", { name: "요금제·결제" });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "결제 확인 중" })).toBeVisible();
  await expect(dialog).toContainText("25,000개 / 100,000개");
  await expect(dialog).toContainText("남음 75,000개");
  await expect(dialog.getByRole("button", { name: "결제 상태 다시 확인" })).toBeVisible();
  await expect(dialog.locator("[data-billing-retry], [data-billing-register], [data-billing-cancel]")).toHaveCount(0);

  await dialog.getByRole("button", { name: "결제 상태 다시 확인" }).click();
  await expect.poll(() => calls.get("GET /api/me/billing") || 0).toBe(2);
  expect(calls.get("POST /api/me/billing/retry") || 0).toBe(0);
  expect(calls.get("POST /api/me/billing/complete") || 0).toBe(0);

  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
  await expect(accountSummary).toBeFocused();
});

test("signed-out billing deep link opens login and removes its one-time query", async ({ page }) => {
  await seed(page);
  await mockBackend(page);

  await gotoApp(page, "/?openBilling=1#/home");

  await expect(page.locator("[data-auth-form]")).toBeVisible();
  await expect(page.locator("[data-auth-error]")).toContainText("로그인한 뒤 요금제와 사용량을 확인할 수 있습니다");
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.has("openBilling"))).toBe(false);
  await expect(page).toHaveURL(/\/#\/home$/);
});

test("billing authentication failure clears the expired session and opens login", async ({ page }) => {
  await seed(page, {
    isLoggedIn: true,
    currentUser: "만료 회원",
    currentUserId: "28",
    authToken: "expired-token",
    token: "expired-token",
  }, "expired-token");

  await mockBackend(page, async (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/me/billing/setup" && request.method() === "POST") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({
        clientKey: "test_ck_fixture",
        customerKey: "fixture-customer",
        amount: 5000,
        cardRegistered: true,
      }) });
      return true;
    }
    if (path === "/api/me/billing" && request.method() === "GET") {
      await route.fulfill({
        status: 401,
        headers: HEADERS,
        body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED", message: "expired" }),
      });
      return true;
    }
    if (path === "/api/me/usage" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ plan: "FREE", used: 0, limit: 100000 }) });
      return true;
    }
    return false;
  });

  await gotoApp(page);
  await waitForAppHydration(page);
  await openBilling(page);

  await expect(page.locator("[data-auth-form]")).toBeVisible();
  await expect(page.locator("[data-auth-error]")).toContainText("로그인이 만료되었습니다");
  await expect(page.locator('[data-open-auth="login"]')).toBeVisible();
  await expect.poll(() => page.evaluate((tokenKey) => localStorage.getItem(tokenKey), TOKEN_KEY)).toBeNull();
  await expect(page.getByRole("dialog", { name: "요금제·결제" })).toHaveCount(0);
});

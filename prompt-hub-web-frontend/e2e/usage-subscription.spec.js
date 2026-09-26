const { test, expect } = require("@playwright/test");
const { gotoApp, waitForAppHydration } = require("./support/app-ready.js");

const API_PATTERN = "http://localhost:8080/**";
const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installAuthenticatedState(page) {
  await page.addInitScript(({ storageKey, tokenKey }) => {
    localStorage.setItem(tokenKey, "usage-fixture-token");
    localStorage.setItem(storageKey, JSON.stringify({
      popularPrompts: [], savedPrompts: [], commentsByPrompt: {},
      state: { isLoggedIn: true, currentUser: "테스트 사용자", currentUserId: 7, currentUserRole: "user", accountScopes: {} },
    }));
  }, { storageKey: STORAGE_KEY, tokenKey: TOKEN_KEY });
}

test("pricing integrates FREE, PRO, and cancellation-pending backend states", async ({ page }) => {
  await installAuthenticatedState(page);
  let subscription = { plan: "FREE", status: "ACTIVE", dailyLimit: 10, usedToday: 7, remainingToday: 3, cancelAtPeriodEnd: false };
  let subscriptionAuthorization = "";
  await page.route(API_PATTERN, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/subscriptions/me") {
      subscriptionAuthorization = route.request().headers().authorization || "";
      return json(route, subscription);
    }
    if (url.pathname === "/api/prompts") return json(route, { items: [], page: 1, totalPages: 1, totalElements: 0 });
    if (url.pathname.startsWith("/api/tags")) return json(route, { items: [] });
    return json(route, { items: [] });
  });

  await gotoApp(page, "/#/pricing");
  await waitForAppHydration(page);
  await expect(page.locator(".pricing-page")).toBeVisible();
  await expect(page.getByText("현재 요금제 · FREE · 오늘 3/10회 남음")).toBeVisible();
  await expect(page.locator("[data-subscription-checkout]")).toBeVisible();
  expect(subscriptionAuthorization).toBe("Bearer usage-fixture-token");

  subscription = {
    plan: "PRO", status: "ACTIVE", dailyLimit: 100, usedToday: 18, remainingToday: 82,
    currentPeriodEnd: "2026-10-25", cancelAtPeriodEnd: true,
  };
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("현재 요금제 · PRO · 오늘 82/100회 남음")).toBeVisible();
  await expect(page.getByText(/2026-10-25까지 PRO를 이용/)).toBeVisible();
  await expect(page.locator("[data-subscription-manage]")).toBeVisible();
  await expect(page.locator("[data-subscription-checkout]")).toHaveCount(0);
});

test("pricing accepts token usage responses and renders compact values", async ({ page }) => {
  await installAuthenticatedState(page);
  await page.route(API_PATTERN, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/subscriptions/me") {
      return json(route, {
        plan: "FREE",
        status: "ACTIVE",
        usageUnit: "TOKEN",
        usagePeriod: "DAY",
        tokenLimit: 100000,
        tokensUsed: 31500,
        tokensRemaining: 68500,
      });
    }
    if (url.pathname === "/api/prompts") return json(route, { items: [], page: 1, totalPages: 1, totalElements: 0 });
    if (url.pathname.startsWith("/api/tags")) return json(route, { items: [] });
    return json(route, { items: [] });
  });

  await gotoApp(page, "/#/pricing");
  await waitForAppHydration(page);
  await expect(page.getByText("현재 요금제 · FREE · 오늘 68.5K/100K 토큰 남음")).toBeVisible();
});

test("guest pricing asks for login and does not claim a paid account state", async ({ page }) => {
  await page.route(API_PATTERN, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/prompts") return json(route, { items: [], page: 1, totalPages: 1, totalElements: 0 });
    return json(route, { items: [] });
  });
  await gotoApp(page, "/#/pricing");
  await expect(page.getByRole("button", { name: "로그인하고 시작하기" })).toBeVisible();
  await expect(page.getByText(/현재 요금제/)).toHaveCount(0);
});

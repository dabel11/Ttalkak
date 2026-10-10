const { test, expect } = require("@playwright/test");
const { gotoApp, waitForAppHydration } = require("./support/app-ready.js");
const HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-session-uuid", "access-control-allow-methods": "GET, POST, OPTIONS", "content-type": "application/json" };

async function fixture(page, member = false) {
  await page.addInitScript((member) => {
    localStorage.clear(); sessionStorage.clear();
    if (member) localStorage.setItem("ttalkak_access_token", "member-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({ state: { route: "home", isLoggedIn: member, currentUser: "테스트 회원", currentUserId: "27", currentUserRole: "user" }, savedPrompts: [], popularPrompts: [] }));
  }, member);
  const calls = [];
  let cancelled = false;
  await page.route("http://localhost:8080/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: HEADERS }); return; }
    calls.push(`${request.method()} ${path}`);
    let body = { items: [] };
    if (path === "/api/me/usage") body = { plan: "PRO", used: 800, limit: 10000, remaining: 9200, quotaEnforced: true, usageAvailable: true, resetsAt: "2026-11-01T00:00:00Z" };
    if (path === "/api/me/billing/setup") body = { clientKey: "test_ck_fixture", customerKey: "customer", amount: 4900, cardRegistered: true };
    if (path === "/api/me/billing/cancel") cancelled = true;
    if (["/api/me/billing", "/api/me/billing/cancel"].includes(path)) body = { cardRegistered: true, autoRenew: !cancelled, paymentStatus: "ACTIVE", nextChargeAt: "2026-11-01T00:00:00Z" };
    await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(body) });
  });
  return calls;
}

test("guest can read pricing, refresh the path and start PRO through login", async ({ page }) => {
  const calls = await fixture(page);
  await gotoApp(page, "/pricing");
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "필요한 만큼, 더 편하게 개선하세요." })).toBeVisible();
  await expect(page.locator(".pricing-pro")).toContainText("가격 미정");
  await page.reload();
  await waitForAppHydration(page);
  expect(calls.filter((call) => call.includes("/api/me/billing"))).toEqual([]);
  await page.getByRole("button", { name: "테스트 구독 확인" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("로그인");
});

test("member sees live usage without setup and can stop renewal from the existing flow", async ({ page }) => {
  const calls = await fixture(page, true);
  await gotoApp(page, "/pricing");
  await waitForAppHydration(page);
  const summary = page.locator(".subscription-card");
  await expect(summary).toContainText("9,200개");
  await expect(summary).toContainText("PRO");
  expect(calls).not.toContain("POST /api/me/billing/setup");
  await summary.getByRole("button", { name: "구독·결제 관리" }).click();
  const dialog = page.getByRole("dialog", { name: "요금제·결제" });
  await expect(dialog).toContainText("4,900원");
  await dialog.getByRole("button", { name: "자동 갱신 중지" }).click();
  await expect(dialog).toContainText("다음 자동 갱신이 중지됐습니다.");
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(summary).toContainText("중지");
  expect(calls.filter((call) => call === "POST /api/me/billing/cancel")).toHaveLength(1);
  const setupCount = calls.filter((call) => call === "POST /api/me/billing/setup").length;
  await page.getByRole("button", { name: "마이페이지", exact: true }).click();
  await expect(page).toHaveURL(/#\/mypage$/);
  await expect(summary).toContainText("9,200개");
  await expect(summary).toContainText("중지");
  expect(calls.filter((call) => call === "POST /api/me/billing/setup")).toHaveLength(setupCount);
});

test("mobile pricing fits and browser back returns to the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await gotoApp(page, "/pricing");
  await waitForAppHydration(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "무료로 체험하기" }).click();
  await expect(page).toHaveURL(/#\/make$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "필요한 만큼, 더 편하게 개선하세요." })).toBeVisible();
});

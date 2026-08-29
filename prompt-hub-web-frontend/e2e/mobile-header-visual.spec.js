const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const HEADERS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };

async function prepare(page, { loggedIn = false, backendError = false } = {}) {
  await page.setViewportSize({ width: 620, height: 800 });
  await page.addInitScript(({ storageKey, tokenKey, authenticated }) => {
    localStorage.clear();
    if (authenticated) localStorage.setItem(tokenKey, "visual-token");
    localStorage.setItem(storageKey, JSON.stringify({ state: {
      route: "home", isLoggedIn: authenticated, currentUser: authenticated ? "시각 테스트 사용자" : "",
      currentUserId: authenticated ? "7" : "", authToken: authenticated ? "visual-token" : "",
      token: authenticated ? "visual-token" : "",
    }, savedPrompts: [], popularPrompts: [] }));
  }, { storageKey: STORAGE_KEY, tokenKey: TOKEN_KEY, authenticated: loggedIn });
  await page.route("http://localhost:8080/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS, body: "" });
    return route.fulfill({ status: backendError ? 503 : 200, headers: HEADERS, body: JSON.stringify(backendError ? { code: "SERVICE_UNAVAILABLE" } : { items: [] }) });
  });
  await gotoApp(page);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}.topbar{min-height:360px!important}" });
  await page.getByRole("button", { name: "메뉴" }).click();
}

async function expectHeader(page, name) {
  await expect(page.locator(".topbar")).toHaveScreenshot(name, { animations: "disabled", caret: "hide" });
}

test("mobile header logged-out state", async ({ page }) => {
  await prepare(page);
  await expectHeader(page, "mobile-header-logged-out.png");
});

test("mobile header logged-in state", async ({ page }) => {
  await prepare(page, { loggedIn: true });
  await expectHeader(page, "mobile-header-logged-in.png");
});

test("mobile header backend error state", async ({ page }) => {
  await prepare(page, { backendError: true });
  await expect(page.locator(".backend-status-menu > summary")).toContainText("연결 오류");
  await expectHeader(page, "mobile-header-backend-error.png");
});

test("mobile header account menu state", async ({ page }) => {
  await prepare(page, { loggedIn: true });
  await page.locator(".topbar-account > summary").click();
  await expectHeader(page, "mobile-header-account-open.png");
});

test("mobile header settings menu state", async ({ page }) => {
  await prepare(page);
  await page.locator(".topbar-settings > summary").click();
  await expectHeader(page, "mobile-header-settings-open.png");
});

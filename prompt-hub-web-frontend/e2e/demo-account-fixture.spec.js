const { test, expect } = require("@playwright/test");
const { gotoApp, waitForAppHydration } = require("./support/app-ready.js");

const HEADERS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };

test("Google demo login persists local likes, saves, folders, and My Page", async ({ page }) => {
  test.setTimeout(60_000);
  const protectedRequests = [];
  await page.route("http://localhost:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS, body: "" });
    if (url.pathname === "/api/prompts" && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        headers: HEADERS,
        body: JSON.stringify({
          content: [{ id: 88, title: "데모 계정 기능 확인", text: "로컬 상호작용을 검증합니다.", source: "community", isShared: true }],
          totalPages: 1,
          totalElements: 1,
        }),
      });
    }
    if (url.pathname === "/api/tags/popular" && request.method() === "GET") {
      return route.fulfill({ status: 200, headers: HEADERS, body: "[]" });
    }
    protectedRequests.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 401, headers: HEADERS, body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED" }) });
  });

  await gotoApp(page);
  await waitForAppHydration(page);
  await page.locator('[data-open-auth="login"]').first().click();
  await page.getByRole("button", { name: "Google 로그인 데모" }).click();
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);

  const like = page.locator('[data-like-prompt="88"]').first();
  await like.click();
  await expect(like).toHaveClass(/liked/);
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);

  const save = page.locator('[data-save-prompt="88"]').first();
  await save.click();
  await expect(save).toHaveClass(/saved/);
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);

  await page.locator('.sidebar [data-route="make"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "대화 목록", exact: true }).click();
  await page.locator("[data-show-folder-form]").click();
  await expect(page.locator(".make-page")).toHaveClass(/drawer-open/);
  await expect(page.locator("[data-folder-create-form]")).toBeVisible();
  await page.locator('[data-folder-create-form] input[name="folderName"]').fill("데모 폴더");
  await page.locator('[data-folder-create-form] button[type="submit"]').click();
  await expect(page.locator(".make-page")).toHaveClass(/drawer-open/);
  const demoFolder = page.locator("[data-folder-item]").filter({ hasText: "데모 폴더" });
  await expect(demoFolder).toBeVisible();
  await demoFolder.locator("[data-folder-menu]").click();
  await expect(page.locator(".make-page")).toHaveClass(/drawer-open/);
  await expect(demoFolder.locator(".make-folder-menu")).toBeVisible();
  const folderMenuBounds = await demoFolder.locator(".make-folder-menu").evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, viewportWidth: document.documentElement.clientWidth };
  });
  expect(folderMenuBounds.left).toBeGreaterThanOrEqual(0);
  expect(folderMenuBounds.right).toBeLessThanOrEqual(folderMenuBounds.viewportWidth);
  await demoFolder.locator("[data-delete-folder]").click();
  await expect(page.locator(".confirm-modal")).toBeVisible();
  await page.locator("[data-cancel-confirm]").click();
  await expect(page.locator(".confirm-modal")).toHaveCount(0);
  await expect(page.locator(".make-page")).toHaveClass(/drawer-open/);
  await page.getByRole("button", { name: "대화 목록 닫기" }).click();

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="saved"]').click();
  await expect(page.locator(".saved-page")).toBeVisible();
  await expect(page.locator(".demo-library-prompt")).toContainText("데모 계정 · 이 기기에 저장됨");
  await expect(page.getByText("데모 계정 기능 확인", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".demo-library-prompt.is-error")).toHaveCount(0);

  await page.reload();
  await waitForAppHydration(page);
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);
  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="saved"]').click();
  await expect(page.locator(".saved-page")).toBeVisible();
  await expect(page.locator(".demo-library-prompt")).toContainText("데모 계정 · 이 기기에 저장됨");
  await expect(page.getByText("데모 계정 기능 확인", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".demo-library-prompt.is-error")).toHaveCount(0);

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="make"]').click();
  await page.getByRole("button", { name: "대화 목록", exact: true }).click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "데모 폴더" })).toBeVisible();
  expect(protectedRequests).toEqual([]);
});

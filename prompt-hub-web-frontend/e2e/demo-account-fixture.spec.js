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
  await page.locator("[data-show-folder-form]").click();
  await page.locator('[data-folder-create-form] input[name="folderName"]').fill("데모 폴더");
  await page.locator('[data-folder-create-form] button[type="submit"]').click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "데모 폴더" })).toBeVisible();

  await page.locator('.sidebar [data-route="saved"]').click();
  await expect(page.locator(".saved-page")).toBeVisible();
  await expect(page.getByText("데모 계정 기능 확인", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".demo-library-prompt.is-error")).toHaveCount(0);

  await page.reload();
  await waitForAppHydration(page);
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);
  await page.locator('.sidebar [data-route="saved"]').click();
  await expect(page.locator(".saved-page")).toBeVisible();
  await expect(page.getByText("데모 계정 기능 확인", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".demo-library-prompt.is-error")).toHaveCount(0);

  await page.locator('.sidebar [data-route="make"]').click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "데모 폴더" })).toBeVisible();
  expect(protectedRequests).toEqual([]);
});

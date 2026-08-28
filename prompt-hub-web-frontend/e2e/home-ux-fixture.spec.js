const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("Home exposes styled sorting and compact backend recovery", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = false; });
  await page.route("http://localhost:8080/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ code: "BACKEND_UNAVAILABLE" }),
  }));
  await gotoApp(page);

  const sort = page.locator(".sort-select");
  await expect(sort).toContainText("정렬");
  await expect(sort.locator("select")).toHaveValue(/popular|saves|comments|likes|latest/);
  expect(await sort.evaluate((element) => getComputedStyle(element).borderRadius)).not.toBe("0px");

  const empty = page.locator(".search-error");
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("heading", { name: "프롬프트를 불러오지 못했습니다" })).toBeVisible();
  await expect(empty.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  const errorHeight = await empty.evaluate((element) => element.getBoundingClientRect().height);
  expect(errorHeight).toBeGreaterThanOrEqual(180);
  expect(errorHeight).toBeLessThanOrEqual(210);

  await page.locator(".backend-status-menu > summary").click();
  await expect(page.locator(".backend-status-popover")).toContainText("개발 서버에 연결할 수 없습니다");
  await expect(page.locator(".backend-status-popover")).toContainText("로컬 백엔드가 실행 중인지 확인한 뒤 다시 연결해 주세요");
  await expect(page.locator(".backend-status-popover [data-retry-home-load]")).toBeVisible();
});

test("Backend status reconnects manually and automatically after connectivity returns", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = false; });
  let available = false;
  await page.route("http://localhost:8080/**", (route) => route.fulfill({
    status: available ? 200 : 503,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(available ? { content: [], totalPages: 1, totalElements: 0 } : { code: "BACKEND_UNAVAILABLE" }),
  }));
  await gotoApp(page);
  const statusMenu = page.locator(".backend-status-menu");
  await expect(statusMenu.locator("summary")).toContainText("연결 오류");

  available = true;
  await statusMenu.locator("summary").click();
  await statusMenu.getByRole("button", { name: "다시 연결" }).click();
  await expect(statusMenu.locator("summary")).toContainText("연결됨");

  available = false;
  await page.reload();
  await expect(statusMenu.locator("summary")).toContainText("연결 오류");
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(statusMenu.locator("summary")).toContainText("연결됨");
});

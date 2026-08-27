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
  expect(await empty.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(320);

  await page.locator(".backend-status-menu > summary").click();
  await expect(page.locator(".backend-status-popover [data-retry-home-load]")).toBeVisible();
});

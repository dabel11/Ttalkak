const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

async function expectNoDocumentOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("desktop content remains usable at a 200 percent zoom equivalent viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await gotoApp(page);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.locator('[data-route="make"]').first().click();
  const composer = page.locator('[data-composer] textarea[name="prompt"]');
  await expect(composer).toBeVisible();
  await composer.fill("긴 한국어 프롬프트가 화면 너비를 넘어가지 않는지 확인합니다. ".repeat(12));
  await expectNoDocumentOverflow(page);
  await expect(page.locator('[data-composer] button[type="submit"]')).toBeVisible();
});

test("essential navigation and authentication remain reachable on a small screen", async ({ page }) => {
  const longError = "로그인 요청을 처리하지 못했습니다. 네트워크 연결 상태를 확인한 뒤 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.".repeat(3);
  await page.route("http://localhost:8080/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (new URL(request.url()).pathname === "/api/auth/login") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: longError }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: [] }) });
  });
  await page.setViewportSize({ width: 480, height: 720 });
  await gotoApp(page);
  await expectNoDocumentOverflow(page);

  await page.locator('[data-route="share"]').first().click();
  await expect(page.locator(".share-page")).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.locator('[data-open-auth="login"]').first().click();
  const form = page.locator("[data-auth-form]");
  await expect(form).toBeVisible();
  await form.locator('input[name="userId"]').fill("fixture");
  await form.locator('input[name="password"]').fill("password123!");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("[data-auth-error]")).toContainText("로그인 요청을 처리하지 못했습니다");
  await expectNoDocumentOverflow(page);
});

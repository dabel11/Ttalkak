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
  const compactMenu = page.getByRole("button", { name: "메뉴" });
  await expect(compactMenu).toBeVisible();
  await expect(page.locator(".brand-mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "TTALKAK 홈" })).toContainText("TTALKAK");
  await expectNoDocumentOverflow(page);

  await compactMenu.click();
  await page.locator('#topbar-action-menu [data-route="make"]').click();
  const composer = page.locator('[data-composer] textarea[name="prompt"]');
  await expect(composer).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".make-side-panel")).toBeHidden();
  const drawerToggle = page.getByRole("button", { name: "대화 목록", exact: true });
  await expect(drawerToggle).toBeVisible();
  await expect(drawerToggle).toContainText("대화");
  await expect(drawerToggle.locator("svg")).toHaveCount(1);
  const headerButtonSizes = await page.evaluate(() => ({
    drawer: document.querySelector(".make-drawer-toggle").getBoundingClientRect().height,
    menu: document.querySelector(".topbar-mobile-toggle").getBoundingClientRect().height,
  }));
  expect(headerButtonSizes.drawer).toBe(headerButtonSizes.menu);
  await drawerToggle.click();
  await expect(drawerToggle).toHaveAttribute("aria-expanded", "true");
  await expect(drawerToggle).toHaveCSS("background-color", "rgb(220, 235, 228)");
  await expect(page.locator(".make-side-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".make-side-panel")).toBeHidden();
  await expect(drawerToggle).toBeFocused();
  const emptyLayout = await page.locator(".make-page.is-empty").evaluate((pageElement) => {
    const hero = pageElement.querySelector(".make-empty").getBoundingClientRect();
    const form = pageElement.querySelector("[data-composer]").getBoundingClientRect();
    return { gap: form.top - hero.bottom, composerBottom: form.bottom, viewportHeight: window.innerHeight };
  });
  expect(emptyLayout.gap).toBeLessThanOrEqual(40);
  expect(emptyLayout.composerBottom).toBeLessThanOrEqual(emptyLayout.viewportHeight + 1);
  await composer.fill("긴 한국어 프롬프트가 화면 너비를 넘어가지 않는지 확인합니다. ".repeat(12));
  await expectNoDocumentOverflow(page);
  await expect(page.locator('[data-composer] button[type="submit"]')).toBeVisible();
});

test("conversation drawer keeps its accessible name at a very narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 720 });
  await gotoApp(page);
  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="make"]').click();

  const drawerToggle = page.getByRole("button", { name: "대화 목록", exact: true });
  await expect(drawerToggle).toBeVisible();
  await expect(drawerToggle.locator(".make-drawer-toggle-label")).toBeHidden();
  await expectNoDocumentOverflow(page);
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

  const compactMenu = page.getByRole("button", { name: "메뉴" });
  await compactMenu.click();
  await page.locator('#topbar-action-menu [data-route="share"]').click();
  await expect(page.locator(".share-page")).toBeVisible();
  await expectNoDocumentOverflow(page);

  await compactMenu.click();
  await expect(compactMenu).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#topbar-action-menu .topbar-mobile-nav")).toBeVisible();
  await expect(page.locator("#topbar-action-menu [data-route='share']")).toHaveClass(/active/);
  await page.locator('#topbar-action-menu [data-open-auth="login"]').click();
  const form = page.locator("[data-auth-form]");
  await expect(form).toBeVisible();
  await form.locator('input[name="userId"]').fill("fixture");
  await form.locator('input[name="password"]').fill("password123!");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("[data-auth-error]")).toContainText("로그인 요청을 처리하지 못했습니다");
  await expectNoDocumentOverflow(page);
});

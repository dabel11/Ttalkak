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
  const sendButton = page.locator('[data-composer] button[type="submit"]');
  await expect(sendButton).toBeDisabled();
  await composer.fill("   ");
  await expect(sendButton).toBeDisabled();
  await composer.fill("전송할 프롬프트");
  await expect(sendButton).toBeEnabled();
  await composer.fill("");
  await expect(sendButton).toBeDisabled();
  const composerControlSizes = await page.evaluate(() => ({
    input: document.querySelector('[data-composer] textarea[name="prompt"]').getBoundingClientRect().height,
    send: document.querySelector('[data-composer] button[type="submit"]').getBoundingClientRect().height,
  }));
  expect(composerControlSizes.input).toBeGreaterThanOrEqual(44);
  expect(composerControlSizes.send).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".make-side-panel")).toBeHidden();
  const emptyPageDimensions = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(emptyPageDimensions.scrollHeight).toBeLessThanOrEqual(emptyPageDimensions.clientHeight + 1);
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
  const drawer = page.locator(".make-side-panel");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("role", "dialog");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".chat-feed")).toHaveAttribute("inert", "");
  await expect(page.locator(".composer")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "대화 목록 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "대화 목록 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(drawerToggle).toBeFocused();
  await expect(drawer).not.toHaveAttribute("role", "dialog");
  await expect(page.locator(".chat-feed")).not.toHaveAttribute("inert", "");
  const templateToggle = page.locator("[data-toggle-templates]");
  await expect(templateToggle).toHaveAttribute("aria-expanded", "false");
  await expect(templateToggle.locator(".template-toggle-label")).toHaveText("분야 선택");
  await templateToggle.click();
  await expect(templateToggle.locator(".template-toggle-label")).toHaveText("분야 선택");
  await expect(templateToggle.locator(".template-toggle-chevron")).toBeVisible();
  await expect(templateToggle.locator(".template-toggle-mark")).toBeHidden();
  await expect(page.locator(".template-list [data-template]")).toHaveCount(8);
  await page.locator(".template-list [data-template]").first().click();
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).not.toHaveValue("");
  await expect(page.locator('[data-composer] button[type="submit"]')).toBeEnabled();
  await page.locator("[data-toggle-templates]").click();
  await page.locator(".template-custom-action").click();
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-toggle-templates] .template-toggle-label")).toHaveText("분야 선택");
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
  const compactComposer = page.getByRole("textbox", { name: "개선할 프롬프트" });
  await expect(compactComposer).toHaveAttribute("placeholder", "프롬프트를 입력하세요…");
  const compactComposerHeight = await compactComposer.evaluate((element) => element.getBoundingClientRect().height);
  expect(compactComposerHeight).toBeGreaterThanOrEqual(44);
  expect(compactComposerHeight).toBeLessThanOrEqual(45);
  await expectNoDocumentOverflow(page);
});

test("conversation drawer clears modal state when the viewport becomes desktop-sized", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await gotoApp(page);
  await page.getByRole("button", { name: "메뉴" }).click();
  await page.getByRole("button", { name: "Make" }).click();
  const templateToggle = page.locator("[data-toggle-templates]");
  await templateToggle.click();
  await expect(templateToggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "대화 목록", exact: true }).click();
  const drawer = page.locator(".make-side-panel");
  await expect(drawer).toHaveAttribute("aria-modal", "true");

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(drawer).not.toHaveAttribute("role", "dialog");
  await expect(drawer).not.toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".chat-feed")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".make-page")).not.toHaveClass(/drawer-open/);
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".template-list")).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".template-list")).toHaveCount(0);
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

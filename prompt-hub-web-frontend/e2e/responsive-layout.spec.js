const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

async function expectNoDocumentOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("wide Make layout keeps every field on one horizontal row", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await gotoApp(page);
  await page.locator('[data-route="make"]').first().click();

  const layout = await page.locator(".make-template-bar:not(.collapsed)").evaluate((bar) => {
    const toggle = bar.querySelector("[data-toggle-templates]");
    const label = toggle.querySelector(".template-toggle-label");
    const buttons = [...bar.querySelectorAll(".template-list [data-template]")];
    const guidance = bar.querySelector(".template-guidance");
    return {
      display: getComputedStyle(bar).display,
      fieldRows: [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))],
      label: label.textContent.trim(),
      toggleLeft: toggle.getBoundingClientRect().left,
      toggleTop: toggle.getBoundingClientRect().top,
      fieldsBottom: Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom)),
      guidanceTop: guidance.getBoundingClientRect().top,
    };
  });

  expect(layout.display).toBe("grid");
  expect(layout.fieldRows).toHaveLength(1);
  expect(layout.label).toBe("접기");
  expect(layout.guidanceTop).toBeGreaterThanOrEqual(layout.fieldsBottom);
  const toggle = page.locator("[data-toggle-templates]");
  await toggle.click();
  await expect(toggle.locator(".template-toggle-label")).toHaveText("분야 선택");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.waitForTimeout(340);
  const collapsedPosition = await toggle.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  expect(Math.abs(collapsedPosition.left - layout.toggleLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(collapsedPosition.top - layout.toggleTop)).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(toggle.locator(".template-toggle-label")).toHaveText("접기");
  await expectNoDocumentOverflow(page);
});

test("full-screen laptop Make layout keeps fields on the same centered row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoApp(page);
  await page.locator('[data-route="make"]').first().click();

  const layout = await page.locator(".make-template-bar").evaluate((bar) => {
    const list = bar.querySelector(".template-list");
    const buttons = [...list.querySelectorAll("[data-template]")];
    const hero = document.querySelector(".make-empty").getBoundingClientRect();
    const bounds = bar.getBoundingClientRect();
    return {
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      rows: [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))].length,
      centerDelta: Math.abs((bounds.left + bounds.width / 2) - (hero.left + hero.width / 2)),
    };
  });
  expect(layout.columns).toBe(8);
  expect(layout.rows).toBe(1);
  expect(layout.centerDelta).toBeLessThanOrEqual(20);
  await expectNoDocumentOverflow(page);
});

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
  await expect(drawer.locator(".make-drawer-head")).toContainText("대화");
  await expect(drawer).toHaveAttribute("role", "dialog");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".make-main")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "대화 목록 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "대화 목록 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(drawerToggle).toBeFocused();
  await expect(drawer).not.toHaveAttribute("role", "dialog");
  await expect(page.locator(".make-main")).not.toHaveAttribute("inert", "");
  const templateToggle = page.locator("[data-toggle-templates]");
  await expect(templateToggle).toHaveAttribute("aria-expanded", "false");
  await expect(templateToggle.locator(".template-toggle-label")).toHaveText("분야 선택");
  await templateToggle.click();
  await expect(templateToggle.locator(".template-toggle-label")).toHaveText("접기");
  await expect(templateToggle.locator(".template-toggle-chevron")).toBeVisible();
  await expect(templateToggle.locator(".template-toggle-mark")).toHaveCount(0);
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

test("mobile Home keeps search and sorting controls in compact single rows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const layout = await page.evaluate(() => {
    const search = document.querySelector(".search-field").getBoundingClientRect();
    const scope = document.querySelector("[data-search-scope]").getBoundingClientRect();
    const query = document.querySelector("[data-tag-search]").getBoundingClientRect();
    const help = document.querySelector("[data-search-help]").getBoundingClientRect();
    const heading = document.querySelector("#popular-heading").getBoundingClientRect();
    const sort = document.querySelector("[data-popular-sort]").getBoundingClientRect();
    return {
      searchHeight: search.height,
      controlCenters: [scope, query, help].map((rect) => rect.top + rect.height / 2),
      titleCenters: [heading, sort].map((rect) => rect.top + rect.height / 2),
    };
  });

  expect(layout.searchHeight).toBeLessThanOrEqual(53);
  expect(Math.max(...layout.controlCenters) - Math.min(...layout.controlCenters)).toBeLessThanOrEqual(3);
  expect(Math.max(...layout.titleCenters) - Math.min(...layout.titleCenters)).toBeLessThanOrEqual(6);
  await expect(page.locator(".section-icon")).toHaveCount(0);
  await expectNoDocumentOverflow(page);
});

test("mobile Share and My Page keep the primary action and empty state nearby", async ({ page }) => {
  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: [] }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "responsive-fixture-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { isLoggedIn: true, currentUser: "Fixture", currentUserId: 7, currentUserRole: "user", authToken: "responsive-fixture-token", token: "responsive-fixture-token", myPageTab: "library" },
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="share"]').click();
  await expect(page.locator('.share-form textarea[name="prompt"]')).toBeVisible();
  const shareLayout = await page.evaluate(() => {
    const textarea = document.querySelector('.share-form textarea[name="prompt"]').getBoundingClientRect();
    const submit = document.querySelector('.share-form button[type="submit"]').getBoundingClientRect();
    const title = document.querySelector(".share-title");
    const icon = title.querySelector(":scope > span").getBoundingClientRect();
    const heading = title.querySelector("h1").getBoundingClientRect();
    return {
      textareaHeight: textarea.height,
      submitBottom: submit.bottom,
      previewTop: document.querySelector(".share-preview").getBoundingClientRect().top,
      formBottom: document.querySelector(".share-form").getBoundingClientRect().bottom,
      titleDisplay: getComputedStyle(title).display,
      titleCenterDelta: Math.abs((icon.top + icon.height / 2) - (heading.top + heading.height / 2)),
    };
  });
  expect(shareLayout.textareaHeight).toBeLessThanOrEqual(160);
  expect(shareLayout.submitBottom).toBeLessThanOrEqual(844);
  expect(shareLayout.previewTop).toBeGreaterThanOrEqual(shareLayout.formBottom);
  expect(shareLayout.titleDisplay).toBe("flex");
  expect(shareLayout.titleCenterDelta).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="saved"]').click();
  await expect(page.getByRole("heading", { name: "My page" })).toBeVisible();
  await expect(page.locator(".saved-empty")).toBeVisible();
  const savedLayout = await page.evaluate(() => {
    const filters = document.querySelector(".filter-groups").getBoundingClientRect();
    const empty = document.querySelector(".saved-empty").getBoundingClientRect();
    const titles = [...document.querySelectorAll(".saved-page .page-title")];
    return {
      gap: empty.top - filters.bottom,
      height: empty.height,
      filterHeight: filters.height,
      filterDisplay: getComputedStyle(document.querySelector(".filter-groups")).display,
      activeTabBackground: getComputedStyle(document.querySelector(".my-page-tabs .active")).backgroundColor,
      inactiveTabBackground: getComputedStyle(document.querySelector(".my-page-tabs button:not(.active)")).backgroundColor,
      titleDisplays: titles.map((title) => getComputedStyle(title).display),
      titleCenterDeltas: titles.map((title) => {
        const icon = title.querySelector(":scope > span").getBoundingClientRect();
        const heading = title.querySelector("h1").getBoundingClientRect();
        return Math.abs((icon.top + icon.height / 2) - (heading.top + heading.height / 2));
      }),
    };
  });
  expect(savedLayout.gap).toBeLessThanOrEqual(24);
  expect(savedLayout.height).toBeLessThanOrEqual(230);
  expect(savedLayout.filterHeight).toBeLessThanOrEqual(100);
  expect(savedLayout.filterDisplay).toBe("grid");
  expect(savedLayout.activeTabBackground).not.toBe(savedLayout.inactiveTabBackground);
  await expect(page.locator(".my-page-tabs .active")).toHaveAttribute("aria-current", "page");
  expect(savedLayout.titleDisplays.every((display) => display === "flex")).toBe(true);
  expect(Math.max(...savedLayout.titleCenterDeltas)).toBeLessThanOrEqual(2);
  await expectNoDocumentOverflow(page);

  await page.setViewportSize({ width: 1920, height: 900 });
  const wideEmpty = await page.locator(".saved-empty").evaluate((empty) => {
    const pageBounds = document.querySelector(".saved-page").getBoundingClientRect();
    const emptyBounds = empty.getBoundingClientRect();
    return {
      width: emptyBounds.width,
      centerDelta: Math.abs((emptyBounds.left + emptyBounds.width / 2) - (pageBounds.left + pageBounds.width / 2)),
    };
  });
  expect(wideEmpty.width).toBeLessThanOrEqual(1100);
  expect(wideEmpty.centerDelta).toBeLessThanOrEqual(1);
});

test("desktop Share centers its side-by-side form and preview", async ({ page }) => {
  await page.route("http://localhost:8080/**", async (route) => route.fulfill({
    status: route.request().method() === "OPTIONS" ? 204 : 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: route.request().method() === "OPTIONS" ? "" : JSON.stringify({ items: [] }),
  }));
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "share-layout-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { isLoggedIn: true, currentUser: "Fixture", currentUserId: 7, currentUserRole: "user", authToken: "share-layout-token", token: "share-layout-token" },
    }));
  });
  await page.setViewportSize({ width: 1920, height: 900 });
  await gotoApp(page);
  await page.locator('[data-route="share"]').first().click();

  const layout = await page.locator(".share-shell").evaluate((shell) => {
    const form = shell.querySelector(".share-form").getBoundingClientRect();
    const firstInput = shell.querySelector(".share-form input").getBoundingClientRect();
    const preview = shell.querySelector(".share-preview").getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    const pageBounds = shell.closest(".share-page").getBoundingClientRect();
    return {
      columns: getComputedStyle(shell).gridTemplateColumns.split(" ").length,
      previewLeft: preview.left,
      formRight: form.right,
      topDelta: Math.abs(preview.top - firstInput.top),
      centerDelta: Math.abs((shellBounds.left + shellBounds.width / 2) - (pageBounds.left + pageBounds.width / 2)),
    };
  });
  expect(layout.columns).toBe(2);
  expect(layout.previewLeft).toBeGreaterThan(layout.formRight);
  expect(layout.topDelta).toBeLessThanOrEqual(4);
  expect(layout.centerDelta).toBeLessThanOrEqual(1);
  await expectNoDocumentOverflow(page);
});

test("mobile My page offers an inline retry and refreshes after the backend recovers", async ({ page }) => {
  let available = false;
  let holdRecovery = false;
  let releaseRecovery = () => {};
  let recoveryGate = Promise.resolve();
  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (available && holdRecovery) await recoveryGate;
    return route.fulfill({
      status: available ? 200 : 503,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(available ? { items: [] } : { code: "BACKEND_UNAVAILABLE" }),
    });
  });
  await page.addInitScript(() => {
    window.TTALKAK_DEMO_FALLBACK_ENABLED = false;
    localStorage.setItem("ttalkak_access_token", "my-page-retry-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { isLoggedIn: true, currentUser: "Fixture", currentUserId: 7, currentUserRole: "user", authToken: "my-page-retry-token", token: "my-page-retry-token", myPageTab: "library" },
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await page.getByRole("button", { name: "메뉴" }).click();
  await page.locator('#topbar-action-menu [data-route="saved"]').click();

  const prompt = page.locator(".demo-library-prompt.is-error");
  await expect(prompt).toBeVisible();
  const retry = prompt.getByRole("button", { name: "다시 연결" });
  await expect(retry).toBeVisible();
  available = true;
  holdRecovery = true;
  recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });
  await retry.click();
  await expect(page.locator(".demo-library-prompt.is-recovering")).toBeVisible();
  holdRecovery = false;
  releaseRecovery();
  await expect(page.locator(".demo-library-prompt")).toContainText("서버 응답 우선");
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
  await expect(page.locator(".make-main")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".make-page")).not.toHaveClass(/drawer-open/);
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".template-list")).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.locator("[data-toggle-templates]")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".template-panel")).toHaveAttribute("inert", "");
  await expect(page.locator(".template-list")).toBeHidden();
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

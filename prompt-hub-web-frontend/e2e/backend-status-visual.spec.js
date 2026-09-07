const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

const response = (connected) => ({
  status: connected ? 200 : 503,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(connected ? { content: [], totalPages: 1, totalElements: 0 } : { code: "BACKEND_UNAVAILABLE" }),
});

async function stabilizeStatusPopover(page) {
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
    .backend-status-menu { width: 276px !important; }
    .backend-status-menu > .backend-status-popover { position: static !important; width: 276px !important; margin-top: 8px !important; }
  ` });
  const menu = page.locator(".backend-status-menu");
  await expect(menu.locator("summary")).toBeVisible();
  if (!(await menu.evaluate((element) => element.open))) await menu.locator("summary").click();
  await expect(menu.locator(".backend-status-popover")).toBeVisible();
  return menu;
}

async function expectStatusScreenshot(page, name) {
  const menu = await stabilizeStatusPopover(page);
  await expect(menu).toHaveScreenshot(name, { animations: "disabled", maxDiffPixelRatio: 0.08, threshold: 0.3 });
}

test("development backend error popover visual", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = false; });
  await page.route("http://localhost:8080/**", (route) => route.fulfill(response(false)));
  await gotoApp(page);
  await expectStatusScreenshot(page, "backend-status-development-error.png");
});

test("production backend error popover visual", async ({ page }) => {
  await page.addInitScript(() => {
    window.TTALKAK_DEMO_FALLBACK_ENABLED = false;
    window.TTALKAK_API_BASE_URL = "https://api.ttalkak.example";
  });
  await page.route("https://api.ttalkak.example/**", (route) => route.fulfill(response(false)));
  await gotoApp(page);
  await expectStatusScreenshot(page, "backend-status-production-error.png");
});

test("checking backend popover visual", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = false; });
  await page.route("http://localhost:8080/**", () => {});
  await page.goto("/");
  await expectStatusScreenshot(page, "backend-status-checking.png");
});

test("connected backend popover visual", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = false; });
  await page.route("http://localhost:8080/**", (route) => route.fulfill(response(true)));
  await gotoApp(page);
  await expectStatusScreenshot(page, "backend-status-connected.png");
});

test("demo fallback backend popover visual", async ({ page }) => {
  await page.addInitScript(() => { window.TTALKAK_DEMO_FALLBACK_ENABLED = true; });
  await page.route("http://localhost:8080/**", (route) => route.fulfill(response(false)));
  await gotoApp(page);
  await expectStatusScreenshot(page, "backend-status-demo-fallback.png");
});

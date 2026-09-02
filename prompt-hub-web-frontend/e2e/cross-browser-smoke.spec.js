const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("Firefox starts the app and supports core desktop navigation", async ({ page, browserName }, testInfo) => {
  expect(browserName).toBe("firefox");
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "unknown" }));

  try {
  await gotoApp(page);
  await expect(page.locator('[data-route="home"]').first()).toBeVisible();

  const makeRoute = page.locator('[data-route="make"]').first();
  await expect(makeRoute).toBeVisible();
  await expect(makeRoute).toBeEnabled();
  await page.waitForFunction(() => {
    const target = document.querySelector('[data-route="make"]');
    if (!target) return false;
    const box = target.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top === target || target.contains(top);
  });
  await makeRoute.click();
  await expect(page.locator("html")).toHaveAttribute("data-route-runtime", "make:ready");
  await expect(page.locator(".make-page")).toBeVisible();
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeEditable();

  await page.locator('[data-open-auth="login"]').first().click();
  await expect(page.locator("[data-auth-form]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-auth-form]")).toHaveCount(0);
  expect(diagnostics.pageErrors).toEqual([]);
  const unexpectedFailures = diagnostics.failedRequests.filter(({ url, error }) => {
    const target = new URL(url);
    return !(target.origin === "http://localhost:8080" && target.pathname.startsWith("/api/") && /CONNECTION_REFUSED/i.test(error));
  });
  expect(unexpectedFailures).toEqual([]);
  } finally {
    await testInfo.attach("firefox-runtime-diagnostics", { body: Buffer.from(JSON.stringify(diagnostics, null, 2)), contentType: "application/json" });
  }
});

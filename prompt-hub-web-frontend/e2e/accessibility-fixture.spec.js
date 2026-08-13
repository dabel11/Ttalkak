const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");
const AxeBuilder = require("@axe-core/playwright").default;

async function expectAccessible(page, label) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target.join(" ")) }));
  expect(violations, `${label} accessibility violations`).toEqual([]);
}

test("Home, authentication, Share, Make and modal components satisfy WCAG A/AA automated rules", async ({ page }) => {
  await gotoApp(page);
  await expectAccessible(page, "Home");

  await page.locator('[data-open-auth="login"]').click();
  await expect(page.locator("[data-auth-form]")).toBeVisible();
  await expectAccessible(page, "Login");

  await page.locator('[data-open-auth="signup"]').click();
  await expect(page.locator('[data-auth-form] input[name="nickname"]')).toBeVisible();
  await expectAccessible(page, "Signup");
  await page.locator("[data-close-auth]").first().click();

  await page.locator('[data-route="share"]').first().click();
  await expect(page.locator(".share-page")).toBeVisible();
  await expectAccessible(page, "Share");

  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".make-page")).toBeVisible();
  await expectAccessible(page, "Make");
});

test("confirmation modal opens through a real folder workflow and restores focus", async ({ page }) => {
  let folders = [];
  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/make/folders" && request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: folders }), headers: { "access-control-allow-origin": "*" } });
    }
    if (pathname === "/api/make/folders" && request.method() === "POST") {
      folders = [{ id: 901, name: request.postDataJSON().name }];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(folders[0]), headers: { "access-control-allow-origin": "*" } });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }), headers: { "access-control-allow-origin": "*" } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "modal-fixture-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { isLoggedIn: true, currentUser: "Fixture", currentUserId: 8, currentUserRole: "user", authToken: "modal-fixture-token", token: "modal-fixture-token" },
    }));
  });
  await gotoApp(page);
  await page.locator('[data-route="make"]').click();
  await page.locator("[data-show-folder-form]").click();
  await page.locator('[data-folder-create-form] input[name="folderName"]').fill("접근성 폴더");
  await page.locator('[data-folder-create-form] button[type="submit"]').click();
  const folder = page.locator("[data-folder-item]").filter({ hasText: "접근성 폴더" });
  await folder.hover();
  await folder.locator("[data-folder-menu]").click();
  await folder.locator("[data-delete-folder]").click();
  await expect(page.locator(".confirm-modal")).toBeVisible();
  await expect(page.locator(".confirm-modal [data-confirm-action]")).toBeFocused();
  await expectAccessible(page, "Confirmation modal");
  await page.keyboard.press("Escape");
  await expect(page.locator(".confirm-modal")).toHaveCount(0);
  await expect(folder.locator("[data-folder-menu]")).toBeFocused();
});

test("Saved fixture satisfies WCAG A/AA automated rules", async ({ page }) => {
  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }), headers: { "access-control-allow-origin": "*" } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "saved-fixture-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { route: "saved", isLoggedIn: true, currentUser: "Fixture", currentUserId: 7, currentUserRole: "user", authToken: "saved-fixture-token", token: "saved-fixture-token", myPageTab: "library" },
    }));
  });
  await gotoApp(page);
  await page.locator('[data-route="saved"]').click();
  await expect(page.locator(".saved-page")).toBeVisible();
  await expectAccessible(page, "Saved");
});

test("administrator fixture satisfies WCAG A/AA automated rules", async ({ page }) => {
  await page.route("http://localhost:8080/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }), headers: { "access-control-allow-origin": "*" } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("ttalkak_access_token", "admin-fixture-token");
    localStorage.setItem("prompt_hub_web_state_v2", JSON.stringify({
      popularPrompts: [], savedPrompts: [],
      state: { route: "admin", isLoggedIn: true, currentUser: "Admin", currentUserId: 1, currentUserRole: "admin", authToken: "admin-fixture-token", token: "admin-fixture-token", adminMode: true, adminTab: "reports" },
    }));
  });
  await gotoApp(page);
  await expect(page.locator(".admin-page")).toBeVisible();
  await expectAccessible(page, "Admin");
});

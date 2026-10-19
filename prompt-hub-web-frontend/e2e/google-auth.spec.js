const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

test("Google signup, logout and relogin preserve the same real backend identity", async ({ page }) => {
  let created = false;
  const user = { id: 57, userId: "google_fixture", nickname: "Google Fixture", role: "user", provider: "google", active: true };
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "content-type": "application/json" };
  await page.addInitScript(() => {
    window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(host) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Google 계정 선택";
        button.onclick = () => this.callback({ credential: "fixture-google-credential" });
        host.append(button);
      },
    } } };
  });
  await page.route("http://localhost:8080/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
    const pathname = new URL(request.url()).pathname;
    let body = { items: [] };
    let status = 200;
    if (pathname === "/api/auth/google/config") body = { clientId: "fixture.apps.googleusercontent.com" };
    if (pathname === "/api/auth/google") {
      const payload = request.postDataJSON();
      expect(payload.credential).toBe("fixture-google-credential");
      if (!created && (!payload.agreeTerms || !payload.agreePrivacy)) {
        status = 400;
        body = { code: "AUTH_TERMS_REQUIRED", message: "Google 가입 전 약관에 동의해주세요." };
      } else {
        body = { accessToken: "fixture-real-google-session", user, newMember: !created };
        created = true;
      }
    }
    if (pathname === "/api/auth/me") body = { user };
    if (pathname === "/api/auth/logout") body = { ok: true };
    if (pathname === "/api/auth/withdraw") {
      expect(request.method()).toBe("DELETE");
      expect(request.postDataJSON().googleCredential).toBe("fixture-google-credential");
      expect(request.postDataJSON().password).toBe("");
      body = { ok: true };
    }
    return route.fulfill({ status, headers, body: JSON.stringify(body) });
  });
  await gotoApp(page);
  await page.locator('[data-open-auth="login"]').click();
  await page.getByRole("button", { name: "Google 계정 선택" }).click();
  await expect(page.locator('[data-auth-form] input[name="terms"]')).toBeVisible();
  await expect(page.locator('[data-auth-error]')).toContainText("약관");
  await page.locator('input[name="terms"]').check();
  await page.locator('input[name="privacy"]').check();
  await page.getByRole("button", { name: "Google 계정 선택" }).click();
  await expect(page.locator(".topbar-account > summary")).toContainText("Google Fixture");
  await page.reload();
  await expect(page.locator(".topbar-account > summary")).toContainText("Google Fixture");
  await page.locator(".topbar-account > summary").click();
  await page.locator("[data-logout]").click();
  await page.locator("[data-confirm-action]").click();
  await page.locator('[data-open-auth="login"]').click();
  await page.getByRole("button", { name: "Google 계정 선택" }).click();
  await expect(page.locator(".topbar-account > summary")).toContainText("Google Fixture");
  expect(await page.evaluate(() => localStorage.getItem("ttalkak_access_token"))).toBe("fixture-real-google-session");
  await page.locator(".topbar-account > summary").click();
  await page.locator('[data-open-auth="withdraw"]').click();
  await expect(page.locator('[data-auth-form] input[name="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Google 계정 선택" }).click();
  await expect(page.locator(".confirm-modal")).toBeVisible();
  await page.locator("[data-confirm-action]").click();
  await expect(page.locator('[data-open-auth="login"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ttalkak_access_token"))).toBeNull();
});

const { test, expect } = require("@playwright/test");

test("reviewer can read the service, prices, delivery and refund terms anonymously", async ({ page }) => {
  const response = await page.goto("/service.html");
  expect(response.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI 프롬프트 개선 웹서비스");
  await expect(page.getByRole("table")).toContainText("3,900원");
  await expect(page.getByRole("table")).toContainText("5,900원");
  await expect(page.getByRole("table")).toContainText("9,900원");
  await expect(page.getByText(/실물 배송은 없으며 이용기간은 결제일 기준 1개월/)).toBeVisible();
  await expect(page.getByText(/유료 구독은 판매하지 않습니다/)).toBeVisible();
  await page.locator("main").getByRole("link", { name: "구독 해지·환불 정책", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("구독 해지·환불 정책");
  await page.goto("/terms.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이용약관");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/service.html", "/terms.html"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("policy and contact navigation remains outside the guest/member SPA rendering root", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator('body > footer[aria-label="서비스 정책 및 문의"]');
  await expect(footer.getByRole("link", { name: "개인정보 처리 안내" })).toHaveAttribute("href", "/privacy-policy.html");
  await expect(footer.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms.html");
  await expect(footer.getByRole("link", { name: "문의하기" })).toHaveAttribute("href", /^mailto:/);
  // #app is re-rendered on route changes and authentication; the policy footer is its sibling.
  expect(await page.evaluate(() => document.querySelector("#app")?.contains(document.querySelector('footer[aria-label="서비스 정책 및 문의"]')))).toBe(false);
});

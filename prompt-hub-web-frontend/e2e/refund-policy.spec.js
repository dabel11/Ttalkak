const { test, expect } = require("@playwright/test");

test("refund policy is directly accessible without login and links back to plans", async ({ page }) => {
  const response = await page.goto("/refund-policy.html");
  expect(response.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "구독 해지·환불 정책" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("이용 여부와 관계없이");
  await expect(page.getByRole("link", { name: "← 요금제 안내" })).toHaveAttribute("href", "/pricing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("refund guidance provides a direct contact link without a business-details footer", async ({ page }) => {
  await page.goto("/refund-policy.html");
  const footer = page.locator('footer[aria-label="서비스 정책 및 문의"]');
  await expect(footer.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms.html");
  await expect(footer.getByRole("link", { name: "개인정보 처리 안내" })).toHaveAttribute("href", "/privacy-policy.html");
  await expect(footer.getByRole("link", { name: "문의하기" })).toHaveAttribute("href", /^mailto:/);
  await expect(page.getByRole("link", { name: "이메일로 문의하기" })).toHaveAttribute("href", /^mailto:/);
  await expect(page.locator('footer[aria-label="사업자 정보"]')).toHaveCount(0);
});

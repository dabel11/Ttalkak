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

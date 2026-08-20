const { expect } = require("@playwright/test");

async function gotoApp(page, path = "/") {
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    diagnostics.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "unknown failure"}`);
  });
  await page.goto(path);
  // Parallel CI workers can delay module evaluation without indicating an app failure.
  try {
    await expect(page.locator("html")).toHaveAttribute("data-ttalkak-ready", "true", { timeout: 15_000 });
  } catch (error) {
    const pageExcerpt = await page.locator("body").innerText().then((text) => text.trim().slice(0, 500)).catch(() => "");
    throw new Error([
      error.message,
      `Browser console errors: ${diagnostics.consoleErrors.join(" | ") || "none"}`,
      `Page errors: ${diagnostics.pageErrors.join(" | ") || "none"}`,
      `Failed requests: ${diagnostics.failedRequests.join(" | ") || "none"}`,
      `Page excerpt: ${pageExcerpt || "empty"}`,
    ].join("\n"), { cause: error });
  }
}

module.exports = { gotoApp };

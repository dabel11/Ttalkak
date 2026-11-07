const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderPublicMerchant } = require("../../scripts/render-public-merchant.cjs");

const webRoot = path.resolve(__dirname, "..");
const pages = ["index.html", "service.html", "terms.html", "refund-policy.html", "privacy-policy.html", "merchant-review.html"];
const paths = ["/service.html", "/pricing", "/refund-policy.html", "/terms.html", "/privacy-policy.html"];

test("policy navigation is preserved but business details are not rendered", () => {
  const input = '<main>Service</main><!-- TTALKAK_PUBLIC_MERCHANT -->';
  const output = renderPublicMerchant(input);
  assert.ok(output.startsWith("<main>Service</main>"));
  assert.ok(output.includes('aria-label="서비스 정책"'));
  for (const destination of paths) assert.ok(output.includes(`href="${destination}"`));
  assert.ok(!output.includes("사업자등록번호"));
  assert.ok(!output.includes('aria-label="사업자 정보"'));
  assert.ok(!output.includes("TTALKAK_PUBLIC_MERCHANT"));
});

test("all public pages expose the policy menu and the existing working contact link", () => {
  const privacy = fs.readFileSync(path.join(webRoot, "privacy-policy.html"), "utf8");
  const existingMailto = privacy.match(/href="(mailto:[^"]+)"/)?.[1];
  assert.ok(existingMailto, "Privacy policy must provide an actionable email contact.");
  for (const name of pages) {
    const html = renderPublicMerchant(fs.readFileSync(path.join(webRoot, name), "utf8"));
    assert.ok(html.includes('aria-label="서비스 정책 및 문의"'), name);
    for (const destination of paths) assert.ok(html.includes(`href="${destination}"`), `${name}: ${destination}`);
    assert.ok(html.includes(`href="${existingMailto}"`), `${name}: support link`);
    assert.ok(!html.includes('aria-label="사업자 정보"'), name);
    assert.ok(!html.includes("<dt>사업자등록번호</dt>"), name);
    assert.ok(!html.includes("TTALKAK_PUBLIC_MERCHANT"), name);
  }
});

test("policy navigation is outside the SPA root so it remains available after sign-in renders", () => {
  const html = renderPublicMerchant(fs.readFileSync(path.join(webRoot, "index.html"), "utf8"));
  const rootEnd = html.indexOf('<div id="app"></div>') + '<div id="app"></div>'.length;
  assert.ok(rootEnd > 0);
  assert.ok(html.indexOf('<footer aria-label="서비스 정책 및 문의"') > rootEnd);
});

test("missing or duplicate footer marker fails the build", () => {
  for (const html of ["<body></body>", "<!-- TTALKAK_PUBLIC_MERCHANT --><!-- TTALKAK_PUBLIC_MERCHANT -->"]) {
    assert.throws(() => renderPublicMerchant(html), /exactly one merchant footer marker/);
  }
});

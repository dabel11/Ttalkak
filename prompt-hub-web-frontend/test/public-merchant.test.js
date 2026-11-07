const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderPublicMerchant } = require("../../scripts/render-public-merchant.cjs");

test("merchant footer placeholder is removed without exposing operator details", () => {
  const input = '<main>Service</main><!-- TTALKAK_PUBLIC_MERCHANT -->';
  assert.equal(renderPublicMerchant(input), "<main>Service</main>");
});

test("no merchant-information footer is injected on any public page", () => {
  const webRoot = path.resolve(__dirname, "..");
  for (const name of ["index.html", "service.html", "terms.html", "refund-policy.html", "privacy-policy.html", "merchant-review.html"]) {
    const html = renderPublicMerchant(fs.readFileSync(path.join(webRoot, name), "utf8"));
    assert.ok(!html.includes('aria-label="사업자 정보"'), name);
    assert.ok(!html.includes("<dt>사업자등록번호</dt>"), name);
    assert.ok(!html.includes("TTALKAK_PUBLIC_MERCHANT"), name);
  }
});

test("missing or duplicate marker remains a build-time error", () => {
  for (const html of ["<body></body>", "<!-- TTALKAK_PUBLIC_MERCHANT --><!-- TTALKAK_PUBLIC_MERCHANT -->"]) {
    assert.throws(() => renderPublicMerchant(html), /exactly one merchant footer marker/);
  }
});

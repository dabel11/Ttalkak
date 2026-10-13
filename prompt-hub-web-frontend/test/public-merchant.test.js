const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { renderPublicMerchant } = require("../../scripts/render-public-merchant.cjs");

test("public merchant rendering escapes operator data and does not invent missing contacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ttalkak-merchant-"));
  try {
    fs.writeFileSync(path.join(root, "public-merchant.json"), JSON.stringify({ businessName: '<img src=x onerror="alert(1)">', representative: "대표", businessNumber: "000-00-00000", address: "", email: "", phone: "" }));
    const html = renderPublicMerchant("<!-- TTALKAK_PUBLIC_MERCHANT -->", root);
    assert.ok(html.includes("&lt;img"));
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("확인 후 게시 예정"));
    assert.ok(html.includes("유료 결제는 제공하지 않습니다"));
    assert.ok(!html.includes("@gmail.com"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("footer is shared across built application and public review pages", () => {
  const webRoot = path.resolve(__dirname, "..");
  for (const name of ["index.html", "service.html", "terms.html", "refund-policy.html"]) {
    const html = renderPublicMerchant(fs.readFileSync(path.join(webRoot, name), "utf8"), webRoot);
    assert.ok(html.includes('aria-label="사업자 정보"'));
    assert.ok(html.includes("딸깍"));
    assert.ok(html.includes('href="/service.html"'));
    assert.ok(html.includes('href="/refund-policy.html"'));
    assert.ok(!html.includes("TTALKAK_PUBLIC_MERCHANT"));
  }
});

test("missing or duplicate footer marker fails the build instead of silently losing seller information", () => {
  const webRoot = path.resolve(__dirname, "..");
  for (const html of ["<body></body>", "<!-- TTALKAK_PUBLIC_MERCHANT --><!-- TTALKAK_PUBLIC_MERCHANT -->"]) {
    assert.throws(() => renderPublicMerchant(html, webRoot), /exactly one merchant footer marker/);
  }
});

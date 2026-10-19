const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderBillingPreview } = require("../../scripts/render-billing-preview.cjs");

test("normal builds do not enable the payment preview", () => {
  const html = "<html><head></head><body></body></html>";
  assert.equal(renderBillingPreview(html), html);
  assert.equal(renderBillingPreview(html, "false"), html);
  assert.match(renderBillingPreview(html, "true"), /window.TTALKAK_BILLING_PREVIEW_ENABLED=true/);
});

test("invalid review flags and malformed review pages fail closed", () => {
  for (const flag of ["TRUE", "1", "", "false;alert(1)"]) {
    assert.throws(() => renderBillingPreview("<head>", flag), /Invalid/);
  }
  for (const html of ["<body>", "<head><head>"]) {
    assert.throws(() => renderBillingPreview(html, "true"), /exactly one/);
  }
});

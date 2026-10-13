function renderBillingPreview(html, flag = "false") {
  if (!["true", "false"].includes(flag)) throw new Error("Invalid TTALKAK_BILLING_PREVIEW_ENABLED; expected true or false.");
  if (flag === "false") return html;
  if (html.split("<head>").length !== 2) throw new Error("Review preview requires exactly one HTML head.");
  return html.replace("<head>", "<head><script>window.TTALKAK_BILLING_PREVIEW_ENABLED=true;</script>");
}

module.exports = { renderBillingPreview };

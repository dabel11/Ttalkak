// The public merchant footer is intentionally disabled.
// Keep validating each page's placeholder until all templates are migrated.
const MARKER = "<!-- TTALKAK_PUBLIC_MERCHANT -->";

function renderPublicMerchant(html) {
  if (html.split(MARKER).length !== 2) {
    throw new Error("Public page requires exactly one merchant footer marker.");
  }
  return html.replace(MARKER, "");
}

module.exports = { renderPublicMerchant };

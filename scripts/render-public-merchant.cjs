// Render the same policy navigation on the SPA and on standalone public pages.
// This is intentionally separate from the removed merchant-information block.
const MARKER = "<!-- TTALKAK_PUBLIC_MERCHANT -->";
const SUPPORT_CONTACT = "mailto:trying_turtle@naver.com";

function renderPublicMerchant(html) {
  if (html.split(MARKER).length !== 2) {
    throw new Error("Public page requires exactly one merchant footer marker.");
  }
  const footer = `<footer aria-label="서비스 정책 및 문의" style="max-width:960px;margin:32px auto 0;padding:24px 20px;border-top:1px solid #ddd;color:#444;font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere">
<nav aria-label="서비스 정책" style="display:flex;flex-wrap:wrap;gap:16px">
<a href="/service.html">서비스·이용 안내</a>
<a href="/pricing">요금제</a>
<a href="/refund-policy.html">구독 해지·환불 정책</a>
<a href="/terms.html">이용약관</a>
<a href="/privacy-policy.html">개인정보 처리 안내</a>
<a href="${SUPPORT_CONTACT}">문의하기</a>
</nav>
</footer>`;
  return html.replace(MARKER, footer);
}

module.exports = { renderPublicMerchant };

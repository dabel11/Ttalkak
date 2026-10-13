const fs = require("node:fs");
const path = require("node:path");

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function merchantFooter(webRoot) {
  const merchant = JSON.parse(fs.readFileSync(path.join(webRoot, "public-merchant.json"), "utf8"));
  const fields = { businessName: "상호", representative: "대표자", businessNumber: "사업자등록번호", address: "사업장 주소", email: "고객문의 이메일", phone: "고객문의 전화번호", mailOrderNumber: "통신판매업 신고번호" };
  const required = ["businessName", "representative", "businessNumber", "address", "email", "phone"];
  for (const key of Object.keys(merchant)) {
    if (!Object.hasOwn(fields, key) || typeof merchant[key] !== "string") throw new Error(`Invalid public merchant field: ${key}`);
  }
  const complete = required.every((key) => Boolean(merchant[key]?.trim()));
  const rows = Object.entries(fields).map(([key, label]) => `<div><dt>${label}</dt><dd>${escape(merchant[key]?.trim() || "확인 후 게시 예정")}</dd></div>`).join("");
  return `<footer aria-label="사업자 정보" style="max-width:960px;margin:32px auto 0;padding:24px 20px;border-top:1px solid #ddd;color:#444;font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere">
<nav aria-label="서비스 정책" style="display:flex;flex-wrap:wrap;gap:16px"><a href="/service.html">서비스·이용 안내</a><a href="/pricing">요금제</a><a href="/refund-policy.html">해지·환불 정책</a><a href="/terms.html">이용약관</a></nav>
<dl style="display:grid;gap:8px;margin:16px 0">${rows}</dl>
${complete ? "" : '<p role="status">사업자 공개 정보 등록을 준비 중입니다. 유료 결제는 제공하지 않습니다.</p>'}
</footer>`;
}

function renderPublicMerchant(html, webRoot) {
  return html.replace("<!-- TTALKAK_PUBLIC_MERCHANT -->", merchantFooter(webRoot));
}

module.exports = { merchantFooter, renderPublicMerchant };

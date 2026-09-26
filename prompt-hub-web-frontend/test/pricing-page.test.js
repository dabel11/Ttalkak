const test = require("node:test");
const assert = require("node:assert/strict");

let PricingPageView;
test.before(async () => ({ PricingPageView } = (await import("../src/renderers/pages/pricing-page.mjs")).renderers));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

test("guest pricing asks for login without claiming FREE as the current plan", () => {
  const html = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "GUEST", known: false },
    isLoggedIn: false,
    usageSummary: "체험",
  });
  assert.match(html, /로그인하고 시작하기/);
  assert.doesNotMatch(html, /현재 요금제/);
});

test("FREE pricing exposes upgrade while PRO cancellation keeps management available", () => {
  const freeHtml = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "FREE", known: true },
    isLoggedIn: true,
    usageSummary: "FREE · 오늘 3/10회 남음",
  });
  assert.match(freeHtml, /data-subscription-checkout/);
  assert.match(freeHtml, /FREE · 오늘 3\/10회 남음/);
  assert.match(freeHtml, /기본 사용량 제공/);
  assert.match(freeHtml, /FREE보다 넉넉한 사용량/);
  assert.doesNotMatch(freeHtml, /하루 (10|100)회 첨삭/);

  const proHtml = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "PRO", status: "CANCELED", known: true, cancelAtPeriodEnd: true, currentPeriodEnd: "2026-10-25" },
    isLoggedIn: true,
    usageSummary: "PRO · 오늘 82/100회 남음",
  });
  assert.match(proHtml, /data-subscription-manage/);
  assert.match(proHtml, /2026-10-25까지 PRO를 이용/);
  assert.doesNotMatch(proHtml, /data-subscription-checkout/);
});

test("billing and expired subscription states expose the correct recovery action", () => {
  const pastDueHtml = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "PRO", status: "PAST_DUE", known: true },
    isLoggedIn: true,
    usageSummary: "PRO · 결제 확인 필요",
  });
  assert.match(pastDueHtml, /결제 상태를 확인해야 합니다/);
  assert.match(pastDueHtml, /data-subscription-manage/);
  assert.doesNotMatch(pastDueHtml, /data-subscription-checkout/);

  const expiredHtml = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "PRO", status: "EXPIRED", known: true },
    isLoggedIn: true,
    usageSummary: "FREE · PRO 이용 종료",
  });
  assert.match(expiredHtml, /PRO 이용 기간이 종료/);
  assert.match(expiredHtml, /data-subscription-checkout/);
  assert.doesNotMatch(expiredHtml, /data-subscription-manage/);
});

test("subscription actions communicate pending state and prevent another click", () => {
  const html = PricingPageView({ escapeHtml }, {
    entitlement: { plan: "FREE", status: "ACTIVE", known: true },
    isLoggedIn: true,
    subscriptionActionPending: "checkout",
    usageSummary: "FREE · 오늘 3/10회 남음",
  });
  assert.match(html, /data-subscription-checkout disabled aria-busy="true"/);
  assert.match(html, /결제 화면 여는 중…/);
});

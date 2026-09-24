"use strict";
import { hasActiveProAccess } from "../../usage/usage-entitlement.mjs";

function PricingPageView(ctx, data) {
  const { escapeHtml } = ctx;
  const { entitlement, isLoggedIn, subscriptionActionPending = "", usageSummary } = data;
  const status = String(entitlement?.status || "UNKNOWN").toUpperCase();
  const isPro = hasActiveProAccess(entitlement);
  const isPastDue = entitlement?.plan === "PRO" && status === "PAST_DUE";
  const busy = Boolean(subscriptionActionPending);
  const busyAttributes = busy ? ' disabled aria-busy="true"' : "";
  const cancelNotice = isPro && entitlement?.cancelAtPeriodEnd
    ? `<p class="pricing-status-warning">현재 결제 기간이 끝나는 ${escapeHtml(entitlement.currentPeriodEnd || "예정일")}까지 PRO를 이용할 수 있습니다.</p>`
    : isPastDue
      ? `<p class="pricing-status-warning" role="alert">결제 상태를 확인해야 합니다. 결제 관리에서 결제 수단을 확인해주세요.</p>`
      : entitlement?.plan === "PRO" && ["CANCELED", "EXPIRED"].includes(status)
        ? `<p class="pricing-status-warning">PRO 이용 기간이 종료되어 FREE 요금제로 전환되었습니다.</p>`
        : "";
  const action = !isLoggedIn
    ? `<button class="primary-btn pricing-action" type="button" data-open-auth="login">로그인하고 시작하기</button>`
    : isPro || isPastDue
      ? `<button class="secondary-btn pricing-action" type="button" data-subscription-manage${busyAttributes}>${subscriptionActionPending === "portal" ? "결제 관리 여는 중…" : "결제 관리"}</button>`
      : `<button class="primary-btn pricing-action" type="button" data-subscription-checkout${busyAttributes}>${subscriptionActionPending === "checkout" ? "결제 화면 여는 중…" : "PRO 시작하기"}</button>`;

  return `
    <section class="pricing-page" aria-labelledby="pricing-title">
      <header class="pricing-hero">
        <span class="pricing-eyebrow">요금제</span>
        <h1 id="pricing-title">필요한 만큼 프롬프트를 다듬으세요</h1>
        <p>모든 요금제는 같은 첨삭 품질을 제공합니다. 하루 사용량만 달라집니다.</p>
      </header>
      <div class="pricing-grid">
        <article class="pricing-card ${isLoggedIn && !isPro && !isPastDue ? "current" : ""}">
          <div><span>FREE</span><strong>₩0</strong><small>계속 무료</small></div>
          <p>가볍게 시작하고 매일 다시 사용할 수 있습니다.</p>
          <ul><li>하루 10회 첨삭</li><li>웹과 확장 프로그램에서 사용</li><li>대화와 보관함 저장</li></ul>
          ${!isPro && !isPastDue && isLoggedIn ? `<span class="pricing-current-badge">현재 요금제 · ${escapeHtml(usageSummary)}</span>` : ""}
        </article>
        <article class="pricing-card featured ${isPro || isPastDue ? "current" : ""}">
          <div><span>PRO</span><strong>₩4,900</strong><small>월</small></div>
          <p>더 많은 프롬프트를 꾸준히 다듬는 사용자를 위한 요금제입니다.</p>
          <ul><li>하루 100회 첨삭</li><li>FREE와 동일한 첨삭 품질</li><li>언제든 결제 관리 및 취소</li></ul>
          ${isPro ? `<span class="pricing-current-badge">현재 요금제 · ${escapeHtml(usageSummary)}</span>` : ""}
          ${action}
          ${cancelNotice}
        </article>
      </div>
      <p class="pricing-footnote">사용량은 매일 자정(KST)에 초기화됩니다. 취소 후에도 현재 결제 기간이 끝날 때까지 PRO 한도가 유지됩니다.</p>
    </section>
  `;
}

export const renderers = Object.freeze({ PricingPageView });

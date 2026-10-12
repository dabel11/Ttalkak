import { formatTokenCount } from "./usage-model.mjs";
import { readRuntimeConfig } from "../runtime/runtime-config.mjs";

export function SubscriptionSummaryView({ state, escapeHtml, formatShortDate }, snapshot) {
  if (!state.isLoggedIn || !readRuntimeConfig().billingPreviewEnabled) return "";
  const { usage, billing, busy, message, errorMessage } = snapshot;
  const date = (value) => value ? escapeHtml(formatShortDate(value)) : "확인 중";
  const status = String(billing?.paymentStatus || "").toUpperCase();
  const labels = { NOT_REGISTERED: "미등록", ACTIVE: "완료", PENDING: "확인 중", FAILED: "실패", EXPIRED: "기간 만료" };
  const tiers = ["FREE", "LIGHT", "STANDARD", "PRO"];
  const planIndex = tiers.indexOf(usage?.plan);
  const nextTier = planIndex >= 0 && planIndex < tiers.length - 1 ? tiers[planIndex + 1] : null;
  const ratio = usage?.requestLimit > 0 ? (usage.requests || 0) / usage.requestLimit : 0;
  const suggestUpgrade = Boolean(nextTier && usage?.requestQuotaEnforced
    && ratio >= 0.7 && !usage.usageBlocked);
  return `<section class="subscription-card" aria-labelledby="subscription-heading">
    <div class="subscription-head"><h2 id="subscription-heading">내 요금제·사용량</h2><button class="secondary-button" type="button" data-open-billing>구독·결제 관리</button></div>
    ${busy ? '<p role="status">사용량을 확인하는 중입니다…</p>' : ""}
    ${errorMessage ? `<p class="billing-alert" role="alert">${escapeHtml(errorMessage)}</p><button class="secondary-button" type="button" data-subscription-refresh>다시 확인</button>` : ""}
    ${message ? `<p class="billing-success" role="status">${escapeHtml(message)}</p>` : ""}
    ${usage ? `<dl class="subscription-details">
      <div><dt>현재 요금제</dt><dd>${usage.plan}</dd></div>
      <div><dt>사용한 토큰</dt><dd>${formatTokenCount(usage.totalTokens)}</dd></div>
      <div><dt>남은 토큰</dt><dd>${usage.remainingTokens == null ? "한도 설정 전" : formatTokenCount(usage.remainingTokens)}</dd></div>
      ${usage.requestQuotaEnforced && usage.requestLimit != null ? `<div><dt>AI 요청 횟수</dt><dd>${usage.requests} / ${usage.requestLimit}회</dd></div><div><dt>남은 AI 요청</dt><dd>${usage.requestRemaining}회</dd></div>` : ""}
      <div><dt>사용량 초기화</dt><dd>${date(usage.resetsAt || usage.periodEnd)}</dd></div>
      ${billing ? `<div><dt>결제 상태</dt><dd>${labels[status] || "확인 중"}</dd></div><div><dt>자동 갱신</dt><dd>${billing.autoRenew ? "사용" : "중지"}</dd></div>` : ""}
      ${billing?.nextChargeAt ? `<div><dt>다음 결제일</dt><dd>${date(billing.nextChargeAt)}</dd></div>` : ""}
    </dl>
    ${usage ? (usage.usageBlocked ? '<p class="billing-alert" role="status">사용량 확인 중 AI 요청이 제한됩니다.</p>'
      : !usage.usageAvailable ? '<p role="status">과거 요청 사용량 확인 필요</p>'
        : usage.requestLimitReached ? '<p class="billing-alert" role="status">이번 기간의 AI 요청 횟수를 모두 사용했습니다.</p>'
          : usage.limitReached && usage.quotaEnforced ? '<p class="billing-alert" role="status">이번 기간의 토큰을 모두 사용했습니다.</p>' : "") : ""}
    ${usage && !usage.quotaEnforced ? '<p class="pricing-note">사용량 제한은 적용 전입니다.</p>' : ""}` : ""}
    ${suggestUpgrade ? `<aside class="pricing-upgrade-tip" aria-label="더 넉넉한 요금제 추천"><strong>${escapeHtml(nextTier)}로 넉넉하게 이용해 보세요.</strong><p>70% 사용. 추가 결제액을 확인하세요.</p><button type="button" class="secondary-button" data-open-billing data-selected-plan="${nextTier}">추가 결제 금액 확인</button></aside>` : ""}
  </section>`;
}

export function PricingPageView(ctx, snapshot) {
  if (!readRuntimeConfig().billingPreviewEnabled) return '<section class="pricing-page"><h1>요금제 준비 중</h1><p>정식 출시 후 안내하겠습니다.</p></section>';
  const { state } = ctx;
  const plan = snapshot.usage?.plan;
  const paidPlans = [
    { id: "LIGHT", price: "3,900", requests: 30 },
    { id: "STANDARD", price: "5,900", requests: 70, badge: "추천 요금제" },
    { id: "PRO", price: "9,900", requests: 150, badge: "더 넉넉한 사용량" },
  ];
  const paidCards = paidPlans.map(({ id, price, requests, badge }) => `
      <article class="pricing-plan pricing-${id.toLowerCase()}">${badge ? `<p class="pricing-badge">${badge}</p>` : ""}<h2>${id}</h2><p class="pricing-price">${price}원 <span>/ 월</span></p><p>월 ${requests}회 개선 요청</p>
        <ul><li>원클릭 개선·대화형 개선</li><li>프롬프트 저장</li><li>${id === "PRO" ? "더 넉넉한 AI 사용량" : "동일한 AI 개선 품질"}</li></ul>
        <button class="primary-button" type="button" ${state.isLoggedIn ? `data-open-billing data-selected-plan="${id}"` : `data-start-pro data-selected-plan="${id}"`}>${id === "PRO" ? (plan === "PRO" ? "구독 관리하기" : "테스트 구독 확인") : "테스트 구독 신청"}</button>
        ${plan === id ? '<p class="pricing-current">현재 요금제</p>' : ""}
      </article>`).join("");
  return `<section class="pricing-page" aria-labelledby="pricing-heading">
    <div class="pricing-intro"><p class="pricing-eyebrow">TTALKAK 요금제</p><h1 id="pricing-heading">필요한 만큼, 더 편하게 개선하세요.</h1>
    </div>
    <div class="pricing-grid">
      <article class="pricing-plan"><h2>FREE</h2><p class="pricing-price">0원 <span>/ 월</span></p><p>월 10회 AI 개선</p>
        <ul><li>원클릭 개선·대화형 개선</li><li>프롬프트 저장</li><li>동일한 AI 개선 품질</li></ul>
        <button class="secondary-button" type="button" data-route="make">${state.isLoggedIn ? "첨삭 시작하기" : "무료로 체험하기"}</button>
        ${plan === "FREE" ? '<p class="pricing-current">현재 요금제</p>' : ""}
      </article>
      ${paidCards}
    </div>
    <p class="pricing-note">비회원은 총 3회 체험, 저장은 로그인 후 가능합니다.</p>
    <p class="pricing-note">유료 요금제는 테스트 결제 전용이며 실제 청구되지 않습니다.</p>
    ${SubscriptionSummaryView(ctx, snapshot)}
    <section class="pricing-policy" aria-labelledby="pricing-policy-heading"><h2 id="pricing-policy-heading">사용량은 어떻게 계산되나요?</h2>
      <p>원클릭·Make의 미리보기·후속 질문·재개선은 AI 호출당 1회 차감됩니다.</p>
      <p>미리보기는 적용하지 않아도 차감됩니다. 적용·복원·저장 결과 조회·중복 재조회는 추가 차감되지 않습니다.</p>

    </section>
  </section>`;
}

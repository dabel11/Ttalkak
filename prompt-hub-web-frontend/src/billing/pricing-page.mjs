import { formatTokenCount } from "./usage-model.mjs";

export function SubscriptionSummaryView({ state, escapeHtml, formatShortDate }, snapshot) {
  if (!state.isLoggedIn) return "";
  const { usage, billing, busy, message, errorMessage } = snapshot;
  const date = (value) => value ? escapeHtml(formatShortDate(value)) : "확인 중";
  const status = String(billing?.paymentStatus || "").toUpperCase();
  const labels = { NOT_REGISTERED: "미등록", ACTIVE: "완료", PENDING: "확인 중", FAILED: "실패", EXPIRED: "기간 만료" };
  return `<section class="subscription-card" aria-labelledby="subscription-heading">
    <div class="subscription-head"><h2 id="subscription-heading">내 요금제·사용량</h2><button class="secondary-button" type="button" data-open-billing>구독·결제 관리</button></div>
    ${busy ? '<p role="status">사용량을 확인하는 중입니다…</p>' : ""}
    ${errorMessage ? `<p class="billing-alert" role="alert">${escapeHtml(errorMessage)}</p><button class="secondary-button" type="button" data-subscription-refresh>다시 확인</button>` : ""}
    ${message ? `<p class="billing-success" role="status">${escapeHtml(message)}</p>` : ""}
    ${usage ? `<dl class="subscription-details">
      <div><dt>현재 요금제</dt><dd>${usage.plan}</dd></div>
      <div><dt>사용한 토큰</dt><dd>${formatTokenCount(usage.totalTokens)}</dd></div>
      <div><dt>남은 토큰</dt><dd>${usage.remainingTokens == null ? "한도 설정 전" : formatTokenCount(usage.remainingTokens)}</dd></div>
      <div><dt>사용량 초기화</dt><dd>${date(usage.resetsAt || usage.periodEnd)}</dd></div>
      ${billing ? `<div><dt>결제 상태</dt><dd>${labels[status] || "확인 중"}</dd></div><div><dt>자동 갱신</dt><dd>${billing.autoRenew ? "사용" : "중지"}</dd></div>` : ""}
      ${billing?.nextChargeAt ? `<div><dt>다음 결제일</dt><dd>${date(billing.nextChargeAt)}</dd></div>` : ""}
    </dl>
    ${usage.usageBlocked ? '<p class="billing-alert" role="status">사용량 확인이 필요하여 AI 요청이 일시적으로 제한됩니다.</p>'
      : !usage.usageAvailable ? '<p role="status">과거 요청 사용량 확인 필요</p>'
        : usage.limitReached && usage.quotaEnforced ? '<p class="billing-alert" role="status">이번 기간의 토큰을 모두 사용했습니다.</p>' : ""}
    ${!usage.quotaEnforced ? '<p class="pricing-note">현재 회원 사용량 한도 차단은 적용 전입니다.</p>' : ""}` : ""}
  </section>`;
}

export function PricingPageView(ctx, snapshot) {
  const { state } = ctx;
  const plan = snapshot.usage?.plan;
  return `<section class="pricing-page" aria-labelledby="pricing-heading">
    <div class="pricing-intro"><p class="pricing-eyebrow">TTALKAK 요금제</p><h1 id="pricing-heading">필요한 만큼, 더 편하게 개선하세요.</h1>
      <p>원클릭 개선과 대화형 개선(Make)을 모든 요금제에서 같은 품질로 제공합니다.</p></div>
    <div class="pricing-grid">
      <article class="pricing-plan"><h2>FREE</h2><p class="pricing-price">0원 <span>/ 월</span></p><p>월 30회 수준의 개선을 목표로 합니다.</p>
        <ul><li>원클릭 개선·대화형 개선</li><li>프롬프트 저장</li><li>PRO와 동일한 개선 품질</li></ul>
        <button class="secondary-button" type="button" data-route="make">${state.isLoggedIn ? "첨삭 시작하기" : "무료로 체험하기"}</button>
        ${plan === "FREE" ? '<p class="pricing-current">현재 요금제</p>' : ""}
      </article>
      <article class="pricing-plan pricing-pro"><p class="pricing-badge">더 넉넉한 사용량</p><h2>PRO</h2><p class="pricing-price">4,900원 <span>/ 월</span></p><p>월 300회 수준의 개선을 목표로 합니다.</p>
        <ul><li>원클릭 개선·대화형 개선</li><li>프롬프트 저장</li><li>FREE보다 넉넉한 AI 사용량</li></ul>
        <button class="primary-button" type="button" ${state.isLoggedIn ? 'data-open-billing' : 'data-start-pro'}>${plan === "PRO" ? "구독 관리하기" : "PRO 시작하기"}</button>
        ${plan === "PRO" ? '<p class="pricing-current">현재 요금제</p>' : ""}
      </article>
    </div>
    <p class="pricing-note">비회원은 총 3회 무료 체험할 수 있으며, 프롬프트 저장은 로그인 후 가능합니다.</p>
    <p class="pricing-note">30회·300회는 초기 목표치입니다. 실제 이용 가능 횟수는 입력 길이와 후속 대화의 토큰 사용량에 따라 달라집니다. 가격과 한도는 실제 호출 비용 확인 후 조정될 수 있습니다.</p>
    ${SubscriptionSummaryView(ctx, snapshot)}
    <section class="pricing-policy" aria-labelledby="pricing-policy-heading"><h2 id="pricing-policy-heading">사용량은 어떻게 계산되나요?</h2>
      <p>원클릭 개선과 Make는 하나의 AI 사용량 한도를 공유합니다. 미리보기 생성·후속 질문·재개선처럼 AI를 새로 호출하면 사용량이 발생합니다.</p>
      <p>미리보기를 적용하지 않아도 사용량에 포함됩니다. 개선안 적용·원본 복원·저장 결과 조회·같은 요청의 결과 재조회에는 사용량을 추가 차감하지 않습니다.</p>
      <p class="pricing-note">현재 결제는 테스트 환경으로 실제 청구되지 않습니다. 결제창에서 금액과 상태를 확인한 뒤 진행해 주세요.</p>
    </section>
  </section>`;
}

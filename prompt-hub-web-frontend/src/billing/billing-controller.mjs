import { formatTokenCount, normalizeUsageSnapshot } from "./usage-model.mjs";

const CUSTOMER_KEY_STORAGE = "ttalkak-billing-pending-customer";
const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
const BILLING_AUTH_MESSAGE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";
const BILLING_RETURN_AUTH_MESSAGE = "로그인이 만료되었습니다. 다시 로그인한 뒤 카드 등록을 처음부터 시작해 주세요.";

function BillingModalView(ctx, data) {
  if (!data) return "";
  const { setup, billing, usage, busy, message, errorMessage } = data;
  const { escapeHtml, formatShortDate } = ctx;
  const paymentStatus = String(billing?.paymentStatus || "").toUpperCase();
  const pending = paymentStatus === "PENDING";
  const paymentStatusLabel = paymentStatus === "NOT_REGISTERED" ? "미등록"
    : paymentStatus === "PENDING" ? "확인 중"
      : paymentStatus === "ACTIVE" ? "완료"
        : paymentStatus === "FAILED" ? "실패"
          : paymentStatus === "EXPIRED" ? "기간 만료" : "";
  const registered = Boolean(billing?.cardRegistered || setup?.cardRegistered);
  const hasDetails = setup || billing || usage;
  const period = usage?.periodStart && usage?.periodEnd
    ? `${escapeHtml(formatShortDate(usage.periodStart))} ~ ${escapeHtml(formatShortDate(usage.periodEnd))}`
    : "확인 중";
  const usageValue = `${formatTokenCount(usage?.totalTokens)}${usage?.limitTokens == null ? "" : ` / ${formatTokenCount(usage.limitTokens)}`}`;
  return `<div class="modal-backdrop visible billing-backdrop" role="dialog" aria-modal="true" aria-labelledby="billing-title">
    <article class="modal billing-modal">
      <div class="modal-head"><h2 id="billing-title">요금제·결제</h2><button class="ghost-icon" type="button" data-close-billing aria-label="닫기">×</button></div>
      <p class="billing-intro">테스트 결제이며 실제 청구는 없습니다.</p>
      ${errorMessage ? `<p class="billing-alert" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
      ${message ? `<p class="billing-success" role="status">${escapeHtml(message)}</p>` : ""}
      ${busy || pending ? `<p class="billing-progress" role="status">${pending ? "결제 확인 중" : "결제 정보를 확인하는 중입니다…"}</p>` : ""}
      ${usage?.usageBlocked ? `<p class="billing-alert" role="status">사용량 확인 중에는 요청할 수 없습니다.</p>` : ""}
      ${!usage?.usageBlocked && usage?.limitReached && usage?.quotaEnforced ? `<p class="billing-alert" role="status">토큰을 모두 사용했습니다.</p>` : ""}
      ${!usage?.usageBlocked && usage?.limitReached && !usage?.quotaEnforced ? `<p class="billing-progress" role="status">참고 한도에 도달했습니다.</p>` : ""}
      ${hasDetails ? `<dl class="billing-summary">
        ${usage ? `<div><dt>현재 요금제</dt><dd>${usage.plan}</dd></div>
        <div><dt>이번 기간</dt><dd>${period}</dd></div>
        <div class="billing-usage-row"><dt>토큰 사용량</dt><dd>${usageValue}${usage.remainingTokens == null ? "" : `<small>남음 ${formatTokenCount(usage.remainingTokens)}</small>`}</dd></div>` : ""}
        ${setup ? `<div><dt>테스트 금액</dt><dd>${Number(setup.amount || 0).toLocaleString("ko-KR")}원</dd></div>` : ""}
        ${setup || billing ? `<div><dt>카드 등록</dt><dd>${registered ? "완료" : "미등록"}</dd></div>` : ""}
        ${paymentStatusLabel ? `<div><dt>결제 상태</dt><dd>${paymentStatusLabel}</dd></div>` : ""}
        ${billing ? `<div><dt>자동 갱신</dt><dd>${billing.autoRenew ? "사용" : "중지"}</dd></div>` : ""}
        ${billing?.nextChargeAt ? `<div><dt>다음 결제일</dt><dd>${escapeHtml(formatShortDate(billing.nextChargeAt))}</dd></div>` : ""}
      </dl>${usage?.usagePercent != null ? `<div class="billing-usage-meter"><span style="width:${usage.usagePercent}%"></span></div>` : ""}<div class="billing-actions">
        ${pending ? `<button class="primary-button" type="button" data-billing-refresh ${busy ? "disabled" : ""}>결제 상태 다시 확인</button>` : ""}
        ${!pending && setup && !registered ? `<button class="primary-button" type="button" data-billing-register ${busy ? "disabled" : ""}>테스트 카드 등록 · 첫 결제</button>` : ""}
        ${!pending && registered && billing?.autoRenew ? `<button class="secondary-button" type="button" data-billing-cancel ${busy ? "disabled" : ""}>자동 갱신 중지</button>` : ""}
        ${!pending && registered && billing && !billing.autoRenew ? `<button class="primary-button" type="button" data-billing-retry ${busy ? "disabled" : ""}>결제 재시도·자동 갱신 사용</button>` : ""}
        ${errorMessage && !busy ? `<button class="secondary-button" type="button" data-billing-reload>다시 불러오기</button>` : ""}
      </div>` : !busy ? `<button class="secondary-button" type="button" data-billing-reload>다시 불러오기</button>` : ""}
    </article>
  </div>`;
}

export function consumeBillingRedirect(location, history) {
  const url = new URL(location.href);
  const result = url.searchParams.get("ttalkakBilling");
  if (result !== "success" && result !== "fail") return null;
  const callback = {
    result,
    authKey: url.searchParams.get("authKey") || "",
    customerKey: url.searchParams.get("customerKey") || "",
    code: url.searchParams.get("code") || "",
    message: url.searchParams.get("message") || "",
  };
  for (const key of ["ttalkakBilling", "authKey", "customerKey", "code", "message"]) url.searchParams.delete(key);
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  return callback;
}

export function createBillingController(ctx) {
  const { state, root, api, getToken, isDemoToken, handleBackendAccessError, render, escapeHtml, formatShortDate } = ctx;
  let busy = false;
  let setup = null;
  let billing = null;
  let usage = null;
  let message = "";
  let errorMessage = "";
  let activeToken = "";
  let sdkPromise = null;
  let focusReturnElement = null;

  function restoreFocus() {
    globalThis.setTimeout(() => {
      const button = focusReturnElement?.isConnected === false ? null : focusReturnElement;
      focusReturnElement = null;
      const fallback = root?.querySelector?.("[data-open-billing]");
      const source = button || fallback;
      const target = source?.closest?.("details")?.querySelector?.("summary") || source;
      target?.focus?.();
    }, 0);
  }

  const pendingCustomer = (method, value) => {
    try { return method === "setItem" ? (window.sessionStorage.setItem(CUSTOMER_KEY_STORAGE, value), true) : window.sessionStorage[method](CUSTOMER_KEY_STORAGE) || ""; }
    catch { return method === "setItem" ? false : ""; }
  };
  const errorText = (error) => error?.payload?.code === "BILLING_NOT_CONFIGURED"
    ? "결제 설정을 확인할 수 없습니다. 관리자에게 문의해 주세요."
    : String(error?.payload?.message || error?.message || "결제 정보를 확인하지 못했습니다.");
  const errorCode = (error) => String(error?.payload?.code || error?.code || "").toUpperCase();
  const isUnauthorized = (error) => Number(error?.status || error?.payload?.status || 0) === 401;
  const isPaymentPending = (billing) => String(billing?.paymentStatus || "").toUpperCase() === "PENDING";
  const isRecoverableCompletionError = (error) => [
    "REQUEST_TIMEOUT",
    "BILLING_UNCERTAIN",
    "BILLING_CARD_REGISTRATION_UNCERTAIN",
  ].includes(errorCode(error));
  const isCurrent = () => state.isLoggedIn && activeToken && activeToken === getToken();
  const renderBilling = () => BillingModalView({ escapeHtml, formatShortDate }, state.billingOpen && state.isLoggedIn
    ? { setup, billing, usage, busy, message, errorMessage }
    : null);

  function handleAccessError(error, message = BILLING_AUTH_MESSAGE) {
    if (!isUnauthorized(error) || typeof handleBackendAccessError !== "function") return false;
    handleBackendAccessError(error, message);
    state.authError = message;
    render();
    return true;
  }

  async function refresh(statusMessage = "") {
    const token = getToken();
    if (!state.isLoggedIn || !token || isDemoToken(token)) {
      errorMessage = "실제 계정으로 로그인한 뒤 결제를 이용해 주세요.";
      render();
      return;
    }
    activeToken = token;
    busy = true;
    errorMessage = "";
    message = statusMessage;
    render();
    try {
      const results = await Promise.allSettled([
        api.setupBilling(token), api.getBillingStatus(token), api.getUsageStatus(token),
      ]);
      if (!isCurrent()) return false;
      const failures = [];
      setup = results[0].status === "fulfilled" ? results[0].value : null;
      billing = results[1].status === "fulfilled" ? results[1].value : null;
      usage = results[2].status === "fulfilled" ? normalizeUsageSnapshot(results[2].value) : null;
      results.forEach((result) => { if (result.status === "rejected") failures.push(result.reason); });
      const authFailure = failures.find(isUnauthorized);
      if (authFailure && handleAccessError(authFailure)) return false;
      if (failures.length) {
        errorMessage = setup || billing || usage
          ? "일부 결제 정보를 불러오지 못했습니다. 다시 시도해 주세요."
          : errorText(failures[0]);
      }
      return Boolean(billing);
    } catch (error) {
      if (!isCurrent()) return false;
      if (!handleAccessError(error)) errorMessage = errorText(error);
      return false;
    } finally {
      if (isCurrent()) { busy = false; render(); }
    }
  }

  function open() {
    state.billingOpen = true;
    setup = billing = usage = null;
    void refresh();
  }

  function close() {
    state.billingOpen = false;
    render();
    restoreFocus();
    return true;
  }

  function loadSdk() {
    if (typeof globalThis.TossPayments === "function") return Promise.resolve(globalThis.TossPayments);
    sdkPromise ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TOSS_SDK_URL;
      script.onload = () => typeof globalThis.TossPayments === "function"
        ? resolve(globalThis.TossPayments)
        : reject(new Error("토스 결제창을 불러오지 못했습니다."));
      script.onerror = () => { script.remove(); reject(new Error("토스 결제창을 불러오지 못했습니다.")); };
      document.head.append(script);
    }).catch((error) => { sdkPromise = null; throw error; });
    return sdkPromise;
  }

  async function register() {
    if (busy || !setup || setup.cardRegistered || !isCurrent()) return;
    const { clientKey, customerKey, amount } = setup;
    if (!String(clientKey).startsWith("test_ck_") || !customerKey || Number(amount) <= 0) {
      errorMessage = "결제 정보를 확인할 수 없습니다.";
      render();
      return;
    }
    busy = true;
    errorMessage = "";
    render();
    try {
      const TossPayments = await loadSdk();
      if (!isCurrent() || !pendingCustomer("setItem", customerKey)) throw new Error("결제 세션을 저장할 수 없습니다. 브라우저 설정을 확인해 주세요.");
      const url = new URL(window.location.href);
      url.searchParams.delete("authKey");
      url.searchParams.delete("customerKey");
      url.searchParams.set("ttalkakBilling", "success");
      const successUrl = url.toString();
      url.searchParams.set("ttalkakBilling", "fail");
      await TossPayments(clientKey).payment({ customerKey }).requestBillingAuth({
        method: "CARD", successUrl, failUrl: url.toString(), windowTarget: "self",
      });
    } catch (error) {
      pendingCustomer("removeItem");
      errorMessage = errorText(error);
      busy = false;
      render();
    }
  }

  async function mutate(method, message) {
    if (busy || !isCurrent()) return;
    busy = true;
    errorMessage = "";
    render();
    try {
      await api[method](activeToken);
      if (isCurrent()) await refresh(message);
    } catch (error) {
      if (!isCurrent()) return;
      if (handleAccessError(error)) return;
      if (method === "retryBilling" && isRecoverableCompletionError(error)) {
        await recoverPaymentTimeout(false);
        return;
      }
      errorMessage = errorText(error);
      busy = false;
      render();
    }
  }

  async function recoverPaymentTimeout(firstPayment) {
    const refreshed = await refresh();
    if (!refreshed || !isCurrent()) return;
    if ((usage?.plan === "PRO" || String(billing?.paymentStatus || "").toUpperCase() === "ACTIVE") && !isPaymentPending(billing)) {
      message = firstPayment ? "첫 테스트 결제가 완료되어 PRO가 적용됐습니다." : "결제가 완료되어 PRO가 적용됐습니다.";
    } else if (isPaymentPending(billing)) {
      message = "결제 응답이 지연되어 서버에서 현재 상태를 다시 확인했습니다.";
    } else {
      errorMessage = firstPayment
        ? "결제 응답이 늦어 상태를 다시 확인했습니다. 필요하면 카드 등록을 다시 시작하세요."
        : "결제 응답이 늦어 상태를 다시 확인했습니다. 처리 중이면 잠시 후 다시 확인하세요.";
    }
    render();
  }

  function showBillingReturnLogin() {
    busy = false;
    state.billingOpen = false;
    state.authView = "login";
    state.authError = BILLING_RETURN_AUTH_MESSAGE;
    render();
  }

  async function handleRedirect(callback) {
    state.billingOpen = true;
    busy = true;
    errorMessage = message = "";
    render();
    const expectedCustomer = pendingCustomer("getItem");
    pendingCustomer("removeItem");
    if (callback.result === "fail") {
      busy = false;
      if (!state.isLoggedIn || !getToken() || isDemoToken(getToken())) {
        return showBillingReturnLogin();
      }
      errorMessage = `카드 인증이 완료되지 않았습니다. ${callback.code} ${callback.message}`.trim();
      render();
      return;
    }
    const token = getToken();
    if (!state.isLoggedIn || !token || isDemoToken(token)) {
      return showBillingReturnLogin();
    }
    if (!callback.authKey || !callback.customerKey || callback.customerKey !== expectedCustomer) {
      busy = false;
      errorMessage = "결제 세션을 확인할 수 없습니다. 다시 로그인해 카드 등록을 시작해 주세요.";
      render();
      return;
    }
    activeToken = token;
    try {
      await api.completeBilling({ authKey: callback.authKey, customerKey: callback.customerKey }, token);
      if (isCurrent()) await refresh("첫 테스트 결제가 완료되어 PRO가 적용됐습니다.");
    } catch (error) {
      if (!isCurrent()) return;
      if (handleAccessError(error, BILLING_RETURN_AUTH_MESSAGE)) return;
      if (isRecoverableCompletionError(error)) {
        await recoverPaymentTimeout(true);
        return;
      }
      busy = false;
      errorMessage = `결제 결과를 확인하지 못했습니다. 상태를 다시 불러와 확인해 주세요. ${errorText(error)}`;
      render();
    }
  }

  function bind(root) {
    const on = (selector, listener) => root.querySelector(selector)?.addEventListener("click", listener);
    root.querySelectorAll?.("[data-open-billing]").forEach((button) => button.addEventListener("click", () => {
      focusReturnElement = button;
      open();
    }));
    on("[data-close-billing]", close);
    on("[data-billing-reload]", () => { void refresh(); });
    on("[data-billing-refresh]", () => { void refresh("결제 상태를 다시 확인했습니다."); });
    on("[data-billing-register]", () => { void register(); });
    on("[data-billing-cancel]", () => { void mutate("cancelBilling", "다음 자동 갱신이 중지됐습니다."); });
    on("[data-billing-retry]", () => { void mutate("retryBilling", "결제 상태를 다시 확인했습니다."); });
  }

  return Object.freeze({ renderBilling, openBilling: open, closeBilling: close, refreshBilling: refresh, registerBilling: register, handleBillingRedirect: handleRedirect, bindBilling: bind });
}

export function consumeOpenBillingRequest(location, history) {
  const url = new URL(location.href);
  if (url.searchParams.get("openBilling") !== "1") return false;
  url.searchParams.delete("openBilling");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  return true;
}

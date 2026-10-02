const CUSTOMER_KEY_STORAGE = "ttalkak-billing-pending-customer";
const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

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
  const model = { busy: false, setup: null, billing: null, usage: null, message: "", error: "" };
  let activeToken = "";
  let sdkPromise = null;

  const pendingCustomer = {
    get() { try { return window.sessionStorage.getItem(CUSTOMER_KEY_STORAGE) || ""; } catch { return ""; } },
    set(value) { try { window.sessionStorage.setItem(CUSTOMER_KEY_STORAGE, value); return true; } catch { return false; } },
    clear() { try { window.sessionStorage.removeItem(CUSTOMER_KEY_STORAGE); } catch { /* Browser storage unavailable. */ } },
  };
  const errorText = (error) => error?.payload?.code === "BILLING_NOT_CONFIGURED"
    ? "테스트 결제 설정이 준비되지 않았습니다. 관리자에게 문의해 주세요."
    : String(error?.payload?.message || error?.message || "결제 정보를 확인하지 못했습니다.");
  const isCurrent = () => ctx.state.isLoggedIn && activeToken && activeToken === ctx.getToken();
  const dateText = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "-";
  };

  function view() {
    if (!ctx.state.billingOpen || !ctx.state.isLoggedIn) return "";
    const { setup, billing, usage, busy } = model;
    const plan = usage?.plan === "PRO" ? "PRO" : "FREE";
    const registered = Boolean(billing?.cardRegistered || setup?.cardRegistered);
    return `<div class="modal-backdrop visible billing-backdrop" role="dialog" aria-modal="true" aria-labelledby="billing-title">
      <article class="modal billing-modal">
        <div class="modal-head">
          <h2 id="billing-title">요금제·결제</h2>
          <button class="ghost-icon" type="button" data-close-billing aria-label="닫기">×</button>
        </div>
        <p class="billing-intro">현재는 토스페이먼츠 테스트 결제입니다. 실제 금액이 청구되지 않습니다.</p>
        ${model.error ? `<p class="billing-alert" role="alert">${ctx.escapeHtml(model.error)}</p>` : ""}
        ${model.message ? `<p class="billing-success" role="status">${ctx.escapeHtml(model.message)}</p>` : ""}
        ${busy ? `<p class="billing-progress" role="status">결제 정보를 확인하는 중입니다…</p>` : ""}
        ${setup && billing && usage ? `
          <dl class="billing-summary">
            <div><dt>현재 요금제</dt><dd>${plan}</dd></div>
            <div><dt>이번 기간</dt><dd>${ctx.escapeHtml(dateText(usage.periodStart))} ~ ${ctx.escapeHtml(dateText(usage.periodEnd))}</dd></div>
            <div><dt>토큰 사용량</dt><dd>${Number(usage.totalTokens || 0).toLocaleString("ko-KR")}개</dd></div>
            <div><dt>월 테스트 금액</dt><dd>${Number(setup.amount || 0).toLocaleString("ko-KR")}원</dd></div>
            <div><dt>카드 등록</dt><dd>${registered ? "완료" : "미등록"}</dd></div>
            <div><dt>자동 갱신</dt><dd>${billing.autoRenew ? "사용" : "중지"}</dd></div>
            ${billing.nextChargeAt ? `<div><dt>다음 결제일</dt><dd>${ctx.escapeHtml(dateText(billing.nextChargeAt))}</dd></div>` : ""}
          </dl>
          <div class="billing-actions">
            ${!registered ? `<button class="primary-button" type="button" data-billing-register ${busy ? "disabled" : ""}>테스트 카드 등록 · 첫 결제</button>` : ""}
            ${registered && billing.autoRenew ? `<button class="secondary-button" type="button" data-billing-cancel ${busy ? "disabled" : ""}>다음 자동 갱신 중지</button>` : ""}
            ${registered && !billing.autoRenew ? `<button class="primary-button" type="button" data-billing-retry ${busy ? "disabled" : ""}>결제 재시도·자동 갱신 사용</button>` : ""}
          </div>
          ${registered && billing.autoRenew ? `<p class="billing-hint">자동 갱신을 중지해도 이미 결제한 PRO 기간은 만료일까지 유지됩니다.</p>` : ""}
          ${!registered ? `<p class="billing-hint">카드 인증 후 첫 ${Number(setup.amount || 0).toLocaleString("ko-KR")}원 테스트 결제를 승인하고, 이후 매월 자동 갱신합니다.</p>` : ""}
        ` : !busy ? `<button class="secondary-button" type="button" data-billing-reload>다시 불러오기</button>` : ""}
      </article>
    </div>`;
  }

  async function refresh(message = "") {
    const token = ctx.getToken();
    if (!ctx.state.isLoggedIn || !token || ctx.isDemoToken(token)) {
      model.error = "실제 계정으로 로그인한 뒤 결제를 이용해 주세요.";
      ctx.render();
      return;
    }
    activeToken = token;
    model.busy = true;
    model.error = "";
    model.message = message;
    ctx.render();
    try {
      const [setup, billing, usage] = await Promise.all([
        ctx.api.setupBilling(token), ctx.api.getBillingStatus(token), ctx.api.getUsageStatus(token),
      ]);
      if (!isCurrent()) return;
      model.setup = setup;
      model.billing = billing;
      model.usage = usage;
    } catch (error) {
      if (isCurrent()) model.error = errorText(error);
    } finally {
      if (isCurrent()) { model.busy = false; ctx.render(); }
    }
  }

  function open() {
    ctx.state.billingOpen = true;
    model.setup = null;
    model.billing = null;
    model.usage = null;
    void refresh();
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
    if (model.busy || !model.setup || model.setup.cardRegistered || !isCurrent()) return;
    const { clientKey, customerKey, amount } = model.setup;
    if (!String(clientKey).startsWith("test_ck_") || !customerKey || Number(amount) <= 0) {
      model.error = "테스트 결제 정보를 확인할 수 없습니다.";
      ctx.render();
      return;
    }
    model.busy = true;
    model.error = "";
    ctx.render();
    try {
      const TossPayments = await loadSdk();
      if (!isCurrent() || !pendingCustomer.set(customerKey)) throw new Error("결제 세션을 저장할 수 없습니다. 브라우저 설정을 확인해 주세요.");
      const url = new URL(window.location.href);
      url.searchParams.delete("authKey");
      url.searchParams.delete("customerKey");
      url.searchParams.set("ttalkakBilling", "success");
      url.hash = "";
      const successUrl = url.toString();
      url.searchParams.set("ttalkakBilling", "fail");
      await TossPayments(clientKey).payment({ customerKey }).requestBillingAuth({
        method: "CARD", successUrl, failUrl: url.toString(), windowTarget: "self",
      });
    } catch (error) {
      pendingCustomer.clear();
      model.error = errorText(error);
      model.busy = false;
      ctx.render();
    }
  }

  async function mutate(method, message) {
    if (model.busy || !isCurrent()) return;
    model.busy = true;
    model.error = "";
    ctx.render();
    try {
      await ctx.api[method](activeToken);
      if (isCurrent()) await refresh(message);
    } catch (error) {
      if (isCurrent()) { model.error = errorText(error); model.busy = false; ctx.render(); }
    }
  }

  async function handleRedirect(callback) {
    ctx.state.billingOpen = true;
    model.busy = true;
    model.error = "";
    model.message = "";
    ctx.render();
    const expectedCustomer = pendingCustomer.get();
    pendingCustomer.clear();
    if (callback.result === "fail") {
      model.busy = false;
      model.error = `카드 인증이 완료되지 않았습니다. ${callback.code} ${callback.message}`.trim();
      ctx.render();
      return;
    }
    const token = ctx.getToken();
    if (!ctx.state.isLoggedIn || !token || ctx.isDemoToken(token) || !callback.authKey
      || !callback.customerKey || callback.customerKey !== expectedCustomer) {
      model.busy = false;
      model.error = "결제 세션을 확인할 수 없습니다. 다시 로그인해 카드 등록을 시작해 주세요.";
      ctx.render();
      return;
    }
    activeToken = token;
    try {
      await ctx.api.completeBilling({ authKey: callback.authKey, customerKey: callback.customerKey }, token);
      if (isCurrent()) await refresh("첫 테스트 결제가 완료되어 PRO가 적용됐습니다.");
    } catch (error) {
      if (!isCurrent()) return;
      model.busy = false;
      model.error = `결제 결과를 확인하지 못했습니다. 상태를 다시 불러와 확인해 주세요. ${errorText(error)}`;
      ctx.render();
    }
  }

  function bind(root) {
    root.querySelector("[data-open-billing]")?.addEventListener("click", open);
    root.querySelector("[data-close-billing]")?.addEventListener("click", () => { ctx.state.billingOpen = false; ctx.render(); });
    root.querySelector("[data-billing-reload]")?.addEventListener("click", () => { void refresh(); });
    root.querySelector("[data-billing-register]")?.addEventListener("click", () => { void register(); });
    root.querySelector("[data-billing-cancel]")?.addEventListener("click", () => { void mutate("cancelBilling", "다음 자동 갱신이 중지됐습니다."); });
    root.querySelector("[data-billing-retry]")?.addEventListener("click", () => { void mutate("retryBilling", "결제 상태를 다시 확인했습니다."); });
  }

  return Object.freeze({ view, open, refresh, register, handleRedirect, bind });
}

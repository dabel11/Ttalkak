import { normalizeEntitlement } from "./usage-entitlement.mjs";

function createUsageController(ctx) {
  let destinationInFlight = false;

  async function refresh({ quiet = true, shouldRender = false } = {}) {
    const getSubscription = /** @type {Function|undefined} */ (ctx.api?.getSubscription);
    if (!ctx.state.isLoggedIn || !ctx.hasBackendToken() || !getSubscription) return ctx.state.entitlement;
    const token = ctx.getToken();
    try {
      const payload = await getSubscription.call(ctx.api, token);
      if (!ctx.state.isLoggedIn || ctx.getToken() !== token) return ctx.state.entitlement;
      const entitlement = normalizeEntitlement(payload, { fallbackPlan: "FREE" });
      if (entitlement.known) ctx.state.entitlement = entitlement;
      if (shouldRender) ctx.render();
    } catch (error) {
      if (!ctx.state.isLoggedIn || ctx.getToken() !== token) return ctx.state.entitlement;
      const status = Number(error?.status || error?.payload?.status || 0);
      if (!quiet && ![404, 501].includes(status)) ctx.handleError(error, "사용량 정보를 불러오지 못했습니다.", { keepSession: true });
    }
    return ctx.state.entitlement;
  }

  async function openDestination(kind) {
    if (!ctx.state.isLoggedIn || !ctx.hasBackendToken()) {
      ctx.state.authView = "login";
      ctx.notice("로그인 후 요금제를 변경할 수 있습니다.");
      ctx.render();
      return;
    }
    const method = /** @type {Function|undefined} */ (kind === "portal" ? ctx.api.createBillingPortal : ctx.api.createSubscriptionCheckout);
    if (!method) return ctx.notice("결제 기능을 준비하고 있습니다.");
    if (destinationInFlight) return;
    const token = ctx.getToken();
    destinationInFlight = true;
    ctx.state.subscriptionActionPending = kind;
    ctx.render();
    try {
      const payload = await method.call(ctx.api, token);
      if (!ctx.state.isLoggedIn || ctx.getToken() !== token) return;
      const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
      const destination = String(data.checkoutUrl || data.portalUrl || data.url || "").trim();
      if (!/^https:\/\//i.test(destination)) throw new Error("결제 이동 주소가 없습니다.");
      ctx.window.location.assign(destination);
    } catch (error) {
      if (!ctx.state.isLoggedIn || ctx.getToken() !== token) return;
      const status = Number(error?.status || error?.payload?.status || 0);
      if ([404, 501].includes(status)) ctx.notice("백엔드 결제 API 연결 후 사용할 수 있습니다.");
      else ctx.handleError(error, "결제 화면을 열지 못했습니다.", { keepSession: true });
    } finally {
      destinationInFlight = false;
      if (ctx.state.subscriptionActionPending === kind) {
        ctx.state.subscriptionActionPending = "";
        ctx.render();
      }
    }
  }

  return Object.freeze({ openDestination, refresh });
}

export { createUsageController };

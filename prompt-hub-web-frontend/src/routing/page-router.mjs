  "use strict";

  const routeHashes = new Map([
    ["home", "#/home"], ["make", "#/make"], ["saved", "#/mypage"],
    ["share", "#/share"], ["admin", "#/admin"], ["pricing", "#/pricing"],
  ]);
  const routeNames = new Map([
    ["home", "home"], ["make", "make"], ["mypage", "saved"],
    ["share", "share"], ["admin", "admin"], ["pricing", "pricing"],
  ]);

  function getRouteHash(route) {
    return routeHashes.get(route) || routeHashes.get("home");
  }

  function resolveRouteHash(hash) {
    const normalized = String(hash || "").replace(/^#\/?/, "");
    return routeNames.get(normalized) || "home";
  }

  function createRouteLocation({ window, state, isAdminAccount }) {
    function sync(route, { replace = false } = {}) {
      const hash = getRouteHash(route);
      const isPricingPath = window.location.pathname === "/pricing" || window.location.pathname === "/pricing/";
      if (route === "pricing") {
        if (window.location.pathname === "/pricing" && !window.location.hash) return;
        window.history[replace ? "replaceState" : "pushState"](null, "", `/pricing${window.location.search || ""}`);
        return;
      }
      if (isPricingPath) {
        window.history[replace ? "replaceState" : "pushState"](null, "", `/${window.location.search || ""}${hash}`);
        return;
      }
      if (window.location.hash === hash) return;
      window.history[replace ? "replaceState" : "pushState"](null, "", hash);
    }

    function apply() {
      const requestedRoute = read();
      if ((requestedRoute === "saved" && !state.isLoggedIn) || (requestedRoute === "admin" && !isAdminAccount())) {
        state.route = "home";
        if (requestedRoute === "saved") state.authView = "login";
        sync("home", { replace: true });
        return;
      }
      state.route = requestedRoute;
      sync(requestedRoute, { replace: true });
    }

    const read = () => window.location.hash ? resolveRouteHash(window.location.hash)
      : ["/pricing", "/pricing/"].includes(window.location.pathname) ? "pricing"
        : resolveRouteHash(getRouteHash(state.route));
    function bind(navigate) {
      const handleLocationNavigation = () => {
        const route = read();
        if (route !== state.route) navigate(route);
      };
      window.addEventListener("popstate", handleLocationNavigation);
    }
    return { apply, bind, sync };
  }

  function resolvePageView(ctx) {
    const {
      state,
      isAdminAccount,
      AdminPage,
      HomePage,
      MakePage,
      SavedPage,
      SharePage,
      PricingPage,
    } = ctx;

    if (state.adminMode) return AdminPage();
    if (isAdminAccount() && !["home", "admin"].includes(state.route)) {
      state.route = "home";
      return HomePage();
    }
    if (state.route === "make") return MakePage();
    if (state.route === "saved") {
      if (isAdminAccount()) {
        state.route = "home";
        return HomePage();
      }
      if (state.isLoggedIn) return SavedPage();
      state.route = "home";
      state.authView = "login";
      return HomePage();
    }
    if (state.route === "share") return SharePage();
    if (state.route === "pricing") return PricingPage();
    if (state.route === "admin") return AdminPage();
    return HomePage();
  }

  const routing = Object.freeze({
    createRouteLocation,
    getRouteHash,
    resolvePageView,
    resolveRouteHash,
  });
export { routing };

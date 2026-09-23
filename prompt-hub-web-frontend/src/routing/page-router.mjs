  "use strict";

  const routeHashes = Object.freeze({
    home: "#/home",
    make: "#/make",
    saved: "#/mypage",
    share: "#/share",
    admin: "#/admin",
  });

  function getRouteHash(route) {
    return routeHashes[route] || routeHashes.home;
  }

  function resolveRouteHash(hash) {
    const normalized = String(hash || "").replace(/^#\/?/, "");
    if (!normalized || normalized === "home") return "home";
    if (normalized === "make") return "make";
    if (normalized === "mypage") return "saved";
    if (normalized === "share") return "share";
    if (normalized === "admin") return "admin";
    return "home";
  }

  function createRouteLocation({ window, state, isAdminAccount }) {
    function sync(route, { replace = false } = {}) {
      const hash = getRouteHash(route);
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

    const read = () => resolveRouteHash(window.location.hash);
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

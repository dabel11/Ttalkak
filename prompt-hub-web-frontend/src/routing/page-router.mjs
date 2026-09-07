  "use strict";

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
    resolvePageView,
  });
export { routing };

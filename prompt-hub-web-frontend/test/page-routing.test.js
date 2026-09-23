const test = require("node:test");
const assert = require("node:assert/strict");

let routing;

test.before(async () => {
  ({ routing } = await import("../src/routing/page-router.mjs"));
});

test("page routes have stable hashes", () => {
  assert.equal(routing.getRouteHash("home"), "#/home");
  assert.equal(routing.getRouteHash("make"), "#/make");
  assert.equal(routing.getRouteHash("saved"), "#/mypage");
  assert.equal(routing.getRouteHash("share"), "#/share");
  assert.equal(routing.resolveRouteHash("#/mypage"), "saved");
  assert.equal(routing.resolveRouteHash("#/unknown"), "home");
});

test("route location redirects protected routes and writes stable history", () => {
  const historyCalls = [];
  const window = {
    location: { hash: "#/mypage" },
    history: {
      pushState: (...args) => historyCalls.push(["push", ...args]),
      replaceState: (...args) => historyCalls.push(["replace", ...args]),
    },
  };
  const state = { route: "share", isLoggedIn: false, authView: null };
  const location = routing.createRouteLocation({ window, state, isAdminAccount: () => false });

  location.apply();
  assert.equal(state.route, "home");
  assert.equal(state.authView, "login");
  assert.equal(historyCalls.at(-1)[0], "replace");
  assert.equal(historyCalls.at(-1)[3], "#/home");

});

test("route location restores the persisted route when the URL has no route hash", () => {
  const historyCalls = [];
  const window = {
    location: { hash: "" },
    history: {
      pushState: (...args) => historyCalls.push(["push", ...args]),
      replaceState: (...args) => historyCalls.push(["replace", ...args]),
    },
  };
  const state = { route: "admin", isLoggedIn: true, authView: null };
  const location = routing.createRouteLocation({ window, state, isAdminAccount: () => true });

  location.apply();

  assert.equal(state.route, "admin");
  assert.equal(historyCalls.at(-1)[0], "replace");
  assert.equal(historyCalls.at(-1)[3], "#/admin");
});

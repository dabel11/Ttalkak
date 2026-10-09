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

test("public pricing deep links survive refresh and return to normal hash routes", () => {
  const url = new URL("https://web.example/pricing?source=extension");
  const window = {
    get location() { return url; },
    history: { replaceState(_state, _title, path) { url.href = new URL(path, url).href; }, pushState(_state, _title, path) { url.href = new URL(path, url).href; } },
  };
  const state = { route: "home", isLoggedIn: false };
  const location = routing.createRouteLocation({ window, state, isAdminAccount: () => false });
  location.apply();
  assert.equal(state.route, "pricing");
  assert.equal(url.pathname, "/pricing");
  assert.equal(url.search, "?source=extension");
  location.sync("home");
  assert.equal(url.pathname, "/");
  assert.equal(url.hash, "#/home");
  location.sync("pricing");
  assert.equal(url.pathname, "/pricing");
  assert.equal(url.hash, "");
  assert.equal(routing.resolveRouteHash("#/pricing"), "pricing");
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

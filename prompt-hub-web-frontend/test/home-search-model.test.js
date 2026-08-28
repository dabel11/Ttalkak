const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let model;
let createHomeController;
let bindHomeEvents;
let HomePageView;
let HeaderView;
test.before(async () => {
  ({ HomeSearchModel: model } = await import("../src/home/home-search-model.mjs"));
  ({ createHomeController } = await import("../src/home/home-controller.mjs"));
  ({ bindHomeEvents } = await import("../src/home/home-events.mjs"));
  ({ renderers: { HomePageView } } = await import("../src/renderers/pages/home-page.mjs"));
  ({ renderers: { HeaderView } } = await import("../src/renderers/shell-navigation.mjs"));
});

const normalize = (value) => String(value || "").replace(/^#+/, "").trim().toLowerCase();
const prompts = [
  { id: "old", title: "Email launch", text: "Write a concise announcement", author: "Alice", tags: ["Marketing", "Email"], views: 10, saves: 2, comments: 1, likes: 3, createdAt: 100 },
  { id: "new", title: "SEO plan", text: "Plan a product launch", author: "Bob", tags: ["Marketing", "SEO"], views: 5, saves: 8, comments: 4, likes: 7, createdAt: 200 },
];
const metrics = {
  views: (prompt) => prompt.views,
  saves: (prompt) => prompt.saves,
  comments: (prompt) => prompt.comments,
  likes: (prompt) => prompt.likes,
  createdAt: (prompt) => prompt.createdAt,
};

test("search scope falls back to all", () => {
  assert.equal(model.getValidSearchScope("author"), "author");
  assert.equal(model.getValidSearchScope("unknown"), "all");
});

test("query parser separates hashtags and scoped tokens", () => {
  assert.deepEqual(model.parsePromptSearchQuery("#SEO launch", "all", { normalizeTag: normalize, normalizeText: normalize }), {
    tagTokens: ["seo"], keywordTokens: [], authorTokens: [], allTokens: ["launch"],
  });
  assert.deepEqual(model.parsePromptSearchQuery("Alice Bob", "author", { normalizeTag: normalize, normalizeText: normalize }).authorTokens, ["alice", "bob"]);
});

test("duplicate prompts are removed without mutating order", () => {
  const duplicate = { ...prompts[0] };
  assert.deepEqual(model.uniquePrompts([prompts[0], duplicate, prompts[1]]).map((prompt) => prompt.id), ["old", "new"]);
});

test("combined search matches tags and all-field text", () => {
  const criteria = model.parsePromptSearchQuery("#marketing bob", "all", { normalizeTag: normalize, normalizeText: normalize });
  const result = model.filterPrompts(prompts, criteria, { normalizeTag: normalize, normalizeText: normalize, getAuthor: (prompt) => prompt.author });
  assert.deepEqual(result.map((prompt) => prompt.id), ["new"]);
});

test("sort modes use injected metrics and do not mutate input", () => {
  assert.deepEqual(model.sortPrompts(prompts, "popular", metrics).map((prompt) => prompt.id), ["old", "new"]);
  assert.deepEqual(model.sortPrompts(prompts, "saves", metrics).map((prompt) => prompt.id), ["new", "old"]);
  assert.deepEqual(model.sortPrompts(prompts, "latest", metrics).map((prompt) => prompt.id), ["new", "old"]);
  assert.deepEqual(prompts.map((prompt) => prompt.id), ["old", "new"]);
});

test("visible prompt selection combines dedupe filter and sort", () => {
  const result = model.selectVisiblePrompts({ prompts: [...prompts, { ...prompts[1] }], query: "launch", scope: "keyword", sort: "saves", normalizeTag: normalize, normalizeText: normalize, getAuthor: (prompt) => prompt.author, metrics });
  assert.deepEqual(result.map((prompt) => prompt.id), ["new", "old"]);
});

test("popular tags respect approval, usage and recency", () => {
  const result = model.collectPopularTags(prompts, { normalizeTag: normalize, getCreatedAt: (prompt) => prompt.createdAt, isApproved: (tag) => tag !== "SEO", limit: 2 });
  assert.deepEqual(result, ["Marketing", "Email"]);
});

test("browser loads the Home model and app delegates extracted search logic", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const entry = fs.readFileSync(path.join(frontendRoot, "src", "app-entry.js"), "utf8");
  const homeEntry = fs.readFileSync(path.join(frontendRoot, "src", "home", "index.js"), "utf8");
  const appSource = fs.readFileSync(path.join(frontendRoot, "src", "app.js"), "utf8");

  assert.match(entry, /home\/index\.js/);
  assert.match(homeEntry, /home-search-model\.mjs/);
  assert.match(homeEntry, /export const home/);
  assert.match(appSource, /modules\.home\.model/);
  assert.doesNotMatch(appSource, /window\.TtalkakHomeSearchModel/);
  assert.doesNotMatch(appSource, /function parsePromptSearchQuery\s*\(/);
  assert.doesNotMatch(appSource, /function getValidSearchScope\s*\(/);
});

test("Home controller centralizes query, scope, sort and page transitions", () => {
  const calls = [];
  const input = { value: "launch", focus() { calls.push("focus"); }, setSelectionRange() {} };
  const state = { backendStatus: "connected" };
  const controller = createHomeController({
    state,
    root: { querySelector: (selector) => selector === "[data-tag-search]" ? input : null },
    document: { activeElement: null, body: {} },
    debounceMs: 0,
    validScope: (value) => value,
    applySearchQuery: (value) => { calls.push(`query:${value}`); return true; },
    applyScope: (value) => calls.push(`scope:${value}`),
    applySort: (value) => calls.push(`sort:${value}`),
    applyPage: (value) => calls.push(`page:${value}`),
    refresh: () => calls.push("refresh"),
    render: () => calls.push("render"),
  });
  controller.commitSearchQuery("launch");
  controller.changeScope("author");
  controller.changeSort("latest");
  controller.changePage("2");
  assert.deepEqual(calls.filter((item) => /^(query|scope|sort|page):/.test(item)), ["query:launch", "scope:author", "sort:latest", "page:2"]);
  assert.equal(calls.filter((item) => item === "refresh").length, 4);
});

test("Home event binder delegates controls to the controller", () => {
  const listeners = {};
  const element = (name, value = "") => ({ value, dataset: {}, addEventListener(type, handler) { listeners[`${name}:${type}`] = handler; } });
  const search = element("search", "launch");
  const scope = element("scope", "author");
  const sort = element("sort", "latest");
  const page = element("page"); page.dataset.page = "2";
  const retry = element("retry");
  const nodes = { "[data-tag-search]": search, "[data-search-scope]": scope, "[data-popular-sort]": sort, "[data-retry-home-load]": retry };
  const calls = [];
  bindHomeEvents({ querySelector: (selector) => nodes[selector] || null, querySelectorAll: (selector) => selector === "[data-page]" ? [page] : [] }, {
    showSearchTipOnce() {}, cancelSearchCommit() {}, scheduleSearchCommit() {}, commitSearchQuery() {},
    changeScope: (value) => calls.push(`scope:${value}`), changeSort: (value) => calls.push(`sort:${value}`), changePage: (value) => calls.push(`page:${value}`), retryHomeLoad: () => calls.push("retry"),
  }, {});
  listeners["scope:change"](); listeners["sort:change"](); listeners["retry:click"](); listeners["page:click"]();
  assert.deepEqual(calls, ["scope:author", "sort:latest", "retry", "page:2"]);
});

test("account and development actions use separate menus", () => {
  const html = HeaderView({
    icons: {},
    state: { isLoggedIn: true, currentUser: "Fixture", route: "home", hideReportedPrompts: false },
    escapeHtml: (value) => String(value),
    BackendStatusBadge: () => '<span class="backend-status">연결됨</span>',
  }, {
    adminAccessButton: "",
    authButton: "",
    freeMakeLimit: 3,
    hasReportedPrompts: true,
    remaining: 3,
    showPromptTools: true,
  });

  assert.match(html, /<details class="topbar-settings">/);
  assert.match(html, /<details class="topbar-account">/);
  assert.match(html, /<div class="topbar-primary-actions">/);
  assert.match(html, /class="topbar-mobile-toggle"[^>]*aria-expanded="false"[^>]*>메뉴/);
  assert.match(html, /id="topbar-action-menu"/);
  assert.match(html, /account-actions[\s\S]*topbar-account[\s\S]*backend-status[\s\S]*topbar-settings/);
  assert.match(html, /data-reset-demo/);
  assert.match(html, /data-toggle-reported/);
  assert.match(html, /data-open-auth="withdraw"/);
  assert.match(html, /data-logout>로그아웃/);
  assert.doesNotMatch(html, /님 · 로그아웃/);
  assert.doesNotMatch(html, /Backend 오류[^<]*데모 초기화/);
});

test("screen settings remain available outside prompt-list routes", () => {
  const html = HeaderView({
    icons: {},
    state: { isLoggedIn: true, currentUser: "Fixture", route: "make", hideReportedPrompts: false },
    escapeHtml: (value) => String(value),
    BackendStatusBadge: () => '<span class="backend-status">연결됨</span>',
  }, { adminAccessButton: "", authButton: "", freeMakeLimit: 3, hasReportedPrompts: false, remaining: 3, showPromptTools: false });
  assert.match(html, /<details class="topbar-settings">/);
  assert.match(html, /data-reset-demo/);
  assert.doesNotMatch(html, /data-toggle-reported/);
});

test("Home retry exposes an actionable compact error state", async () => {
  const calls = [];
  const state = { backendStatus: "fallback", backendStatusMessage: "failed" };
  const controller = createHomeController({ state, root: { querySelector() { return null; } }, document: { activeElement: null, body: {} }, debounceMs: 0, validScope: (value) => value, applySearchQuery: () => false, applyScope() {}, applySort() {}, applyPage() {}, refresh: async () => calls.push("refresh"), render: () => calls.push("render") });
  await controller.retryHomeLoad();
  assert.equal(state.backendStatus, "checking");
  assert.deepEqual(calls, ["render", "refresh"]);

  const option = (value, label) => `<option value="${value}">${label}</option>`;
  const html = HomePageView({ icons: { search: "search", bulb: "bulb" }, state: { backendStatus: "fallback", searchQuery: "", searchTipVisible: false }, escapeAttr: String, escapeHtml: String, normalizeTag: String, SearchScopeOption: option, SortOption: option, PromptCard: () => "", Pagination: () => "" }, { displayTags: [], searchCriteria: { tagTokens: [] }, totalPages: 1, currentPage: 1, pagePrompts: [], isSearching: false, searchPlaceholder: "검색", canShowDemoFallback: false });
  assert.match(html, /프롬프트를 불러오지 못했습니다/);
  assert.match(html, /data-retry-home-load/);
  assert.match(html, />정렬</);
  assert.match(html, />저장순</);

  const checkingHtml = HomePageView({ icons: { search: "search", bulb: "bulb" }, state: { backendStatus: "checking", searchQuery: "", searchTipVisible: false }, escapeAttr: String, escapeHtml: String, normalizeTag: String, SearchScopeOption: option, SortOption: option, PromptCard: () => "", Pagination: () => "" }, { displayTags: [], searchCriteria: { tagTokens: [] }, totalPages: 1, currentPage: 1, pagePrompts: [], isSearching: false, searchPlaceholder: "검색", canShowDemoFallback: false });
  assert.match(checkingHtml, /프롬프트를 확인하고 있습니다/);
  assert.match(checkingHtml, /aria-busy="true"/);
  assert.doesNotMatch(checkingHtml, /data-retry-home-load/);
});

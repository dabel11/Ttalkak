const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../src/home/home-search-model.js");
const { createHomeController } = require("../src/home/home-controller.js");
const { bindHomeEvents } = require("../src/home/home-events.js");

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
  const indexHtml = fs.readFileSync(path.join(frontendRoot, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(frontendRoot, "src", "app.js"), "utf8");

  assert.match(indexHtml, /src\/home\/home-search-model\.js/);
  assert.match(appSource, /window\.TtalkakHomeSearchModel/);
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
  const nodes = { "[data-tag-search]": search, "[data-search-scope]": scope, "[data-popular-sort]": sort };
  const calls = [];
  bindHomeEvents({ querySelector: (selector) => nodes[selector] || null, querySelectorAll: (selector) => selector === "[data-page]" ? [page] : [] }, {
    showSearchTipOnce() {}, cancelSearchCommit() {}, scheduleSearchCommit() {}, commitSearchQuery() {},
    changeScope: (value) => calls.push(`scope:${value}`), changeSort: (value) => calls.push(`sort:${value}`), changePage: (value) => calls.push(`page:${value}`),
  }, {});
  listeners["scope:change"](); listeners["sort:change"](); listeners["page:click"]();
  assert.deepEqual(calls, ["scope:author", "sort:latest", "page:2"]);
});

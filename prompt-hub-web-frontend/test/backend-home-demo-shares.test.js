const test = require("node:test");
const assert = require("node:assert/strict");

let backendEffects;
let HomeSearchModel;
test.before(async () => {
  ({ backendEffects } = await import("../src/effects/backend-effects.mjs"));
  ({ HomeSearchModel } = await import("../src/home/home-search-model.mjs"));
});

function createContext(overrides = {}) {
  const localShare = {
    id: "shared-100",
    title: "방금 공유한 프롬프트",
    text: "로컬 데모 공유 내용",
    author: "나",
    tags: ["데모"],
    source: "mine",
    isShared: true,
  };
  const popularPrompts = [localShare];
  const pageMeta = [];
  return {
    isBackendNumericId: (id) => /^\d+$/.test(String(id || "")),
    normalizePersistedLikeCounts: () => {},
    popularPrompts,
    savedPrompts: [localShare],
    state: { popularSort: "latest", searchQuery: "", searchScope: "all" },
    updateBackendHomePageMeta: (payload, page) => pageMeta.push({ payload, page }),
    pageMeta,
    ...overrides,
  };
}

test("demo shares remain first after the connected Home list refreshes", () => {
  const ctx = createContext();
  const applied = backendEffects.applyBackendHomePromptsResult(ctx, {
    items: [{ id: "42", title: "서버 프롬프트" }],
    page: 1,
    size: 16,
    total: 1,
    totalPages: 1,
  }, 1);

  assert.equal(applied, true);
  assert.deepEqual(ctx.popularPrompts.map((prompt) => prompt.id), ["shared-100", "42"]);
  assert.equal(ctx.pageMeta[0].payload.total, 1);
});

test("ordinary backend refreshes still replace stale Home items", () => {
  const ctx = createContext({
    popularPrompts: [{ id: "99", title: "stale" }],
    savedPrompts: [{ id: "99", source: "mine", isShared: true }],
  });
  backendEffects.applyBackendHomePromptsResult(ctx, {
    items: [{ id: "42", title: "서버 프롬프트" }],
    page: 1,
    size: 16,
    total: 1,
    totalPages: 1,
  }, 1);

  assert.deepEqual(ctx.popularPrompts.map((prompt) => prompt.id), ["42"]);
  assert.equal(ctx.pageMeta[0].payload.total, 1);
});

test("demo shares remain available for first-page search and sorting", () => {
  const visibleIds = (ctx) => HomeSearchModel.selectVisiblePrompts({
    prompts: ctx.popularPrompts,
    query: ctx.state.searchQuery,
    scope: ctx.state.searchScope,
    sort: ctx.state.popularSort,
    getAuthor: (prompt) => prompt.author || "",
  }).map((prompt) => prompt.id);
  const queryContext = createContext({ state: { popularSort: "latest", searchQuery: "방금", searchScope: "all" } });
  backendEffects.applyBackendHomePromptsResult(queryContext, { items: [], page: 1, size: 16, total: 0, totalPages: 1 }, 1);
  assert.deepEqual(visibleIds(queryContext), ["shared-100"]);

  queryContext.state.searchQuery = "server";
  backendEffects.applyBackendHomePromptsResult(queryContext, { items: [], page: 1, size: 16, total: 0, totalPages: 1 }, 1);
  assert.deepEqual(visibleIds(queryContext), []);

  queryContext.state.searchQuery = "데모";
  queryContext.state.searchScope = "tag";
  backendEffects.applyBackendHomePromptsResult(queryContext, { items: [], page: 1, size: 16, total: 0, totalPages: 1 }, 1);
  assert.deepEqual(visibleIds(queryContext), ["shared-100"]);

  queryContext.state.searchQuery = "나";
  queryContext.state.searchScope = "author";
  backendEffects.applyBackendHomePromptsResult(queryContext, { items: [], page: 1, size: 16, total: 0, totalPages: 1 }, 1);
  assert.deepEqual(visibleIds(queryContext), ["shared-100"]);

  const popularContext = createContext({ state: { popularSort: "popular", searchQuery: "", searchScope: "all" } });
  backendEffects.applyBackendHomePromptsResult(popularContext, { items: [], page: 1, size: 16, total: 0, totalPages: 1 }, 1);
  assert.deepEqual(popularContext.popularPrompts.map((prompt) => prompt.id), ["shared-100"]);

  const secondPageContext = createContext();
  backendEffects.applyBackendHomePromptsResult(secondPageContext, { items: [], page: 2, size: 16, total: 0, totalPages: 2 }, 2);
  assert.deepEqual(secondPageContext.popularPrompts, []);
});

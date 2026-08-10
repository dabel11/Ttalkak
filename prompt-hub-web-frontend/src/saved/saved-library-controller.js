// @ts-check
(function attachSavedLibraryController(global) {
  "use strict";

  /** @param {TtalkakSavedLibraryContext} ctx */
  function createSavedLibraryController(ctx) {
    /** @param {TtalkakPromptRecord | undefined} prompt */
    function isHiddenDemoLibraryPrompt(prompt) {
      return Boolean(prompt && ctx.demoPromptIds.has(prompt.id) && !ctx.state.libraryDemoSeeded && !ctx.state.userLibraryPromptIds.has(prompt.id));
    }

    function normalizeSavedCounts() {
      ctx.savedPrompts.forEach((prompt) => {
        if (prompt.savedByMe && Number(prompt.saves || 0) < 1) prompt.saves = 1;
      });
    }

    function normalizeOwnership() {
      ctx.savedPrompts.forEach((prompt) => {
        if (prompt.savedByMe == null) prompt.savedByMe = prompt.source === "community" || (!prompt.isShared && Number(prompt.saves || 0) > 0);
      });
      normalizeSavedCounts();
    }

    /** @param {TtalkakId} promptId */
    function isSaved(promptId) {
      if (!ctx.state.isLoggedIn) return false;
      const prompt = ctx.savedPrompts.find((item) => item.id === promptId);
      return !isHiddenDemoLibraryPrompt(prompt) && Boolean(prompt?.savedByMe) && !ctx.state.pendingUnsaveIds.has(promptId);
    }

    /** @param {TtalkakPromptRecord | undefined} prompt */
    function getSaveCount(prompt) {
      const saves = Number(prompt?.saves || 0);
      return prompt?.id != null && isSaved(prompt.id) ? Math.max(1, saves) : saves;
    }

    function getLocalPrompts() {
      const merged = ctx.savedPrompts.filter((prompt) => !isHiddenDemoLibraryPrompt(prompt)
        && (prompt.savedByMe || ctx.state.pendingUnsaveIds.has(prompt.id) || ctx.state.likedPromptIds.has(prompt.id)));
      const seen = new Set(merged.map((prompt) => prompt.id));
      ctx.popularPrompts.forEach((prompt) => {
        if (!ctx.state.likedPromptIds.has(prompt.id) || seen.has(prompt.id)) return;
        merged.push({ ...prompt, source: prompt.source === "mine" ? "mine" : "community" });
        seen.add(prompt.id);
      });
      return merged;
    }

    function getPagePrompts() {
      if (ctx.state.myBackendStatus === "fallback" && !ctx.canUseDemoFallback()) return [];
      const local = getLocalPrompts();
      if (ctx.state.myBackendStatus === "connected") {
        return ctx.uniquePrompts([...ctx.state.backendLibraryPrompts, ...ctx.state.backendLikedPrompts, ...local]);
      }
      return local;
    }

    /** @param {TtalkakPromptRecord} prompt */
    function matchesFilter(prompt) {
      const matchesSource = (prompt.source === "community" && ctx.state.savedFilter.community)
        || (prompt.source === "mine" && ctx.state.savedFilter.mine);
      return ctx.state.savedFilter.liked ? ctx.state.likedPromptIds.has(prompt.id) && matchesSource : matchesSource;
    }

    function getSorter() {
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const recent = (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const saves = (a, b) => getSaveCount(b) - getSaveCount(a);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const likes = (a, b) => ctx.getLikes(b) - ctx.getLikes(a);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const comments = (a, b) => ctx.getCommentCount(b) - ctx.getCommentCount(a);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const views = (a, b) => Number(b.views || 0) - Number(a.views || 0);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const bySaves = (a, b) => saves(a, b) || recent(a, b) || views(a, b);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const byComments = (a, b) => comments(a, b) || saves(a, b) || recent(a, b);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const byLikes = (a, b) => likes(a, b) || saves(a, b) || recent(a, b);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const byViews = (a, b) => views(a, b) || saves(a, b) || recent(a, b);
      /** @type {(a: TtalkakPromptRecord, b: TtalkakPromptRecord) => number} */
      const byRecent = (a, b) => recent(a, b) || saves(a, b) || views(a, b);
      if (ctx.state.savedSort === "saves") return bySaves;
      if (ctx.state.savedSort === "comments") return byComments;
      if (ctx.state.savedSort === "likes") return byLikes;
      if (ctx.state.savedSort === "views") return byViews;
      return byRecent;
    }

    return Object.freeze({ getLocalPrompts, getPagePrompts, getSaveCount, getSorter, isHiddenDemoLibraryPrompt, isSaved, matchesFilter, normalizeOwnership, normalizeSavedCounts });
  }

  const api = Object.freeze({ createSavedLibraryController });
  (/** @type {Window & typeof globalThis} */ (global)).TtalkakSavedLibraryController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

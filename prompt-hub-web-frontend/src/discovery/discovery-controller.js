// @ts-check
(function attachDiscoveryController(global) {
  "use strict";

  /** @param {TtalkakDiscoveryContext} ctx */
  function createDiscoveryController(ctx) {
    /** @type {Record<"prompt" | "tag", number | undefined>} */
    const timers = { prompt: undefined, tag: undefined };

    /** @param {string} selector */
    function restoreFocus(selector) {
      const input = ctx.document.querySelector(selector);
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    /** @param {"prompt" | "tag"} kind @param {unknown} value */
    function commitAdminSearch(kind, value) {
      const key = kind === "prompt" ? "adminPromptQuery" : "adminTagQuery";
      const selector = kind === "prompt" ? "[data-admin-prompt-search]" : "[data-admin-tag-search]";
      const nextQuery = String(value || "");
      global.clearTimeout(timers[kind]);
      if (ctx.state[key] === nextQuery) return;
      ctx.state[key] = nextQuery;
      ctx.render();
      restoreFocus(selector);
    }

    /** @param {"prompt" | "tag"} kind @param {unknown} value */
    function scheduleAdminSearch(kind, value) {
      global.clearTimeout(timers[kind]);
      timers[kind] = global.setTimeout(() => commitAdminSearch(kind, value), ctx.searchDebounceMs);
    }

    /** @param {unknown} tag */
    function searchByTag(tag) {
      const clean = String(tag || "").replace(/^#+/, "").trim();
      if (!clean) return;
      ctx.cancelHomeSearch();
      ctx.applyTag(ctx.state, clean);
      ctx.refresh();
      ctx.render();
      ctx.restoreHomeFocus();
    }

    /** @param {unknown} author */
    function searchByAuthor(author) {
      const clean = String(author || "").trim();
      if (!clean) return;
      ctx.cancelHomeSearch();
      ctx.applyAuthor(ctx.state, clean);
      ctx.refresh();
      ctx.render();
      ctx.restoreHomeFocus();
    }

    return Object.freeze({
      cancelAdminPromptSearch: () => global.clearTimeout(timers.prompt),
      cancelAdminTagSearch: () => global.clearTimeout(timers.tag),
      commitAdminPromptSearch: (/** @type {unknown} */ value) => commitAdminSearch("prompt", value),
      commitAdminTagSearch: (/** @type {unknown} */ value) => commitAdminSearch("tag", value),
      scheduleAdminPromptSearch: (/** @type {unknown} */ value) => scheduleAdminSearch("prompt", value),
      scheduleAdminTagSearch: (/** @type {unknown} */ value) => scheduleAdminSearch("tag", value),
      restoreAdminPromptFocus: () => restoreFocus("[data-admin-prompt-search]"),
      restoreAdminTagFocus: () => restoreFocus("[data-admin-tag-search]"),
      searchByAuthor,
      searchByTag,
    });
  }

  const api = Object.freeze({ createDiscoveryController });
  (/** @type {Window & typeof globalThis} */ (global)).TtalkakDiscoveryController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

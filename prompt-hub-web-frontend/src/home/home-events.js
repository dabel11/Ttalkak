(function attachHomeEvents(global) {
  "use strict";

  function bindHomeEvents(root, controller, state) {
    const searchInput = root.querySelector("[data-tag-search]");
    const scope = root.querySelector("[data-search-scope]");
    scope?.addEventListener("change", () => controller.changeScope(scope.value));
    if (searchInput) {
      searchInput.addEventListener("focus", controller.showSearchTipOnce);
      searchInput.addEventListener("compositionstart", () => { state.isComposingSearch = true; controller.cancelSearchCommit(); });
      searchInput.addEventListener("compositionend", () => { state.isComposingSearch = false; controller.scheduleSearchCommit(searchInput.value); });
      searchInput.addEventListener("input", (event) => { if (!state.isComposingSearch && !event.isComposing) controller.scheduleSearchCommit(searchInput.value); });
      searchInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || state.isComposingSearch || event.isComposing) return;
        event.preventDefault();
        controller.commitSearchQuery(searchInput.value);
      });
    }
    root.querySelector("[data-search-help]")?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); searchInput?.focus(); });
    const sort = root.querySelector("[data-popular-sort]");
    sort?.addEventListener("change", () => controller.changeSort(sort.value));
    root.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => controller.changePage(button.dataset.page)));
  }

  const api = Object.freeze({ bindHomeEvents });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakHomeEvents = api;
})(typeof window !== "undefined" ? window : globalThis);

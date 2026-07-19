(function attachSavedPageRenderer(global) {
  "use strict";

  function SavedPageView(ctx, data) {
    const { icons, state, formatNumber, DemoLibraryPrompt, MyPagePanel } = ctx;
    const { tabs } = data;

    return `
      <section class="saved-page my-page" aria-labelledby="my-page-heading">
        <div class="page-head my-page-head">
          <div class="page-title">
            <span>${icons.user}</span>
            <h1 id="my-page-heading">My page</h1>
          </div>
        </div>
        <nav class="my-page-tabs" aria-label="My page tabs">
          ${tabs
            .map(
              (tab) => `
                <button class="${state.myPageTab === tab.id ? "active" : ""}" type="button" data-my-tab="${tab.id}">
                  ${tab.label}<span>${formatNumber(tab.count)}</span>
                </button>
              `,
            )
            .join("")}
        </nav>
        ${DemoLibraryPrompt()}
        ${MyPagePanel()}
      </section>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    SavedPageView,
  });
})(window);

(function attachAdminPageRenderer(global) {
  "use strict";

  function AdminPageView(ctx, data) {
    const { icons, escapeHtml } = ctx;
    const {
      activePanel,
      adminMode,
      notice,
      unavailableMessage,
    } = data;

    if (!adminMode) {
      return `
        <section class="admin-page">
          <div class="empty-state saved-empty">
            <span>${icons.shield}</span>
            <p>${escapeHtml(unavailableMessage || "Admin page unavailable.")}</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-page" aria-labelledby="admin-heading">
        <div class="page-head admin-head">
          <div class="page-title">
            <span>${icons.shield}</span>
            <h1 id="admin-heading">Admin</h1>
          </div>
          <p class="admin-demo-note">${escapeHtml(notice || "")}</p>
        </div>
        <div class="admin-workspace">
          <div class="admin-content-panel">
            ${activePanel || ""}
          </div>
        </div>
      </section>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    AdminPageView,
  });
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-registered", { detail: { renderers: { AdminPageView } } }));
})(window);

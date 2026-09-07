const routeImports = Object.freeze({
  admin: () => import("../admin/admin-runtime.mjs"),
  make: () => import("../make/make-runtime.mjs"),
  overlays: () => import("./overlay-runtime.mjs"),
  saved: () => import("./saved-runtime.mjs"),
  share: () => import("../share/share-runtime.mjs"),
});

const routeState = new Map();
const loadedRenderers = Object.create(null);

document.addEventListener("ttalkak:route-renderers-registered", (event) => {
  if (event instanceof CustomEvent && event.detail?.renderers) Object.assign(loadedRenderers, event.detail.renderers);
});

function ensureRouteRenderers(route) {
  const load = routeImports[route];
  if (!load) return Promise.resolve();
  const current = routeState.get(route);
  if (current?.status === "loaded") return Promise.resolve();
  if (current?.promise) return current.promise;

  const state = { status: "loading", error: null, promise: null };
  state.promise = load()
    .then((module) => {
      Object.assign(loadedRenderers, module.renderers || {});
      state.status = "loaded";
      document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-changed", { detail: { route, status: "loaded" } }));
    })
    .catch((error) => {
      state.status = "failed";
      state.error = error;
      document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-changed", { detail: { route, status: "failed" } }));
    });
  routeState.set(route, state);
  return state.promise;
}

function loadingView(route) {
  const state = routeState.get(route);
  if (state?.status === "failed") {
    return `<section class="route-module-status route-module-error" role="alert" data-route-module-error="${route}">화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</section>`;
  }
  return `<section class="route-module-status" role="status" aria-live="polite" data-route-module-loading="${route}">화면을 불러오는 중입니다.</section>`;
}

function createLazyRenderer(route, name) {
  function lazyRenderer(...args) {
    const renderer = loadedRenderers[name];
    if (typeof renderer === "function") return renderer(...args);
    void ensureRouteRenderers(route);
    return loadingView(route);
  }
  return lazyRenderer;
}

export const lazyRouteRenderers = Object.freeze({
  AuthModalView: createLazyRenderer("overlays", "AuthModalView"),
  ExecuteModalView: createLazyRenderer("overlays", "ExecuteModalView"),
  PromptDetailModalView: createLazyRenderer("overlays", "PromptDetailModalView"),
  PromptEditModalView: createLazyRenderer("overlays", "PromptEditModalView"),
  ReportModalView: createLazyRenderer("overlays", "ReportModalView"),
  AdminRevisionRequestModalView: createLazyRenderer("admin", "AdminRevisionRequestModalView"),
  AdminAuditPanelView: createLazyRenderer("admin", "AdminAuditPanelView"),
  AdminPromptsPanelView: createLazyRenderer("admin", "AdminPromptsPanelView"),
  AdminReportsPanelView: createLazyRenderer("admin", "AdminReportsPanelView"),
  AdminPageView: createLazyRenderer("admin", "AdminPageView"),
  AdminTagsPanelView: createLazyRenderer("admin", "AdminTagsPanelView"),
  AdminUsersPanelView: createLazyRenderer("admin", "AdminUsersPanelView"),
  MakeComposerView: createLazyRenderer("make", "MakeComposerView"),
  MakeFeedView: createLazyRenderer("make", "MakeFeedView"),
  MakeFolderButtonView: createLazyRenderer("make", "MakeFolderButtonView"),
  MakePageView: createLazyRenderer("make", "MakePageView"),
  MakeSidePanelView: createLazyRenderer("make", "MakeSidePanelView"),
  MakeTemplateBarView: createLazyRenderer("make", "MakeTemplateBarView"),
  MessageBubbleView: createLazyRenderer("make", "MessageBubbleView"),
  SavedLibraryPanelView: createLazyRenderer("saved", "SavedLibraryPanelView"),
  SavedPageView: createLazyRenderer("saved", "SavedPageView"),
  MyCommentsPanelView: createLazyRenderer("saved", "MyCommentsPanelView"),
  MyPromptsPanelView: createLazyRenderer("saved", "MyPromptsPanelView"),
  MyReportsPanelView: createLazyRenderer("saved", "MyReportsPanelView"),
  SharePageView: createLazyRenderer("share", "SharePageView"),
});

export { ensureRouteRenderers };

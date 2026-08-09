(function attachAppBootstrap(global) {
  "use strict";

  function createAppBootstrap(ctx) {
    function getBackendDataEffectContext() {
      return {
        isBackendNumericId: ctx.isBackendNumericId,
        makePreview: ctx.makePreview,
        normalizeMakeFolders: ctx.normalizeMakeFolders,
        normalizePersistedLikeCounts: ctx.normalizePersistedLikeCounts,
        normalizeRecentThreads: ctx.normalizeRecentThreads,
        popularPrompts: ctx.popularPrompts,
        savedPrompts: ctx.savedPrompts,
        state: ctx.state,
        updateBackendHomePageMeta: ctx.updateBackendHomePageMeta,
        upsertPrompt: ctx.upsertPrompt,
      };
    }

    function getBackendHydrationEffectContext() {
      return {
        api: global.TTALKAK_API,
        applyContext: getBackendDataEffectContext,
        canUseDemoFallback: ctx.canUseDemoFallback,
        clearAuthenticatedSession: ctx.clearAuthenticatedSession,
        getApiFailureMessage: ctx.getApiFailureMessage,
        getAuthToken: ctx.getAuthToken,
        hasBackendAuthToken: ctx.hasBackendAuthToken,
        getMakeApi: ctx.getMakeApi,
        getMakeApiToken: ctx.getMakeApiToken,
        getMakeInteractionVersion: ctx.getMakeInteractionVersion,
        getValidSearchScope: ctx.getValidSearchScope,
        handleBackendAccessError: ctx.handleBackendAccessError,
        homePageSize: ctx.homePageSize,
        render: ctx.render,
        state: ctx.state,
      };
    }

    async function hydrateBackendMakeDataIfNeeded() {
      if (ctx.isMakeThinking()) return;
      return ctx.hydrateBackendMakeDataEffect(getBackendHydrationEffectContext());
    }

    function refreshMyPageDataAfterMutation() {
      if (!ctx.state.isLoggedIn || ctx.state.myBackendStatus !== "connected") return Promise.resolve();
      ctx.state.myBackendStatus = "idle";
      return hydrateBackendMyPageDataIfNeeded({ force: true });
    }

    async function hydrateBackendMyPageDataIfNeeded({ force = false } = {}) {
      return ctx.hydrateBackendMyPageDataEffect(getBackendHydrationEffectContext(), { force });
    }

    function getAdminHydrationEffectContext() {
      return {
        api: global.TTALKAK_API,
        canUseDemoFallback: ctx.canUseDemoFallback,
        formatShortDate: ctx.formatShortDate,
        getAuthToken: ctx.getAuthToken,
        getReportRecord: ctx.getReportRecord,
        hasBackendAuthToken: ctx.hasBackendAuthToken,
        mapBackendReportStatus: ctx.mapBackendReportStatus,
        render: ctx.render,
        state: ctx.state,
      };
    }

    async function hydrateBackendAdminDataIfNeeded(options = {}) {
      return ctx.hydrateBackendAdminData(getAdminHydrationEffectContext(), options);
    }

    async function hydrateBackendHomeData() {
      return ctx.hydrateBackendHomeDataEffect(getBackendHydrationEffectContext());
    }

    async function refreshBackendHomePrompts() {
      return ctx.refreshBackendHomePromptsEffect(getBackendHydrationEffectContext());
    }

    function bootstrap() {
      ctx.loadPersistedState();
      ctx.normalizeDemoCopy();
      ctx.normalizeAssistantPromptOutputs();
      ctx.normalizeRecentThreads();
      ctx.ensureDemoComments();
      ctx.render();
      return hydrateBackendHomeData();
    }

    return Object.freeze({
      bootstrap,
      getAdminHydrationEffectContext,
      getBackendDataEffectContext,
      getBackendHydrationEffectContext,
      hydrateBackendAdminDataIfNeeded,
      hydrateBackendHomeData,
      hydrateBackendMakeDataIfNeeded,
      hydrateBackendMyPageDataIfNeeded,
      refreshBackendHomePrompts,
      refreshMyPageDataAfterMutation,
    });
  }

  const api = Object.freeze({ createAppBootstrap });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakAppBootstrap = api;
})(typeof window !== "undefined" ? window : globalThis);

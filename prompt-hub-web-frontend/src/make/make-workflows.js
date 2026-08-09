(function attachMakeWorkflows(global) {
  "use strict";

  function resolveFactory(globalName, exportName) {
    return global[globalName]?.[exportName] || null;
  }

  function createMakeWorkflows(ctx) {
    const createSync = resolveFactory("TtalkakMakeSyncWorkflows", "createMakeSyncWorkflows");
    const createFolder = resolveFactory("TtalkakMakeFolderWorkflows", "createMakeFolderWorkflows");
    const createExecution = resolveFactory("TtalkakMakeExecutionWorkflows", "createMakeExecutionWorkflows");
    const createRecent = resolveFactory("TtalkakMakeRecentWorkflows", "createMakeRecentWorkflows");
    if (![createSync, createFolder, createExecution, createRecent].every((factory) => typeof factory === "function")) {
      throw new Error("Make workflow 하위 모듈을 불러오지 못했습니다.");
    }

    const sync = createSync(ctx);
    const folder = createFolder({ ...ctx, ensureBackendMakeThreadId: sync.ensureBackendMakeThreadId });
    const execution = createExecution(ctx);
    const recent = createRecent({ ...ctx, refreshMakeThreadsFromBackend: sync.refreshMakeThreadsFromBackend });
    return Object.freeze({ ...folder, ...execution, ...recent, ...sync });
  }

  const api = Object.freeze({ createMakeWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakMakeWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);

// @ts-check
import { createMakeRecentWorkflows } from "./make-recent-workflows.mjs";

/** @param {Record<string, any>} ctx */
export function createMakeWorkflows(ctx) {
  const legacy = /** @type {Record<string, any>} */ (globalThis);
  const createSync = legacy.TtalkakMakeSyncWorkflows?.createMakeSyncWorkflows;
  const createFolder = legacy.TtalkakMakeFolderWorkflows?.createMakeFolderWorkflows;
  const createExecution = legacy.TtalkakMakeExecutionWorkflows?.createMakeExecutionWorkflows;
  if (![createSync, createFolder, createExecution].every((factory) => typeof factory === "function")) {
    throw new Error("Make workflow 하위 모듈을 불러오지 못했습니다.");
  }
  const sync = createSync(ctx);
  const folder = createFolder({ ...ctx, ensureBackendMakeThreadId: sync.ensureBackendMakeThreadId });
  const execution = createExecution(ctx);
  const recent = createMakeRecentWorkflows({ ...ctx, refreshMakeThreadsFromBackend: sync.refreshMakeThreadsFromBackend });
  return Object.freeze({ ...folder, ...execution, ...recent, ...sync });
}

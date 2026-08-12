// @ts-check
import { createMakeSyncWorkflows } from "./make-sync-workflows.mjs";
import { createMakeFolderWorkflows } from "./make-folder-workflows.mjs";
import { createMakeExecutionWorkflows } from "./make-execution-workflows.mjs";
import { createMakeRecentWorkflows } from "./make-recent-workflows.mjs";
import * as makeController from "./make-controller.mjs";
import { makeState } from "./make-state.mjs";

/** @param {Record<string, any>} ctx */
export function createMakeWorkflows(ctx) {
  const sync = createMakeSyncWorkflows(ctx);
  const folder = createMakeFolderWorkflows({ ...ctx, ensureBackendMakeThreadId: sync.ensureBackendMakeThreadId });
  const execution = createMakeExecutionWorkflows({ ...ctx, makeController, makeState });
  const recent = createMakeRecentWorkflows({ ...ctx, refreshMakeThreadsFromBackend: sync.refreshMakeThreadsFromBackend });
  return Object.freeze({ ...folder, ...execution, ...recent, ...sync });
}

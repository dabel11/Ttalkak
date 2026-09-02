"use strict";
export function createMakeSyncWorkflows(ctx) {
    const { state, getMakeServerSyncEffects } = ctx;

    async function createBackendMakeThread(thread) {
      return getMakeServerSyncEffects().createBackendMakeThread(thread);
    }

    async function ensureBackendMakeThreadId(thread) {
      return getMakeServerSyncEffects().ensureBackendMakeThreadId(thread);
    }

    async function syncMakeThreadWithBackend(threadId) {
      return getMakeServerSyncEffects().syncMakeThreadWithBackend(threadId);
    }

    async function refreshMakeThreadsFromBackend({ shouldRender = true, quiet = false } = {}) {
      return getMakeServerSyncEffects().refreshMakeThreadsFromBackend({ shouldRender, quiet });
    }

    async function refreshActiveMakeThreadFromBackend(threadId = state.activeThreadId, { quiet = false, preserveScroll = false, scrollToLatest = false } = {}) {
      return getMakeServerSyncEffects().refreshActiveMakeThreadFromBackend(threadId, { quiet, preserveScroll, scrollToLatest });
    }

    return Object.freeze({ createBackendMakeThread, ensureBackendMakeThreadId, syncMakeThreadWithBackend, refreshMakeThreadsFromBackend, refreshActiveMakeThreadFromBackend });
  }

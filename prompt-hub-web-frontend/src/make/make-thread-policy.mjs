// @ts-check

/**
 * @param {TtalkakStateEntity[]} threads
 * @param {unknown} threadId
 * @returns {TtalkakStateEntity | null}
 */
export function findMakeThread(threads, threadId) {
  if (!Array.isArray(threads) || threadId === null || threadId === undefined || threadId === "") return null;
  const targetId = String(threadId);
  return threads.find((thread) => (
    String(thread?.id ?? "") === targetId
    || String(thread?.serverId ?? "") === targetId
  )) || null;
}

/**
 * @param {TtalkakStateEntity | null | undefined} thread
 * @param {(value: unknown) => boolean} isBackendNumericId
 */
export function canSplitMakeThread(thread, isBackendNumericId) {
  if (!thread || typeof isBackendNumericId !== "function") return false;
  return !isBackendNumericId(thread.serverId || thread.id);
}

export const makeThreadPolicy = Object.freeze({ canSplitMakeThread, findMakeThread });

(function attachMakeFailureRecoveryEffects(global) {
  "use strict";

  async function recoverActiveMakeThreadAfterFailure(ctx, { threadId, prompt, localMessagesSnapshot }) {
    const {
      getMakeBackendThreadId,
      refreshActiveMakeThreadFromBackend,
      shouldUseImproveThreadSync,
      state,
    } = ctx;

    if (!shouldUseImproveThreadSync()) return null;
    const backendThreadId = getMakeBackendThreadId(threadId);
    if (!backendThreadId) return null;

    const refreshedThread = await refreshActiveMakeThreadFromBackend(threadId, { quiet: true, scrollToLatest: true });
    const hasSubmittedPrompt = Array.isArray(refreshedThread?.messages)
      && refreshedThread.messages.some(
        (message) => message?.role === "user" && String(message.content || "").trim() === String(prompt || "").trim(),
      );

    if (hasSubmittedPrompt) return refreshedThread;

    state.messages = localMessagesSnapshot;
    return null;
  }

  global.TtalkakMakeFailureRecoveryEffects = Object.freeze({
    recoverActiveMakeThreadAfterFailure,
  });
})(window);

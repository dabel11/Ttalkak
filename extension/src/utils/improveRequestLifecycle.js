export function createImproveRequestCoordinator() {
  let activeRequest = null;
  let sequence = 0;

  return Object.freeze({
    start() {
      activeRequest?.controller.abort();
      const request = { id: ++sequence, controller: new AbortController(), cancelled: false };
      activeRequest = request;
      return request;
    },
    cancel() {
      if (!activeRequest) return false;
      activeRequest.cancelled = true;
      activeRequest.controller.abort();
      return activeRequest;
    },
    isCurrent(request) {
      return Boolean(request && activeRequest?.id === request.id);
    },
    canAcceptResult(request) {
      return Boolean(request && activeRequest?.id === request.id && !request.cancelled);
    },
    finish(request) {
      if (!request || activeRequest?.id !== request.id) return false;
      activeRequest = null;
      return true;
    },
  });
}

export function createCancelledMessage(prompt, id = `assistant-${Date.now()}`) {
  return {
    id,
    role: "assistant",
    content: "요청이 취소되었습니다. 입력한 내용은 유지됩니다.",
    executablePrompt: null,
    sourcePrompt: String(prompt || ""),
    sources: [],
    saved: false,
    isError: true,
    isCancelled: true,
    excludeFromHistory: true,
  };
}

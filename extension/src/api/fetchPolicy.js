export async function fetchWithAbortPolicy(url, options = {}, dependencies = {}) {
  const {
    defaultTimeoutMs,
    fetchImpl = globalThis.fetch,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
  } = dependencies;
  const { signal: externalSignal, timeoutMs = defaultTimeoutMs, ...fetchOptions } = options;
  const requestedTimeoutMs = Number(timeoutMs);
  const requestTimeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : Number(defaultTimeoutMs);
  const controller = new AbortController();
  let abortCause = "";

  const abortFromExternalSignal = () => {
    if (controller.signal.aborted) return;
    abortCause = "external";
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  const timeoutId = setTimer(() => {
    if (controller.signal.aborted) return;
    abortCause = "timeout";
    controller.abort();
  }, requestTimeoutMs);

  try {
    const response = await fetchImpl(url, { ...fetchOptions, signal: controller.signal });
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    return response;
  } catch (error) {
    if (abortCause === "timeout") {
      const timeoutError = new Error("응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      timeoutError.status = 0;
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    if (abortCause === "external" || error?.name === "AbortError") {
      const abortedError = new Error("요청이 취소되었습니다.");
      abortedError.status = 0;
      abortedError.code = "REQUEST_ABORTED";
      throw abortedError;
    }
    throw error;
  } finally {
    clearTimer(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

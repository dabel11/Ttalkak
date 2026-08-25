// @ts-check
import { useEffect, useRef, useState } from "react";
import { requestPromptImprove } from "../api/prompts";
import { createCancelledMessage, createImproveRequestCoordinator } from "../utils/improveRequestLifecycle";
import { reportMakeFailure, reportMakeOutcome } from "../utils/makeOutcomeMetrics";

export function useMakeRequest({ setComposerValue, setMessages, setRagStatus, showNotice }) {
  const [isLoading, setIsLoading] = useState(false);
  const requestInFlight = useRef(false);
  const [coordinator] = useState(() => createImproveRequestCoordinator());
  const activeContext = useRef(null);

  useEffect(() => () => {
    coordinator.cancel();
    activeContext.current = null;
    requestInFlight.current = false;
  }, [coordinator]);

  function begin(prompt, options = {}) {
    requestInFlight.current = true;
    const request = coordinator.start();
    activeContext.current = { request, prompt, startedAt: Date.now(), ...options };
    setIsLoading(true);
    setRagStatus("checking");
    return request;
  }

  function finish(request) {
    if (!coordinator.finish(request)) return false;
    if (activeContext.current?.request === request) activeContext.current = null;
    requestInFlight.current = false;
    setIsLoading(false);
    return true;
  }

  function handleCancellation(request, prompt, { restoreComposer = false } = {}) {
    if (!coordinator.isCurrent(request) || request.cancellationHandled) return false;
    request.cancellationHandled = true;
    setRagStatus("idle");
    if (restoreComposer) setComposerValue(prompt);
    setMessages((messages) => [...messages, createCancelledMessage(prompt)]);
    showNotice("요청을 취소했습니다. 입력한 내용은 입력란에 복원되었습니다.");
    return true;
  }

  function cancel() {
    const request = coordinator.cancel();
    if (!request) return false;
    const context = activeContext.current || {};
    reportMakeFailure(
      Object.assign(new Error("Request aborted"), { code: "REQUEST_ABORTED" }),
      Date.now() - Number(context.startedAt || Date.now()),
      globalThis.window,
      context.requestId || "",
    );
    handleCancellation(request, context.prompt || "", context);
    finish(request);
    return true;
  }

  async function send({ ragConfig, prompt, payload, restoreComposer = true, onSuccess, onError }) {
    const request = begin(prompt, { restoreComposer, requestId: payload?.requestId || "" });
    try {
      const data = await requestPromptImprove(ragConfig, payload, { signal: request.controller.signal });
      if (!coordinator.canAcceptResult(request)) return undefined;
      reportMakeOutcome(prompt, data, Date.now() - Number(activeContext.current?.startedAt || Date.now()));
      return await onSuccess?.(data, request);
    } catch (error) {
      if (!coordinator.isCurrent(request)) return undefined;
      reportMakeFailure(error, Date.now() - Number(activeContext.current?.startedAt || Date.now()), globalThis.window, payload?.requestId || "");
      if (error?.code === "REQUEST_ABORTED") {
        handleCancellation(request, prompt, { restoreComposer });
        return undefined;
      }
      return await onError?.(error, request);
    } finally {
      finish(request);
    }
  }

  return { cancel, coordinator, isLoading, requestInFlight, send };
}

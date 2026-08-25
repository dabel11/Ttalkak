// @ts-check
import { useRef, useState } from "react";
import { createAssistantMessage, createImproveErrorMessage } from "../conversation/conversationState.js";
import { createGuestRetryContext } from "../conversation/messageRetry.js";
import { getOrCreateSessionUuid } from "../storage/extensionStorage.js";
import { isAuthExpiredError } from "../utils/apiErrors.js";
import { getServerEditErrorMessage } from "../utils/conversationMessages.js";
import { makeTitle } from "../utils/promptUtils.js";
import { reportMakeConcurrencyRefresh, reportMakeRetry } from "../utils/makeOutcomeMetrics.js";
import { isRequestIdReusedError, isThreadConcurrencyError, resolveMakeRequestId } from "../../../shared/make-request-id.js";
import { classifyMakeError } from "../../../shared/make-message-model.js";

export function useMessageRetry({
  activeThreadId, authSession, isLoggedIn, isLoading, messages, onAuthExpired,
  ragConfig, recoverActiveServerThreadAfterFailure, refreshActiveServerThread,
  refreshServerThreads, requestInFlight, sendImproveRequest, sessionUuid,
  setActiveThreadId, setAuthMode, setLocalRecentThreads, setMessages, setRagStatus,
  setSessionUuid, showNotice, recordConcurrency, resetConcurrency,
}) {
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const serverEditRequests = useRef(new Map());

  function startEditMessage(message) {
    if (!message || message.role !== "user" || isLoading) return;
    setEditingMessageId(message.id);
    setEditingDraft(message.content || "");
  }

  function cancelEditMessage() {
    setEditingMessageId("");
    setEditingDraft("");
  }

  async function submitEditedMessage(event, messageId, promptOverride = "") {
    event?.preventDefault?.();
    if (isLoading || requestInFlight.current) {
      if (requestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
      return;
    }
    const prompt = String(promptOverride || editingDraft).trim();
    if (!prompt) return;

    if (isLoggedIn) {
      const threadId = /^\d+$/.test(String(activeThreadId.current || "")) ? Number(activeThreadId.current) : null;
      if (!threadId) {
        showNotice("서버 대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.");
        return;
      }
      const originalMessage = messages.find((message) => message.id === messageId && message.role === "user");
      const previous = serverEditRequests.current.get(String(messageId));
      const requestId = resolveMakeRequestId({
        previousRequestId: previous?.requestId || originalMessage?.requestId,
        previousPrompt: previous?.prompt || originalMessage?.content,
        prompt,
      });
      serverEditRequests.current.set(String(messageId), { prompt, requestId });
      setEditingMessageId("");
      setEditingDraft("");
      reportMakeRetry(requestId);
      return sendImproveRequest({
        ragConfig,
        prompt,
        restoreComposer: true,
        payload: { accessToken: authSession.accessToken, threadId, messageId, requestId, prompt, category: "prompt_techniques" },
        onSuccess: async () => {
          serverEditRequests.current.delete(String(messageId));
          resetConcurrency?.(threadId);
          setRagStatus("connected");
          await refreshActiveServerThread(String(threadId));
          showNotice("수정한 메시지로 다시 개선했습니다.");
        },
        onError: async (error) => {
          setRagStatus("error");
          if (isAuthExpiredError(error)) {
            await onAuthExpired?.();
            return;
          }
          if (isRequestIdReusedError(error)) {
            serverEditRequests.current.delete(String(messageId));
            await refreshActiveServerThread(String(threadId)).catch(() => false);
            showNotice("요청 상태가 변경되어 서버 대화를 새로고침했습니다. 내용을 확인한 뒤 다시 요청해주세요.");
            return;
          }
          if (isThreadConcurrencyError(error)) {
            const repeated = (recordConcurrency?.(threadId) || 1) >= 2;
            const refreshed = await refreshActiveServerThread(String(threadId)).catch(() => null);
            reportMakeConcurrencyRefresh(requestId, Boolean(refreshed));
            setMessages((current) => [...current, createImproveErrorMessage(prompt, error, refreshed
              ? { requestId, retryMode: "edit", retryMessageId: messageId, concurrencyRepeated: repeated, failure: { ...classifyMakeError(error), retryMode: "edit", repeated } }
              : {
                  requestId,
                  retryMode: "edit",
                  retryMessageId: messageId,
                  concurrencyRepeated: repeated,
                  failure: {
                    ...classifyMakeError(error),
                    kind: "concurrency_refresh",
                    retryMode: "edit",
                    repeated,
                  },
                })]);
            showNotice(refreshed
              ? "최신 대화를 불러왔습니다. 수정한 내용은 입력란에 유지되어 있습니다."
              : "연결을 확인한 뒤 최신 대화를 다시 불러와 주세요.");
            return;
          }
          if (Number(error?.status || 0) === 404) await refreshServerThreads().catch(() => {});
          else await recoverActiveServerThreadAfterFailure(prompt).catch(() => false);
          showNotice(getServerEditErrorMessage(error));
        },
      });
    }

    const retryContext = createGuestRetryContext(messages, messageId, prompt);
    if (!retryContext) return;
    const { baseMessages, editedUserMessage, history } = retryContext;
    const guestSessionUuid = sessionUuid || (await getOrCreateSessionUuid());
    if (guestSessionUuid && !sessionUuid) setSessionUuid(guestSessionUuid);
    setMessages([...baseMessages, editedUserMessage]);
    setEditingMessageId("");
    setEditingDraft("");
    reportMakeRetry();

    return sendImproveRequest({
      ragConfig,
      prompt,
      restoreComposer: true,
      payload: { prompt, category: "prompt_techniques", sessionUuid: guestSessionUuid, history },
      onSuccess: async (data) => {
        setRagStatus("connected");
        const assistantMessage = createAssistantMessage(prompt, data);
        const nextMessages = [...baseMessages, editedUserMessage, assistantMessage];
        setMessages(nextMessages);
        if (!activeThreadId.current) setActiveThreadId(`thread-${Date.now()}`);
        const threadId = activeThreadId.current;
        setLocalRecentThreads((threads) => [
          { id: threadId, title: makeTitle(prompt), time: "방금", createdAt: Date.now(), messages: nextMessages },
          ...threads.filter((thread) => thread.id !== threadId),
        ].slice(0, 30));
        showNotice("수정한 메시지를 다시 개선했습니다.");
      },
      onError: async (error) => {
        setRagStatus("error");
        if (error?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
        setMessages((items) => [...items, createImproveErrorMessage(prompt, error)]);
      },
    });
  }

  return {
    cancelEditMessage,
    editingDraft,
    editingMessageId,
    setEditingDraft,
    startEditMessage,
    submitEditedMessage,
  };
}

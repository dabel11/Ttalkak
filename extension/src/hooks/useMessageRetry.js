// @ts-check
import { useState } from "react";
import { createAssistantMessage, createImproveErrorMessage } from "../conversation/conversationState.js";
import { createGuestRetryContext } from "../conversation/messageRetry.js";
import { getOrCreateSessionUuid } from "../storage/extensionStorage.js";
import { isAuthExpiredError } from "../utils/apiErrors.js";
import { getServerEditErrorMessage } from "../utils/conversationMessages.js";
import { makeTitle } from "../utils/promptUtils.js";
import { reportMakeRetry } from "../utils/makeOutcomeMetrics.js";

export function useMessageRetry({
  activeThreadId, authSession, isLoggedIn, isLoading, messages, onAuthExpired,
  ragConfig, recoverActiveServerThreadAfterFailure, refreshActiveServerThread,
  refreshServerThreads, requestInFlight, sendImproveRequest, sessionUuid,
  setActiveThreadId, setAuthMode, setLocalRecentThreads, setMessages, setRagStatus,
  setSessionUuid, showNotice,
}) {
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");

  function startEditMessage(message) {
    if (!message || message.role !== "user" || isLoading) return;
    setEditingMessageId(message.id);
    setEditingDraft(message.content || "");
  }

  function cancelEditMessage() {
    setEditingMessageId("");
    setEditingDraft("");
  }

  async function submitEditedMessage(event, messageId) {
    event?.preventDefault?.();
    if (isLoading || requestInFlight.current) {
      if (requestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
      return;
    }
    const prompt = editingDraft.trim();
    if (!prompt) return;

    if (isLoggedIn) {
      const threadId = /^\d+$/.test(String(activeThreadId.current || "")) ? Number(activeThreadId.current) : null;
      if (!threadId) {
        showNotice("서버 대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.");
        return;
      }
      setEditingMessageId("");
      setEditingDraft("");
      reportMakeRetry();
      return sendImproveRequest({
        ragConfig,
        prompt,
        restoreComposer: true,
        payload: { accessToken: authSession.accessToken, threadId, messageId, prompt, category: "prompt_techniques" },
        onSuccess: async () => {
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

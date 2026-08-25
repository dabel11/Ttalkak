// @ts-check
import { useCallback, useRef, useState } from "react";
import { deleteMakeThread } from "../api/make";
import { getOrCreateSessionUuid } from "../storage/extensionStorage";
import { isAuthExpiredError } from "../utils/apiErrors";
import { hasPromptPlaceholders } from "../utils/conversationMessages";
import { buildImproveHistory } from "../utils/conversationHistory";
import { copyText, makePreview, makeTitle } from "../utils/promptUtils";
import { createAssistantMessage, createImproveErrorMessage, createUserMessage } from "../conversation/conversationState";
import { useServerThreadSync } from "./useServerThreads";
import { useMakeRequest } from "./useMakeRequest";
import { useConversationHistory } from "./useConversationHistory";
import { useMessageRetry } from "./useMessageRetry";
import { isRequestIdReusedError, isThreadConcurrencyError, resolveMakeRequestId } from "../../../shared/make-request-id.js";
import { reportMakeConcurrencyRefresh, reportMakeRetry } from "../utils/makeOutcomeMetrics.js";
import { classifyMakeError } from "../../../shared/make-message-model.js";

export function useConversation({
  authSession,
  executeTarget,
  ragConfig,
  sessionUuid,
  setAuthMode,
  setSavedItems,
  setSessionUuid,
  showNotice,
  onAuthExpired,
}) {
  const [messages, setMessages] = useState([]);
  const [composerValue, setComposerValue] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [ragStatus, setRagStatus] = useState("idle");
  const activeThreadId = useRef(null);
  const pendingRetry = useRef(null);
  const [activeRecentId, setActiveRecentId] = useState("");
  const setActiveThreadId = useCallback((value) => {
    const normalized = value == null ? "" : String(value);
    activeThreadId.current = normalized || null;
    setActiveRecentId(normalized);
  }, []);
  const { isLoggedIn, recentThreads, serverRecentThreads, setLocalRecentThreads, setServerRecentThreads } =
    useConversationHistory({ authSession, ragConfig, showNotice, onAuthExpired });
  const {
    recoverActiveServerThreadAfterFailure,
    refreshActiveServerThread,
    refreshServerThreads,
  } = useServerThreadSync({
    activeThreadId,
    authSession,
    ragConfig,
    setActiveThreadId,
    setMessages,
    setServerRecentThreads,
  });
  const {
    cancel: cancelImproveRequest,
    isLoading,
    requestInFlight: improveRequestInFlight,
    send: sendImproveRequest,
  } = useMakeRequest({ setComposerValue, setMessages, setRagStatus, showNotice });
  const {
    cancelEditMessage, editingDraft, editingMessageId, setEditingDraft,
    startEditMessage, submitEditedMessage,
  } = useMessageRetry({
    activeThreadId, authSession, isLoggedIn, isLoading, messages, onAuthExpired,
    ragConfig, recoverActiveServerThreadAfterFailure, refreshActiveServerThread,
    refreshServerThreads, requestInFlight: improveRequestInFlight, sendImproveRequest,
    sessionUuid, setAuthMode, setLocalRecentThreads, setMessages,
    setActiveThreadId, setRagStatus, setSessionUuid, showNotice,
  });

  function openPrompt(item) {
    if (item.messages?.length) {
      setActiveThreadId(null);
      setMessages(item.messages);
      return;
    }
    setActiveThreadId(null);
    setComposerValue(item.sourcePrompt || item.content || item.prompt || item.title);
    setMessages([]);
    showNotice("프롬프트가 입력창에 준비되었습니다.");
  }

  function openRecentThread(thread) {
    setActiveThreadId(thread.id);
    setMessages(thread.messages || []);
  }

  function startNewChat() {
    pendingRetry.current = null;
    setActiveThreadId(null);
    setMessages([]);
    setComposerValue("");
    cancelEditMessage();
  }

  function prepareFailedRetry(message) {
    const prompt = String(message?.sourcePrompt || "").trim();
    if (!prompt) return false;
    pendingRetry.current = {
      errorMessageId: String(message.id || ""),
      prompt,
      requestId: String(message.requestId || ""),
      threadId: String(activeThreadId.current || ""),
    };
    reportMakeRetry(message.requestId || "");
    setComposerValue(prompt);
    return true;
  }

  async function copyMessage(message) {
    const prompt = message.executablePrompt || "";
    if (!prompt && message.role === "assistant") {
      showNotice("실행 가능한 개선 프롬프트가 아직 없습니다.");
      return;
    }
    await copyText(prompt || message.content);
    setCopiedId(message.id);
    showNotice("프롬프트를 복사했습니다.");
    window.setTimeout(() => setCopiedId(""), 1100);
  }

  function toggleSave(messageId) {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    if (authSession?.accessToken) {
      showNotice("개선 결과는 서버 최근 대화로 동기화됩니다. 보관함 저장은 서버 프롬프트에서 지원됩니다.");
      return;
    }
    const nextSaved = !message.saved;

    setMessages((items) =>
      items.map((m) => (m.id === messageId ? { ...m, saved: nextSaved } : m))
    );

    if (nextSaved) {
      setSavedItems((items) =>
        items.some((i) => i.id === messageId)
          ? items
          : [
              {
                id: message.id,
                title: makeTitle(message.sourcePrompt || message.content),
                preview: makePreview(message.content),
                content: message.content,
                executablePrompt: message.executablePrompt,
                sourcePrompt: message.sourcePrompt || message.content,
                messages,
                tags: ["첨삭"],
              },
              ...items,
            ]
      );
      showNotice("보관함에 저장했습니다.");
    } else {
      setSavedItems((items) => items.filter((i) => i.id !== messageId));
      showNotice("저장을 해제했습니다.");
    }
  }

  async function executeMessage(message) {
    const prompt = message.executablePrompt || "";
    if (!prompt) {
      showNotice("실행 가능한 개선 프롬프트가 아직 없습니다.");
      return;
    }
    if (hasPromptPlaceholders(prompt)) {
      const proceed = window.confirm(
        "아직 채워지지 않은 정보가 있습니다.\n\n그대로 실행하거나, 취소한 뒤 질문에 답해 더 정확하게 만들 수 있습니다."
      );
      if (!proceed) return;
    }
    const targetLabel = executeTarget === "claude" ? "Claude" : executeTarget === "gemini" ? "Gemini" : "선택한 AI 사이트";

    if (executeTarget === "claude") {
      await copyText(prompt);
      showNotice("Claude 자동 입력 대신 복사 방식으로 동작합니다. 입력창에 붙여넣어 주세요.");
      return;
    }

    if (window.chrome?.runtime?.sendMessage) {
      window.chrome.runtime.sendMessage(
        { type: "EXECUTE_PROMPT", prompt, target: executeTarget },
        async (response) => {
          if (response?.ok) {
            showNotice(`${targetLabel}에 프롬프트를 입력했습니다.`);
            return;
          }
          await copyText(prompt);
          showNotice(`${targetLabel} 자동 입력에 실패했습니다. 복사한 프롬프트를 입력창에 붙여넣어 주세요.`);
        }
      );
      return;
    }

    await copyText(prompt);
    showNotice("미리보기 모드에서는 자동 입력을 사용할 수 없습니다. 복사한 프롬프트를 붙여넣어 주세요.");
  }

  async function submitPrompt(promptOverride = "") {
    const prompt = String(promptOverride || composerValue).trim();
    if (!prompt || isLoading || improveRequestInFlight.current) {
      if (prompt && improveRequestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
      return;
    }
    const guestSessionUuid = authSession?.accessToken ? "" : sessionUuid || (await getOrCreateSessionUuid());
    if (guestSessionUuid && !sessionUuid) setSessionUuid(guestSessionUuid);
    const history = buildImproveHistory(messages);
    const activeServerThreadId = /^\d+$/.test(String(activeThreadId.current || "")) ? Number(activeThreadId.current) : null;
    const retry = pendingRetry.current;
    const retryMatches = Boolean(
      retry && authSession?.accessToken && activeServerThreadId
      && retry.prompt === prompt && retry.threadId === String(activeServerThreadId)
    );
    const requestId = authSession?.accessToken && activeServerThreadId
      ? resolveMakeRequestId({
          previousRequestId: retryMatches ? retry.requestId : "",
          previousPrompt: retryMatches ? retry.prompt : "",
          prompt,
        })
      : "";
    const baseMessages = retryMatches
      ? messages.filter((message) => message.id !== retry.errorMessageId)
      : messages;
    const existingUserMessage = retryMatches
      ? [...baseMessages].reverse().find((message) => message.role === "user" && message.requestId === requestId)
      : null;
    const requestUserMessage = existingUserMessage || createUserMessage(prompt, requestId ? { requestId } : {});
    const improvePayload = {
      prompt,
      category: "prompt_techniques",
      accessToken: authSession?.accessToken || "",
      sessionUuid: guestSessionUuid,
      ...(authSession?.accessToken && activeServerThreadId ? { threadId: activeServerThreadId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(!authSession?.accessToken ? { history } : {}),
    };

    setMessages(retryMatches ? baseMessages : [...baseMessages, requestUserMessage]);
    setComposerValue("");
    return sendImproveRequest({
      ragConfig,
      prompt,
      payload: improvePayload,
      restoreComposer: true,
      onSuccess: async (data) => {
        pendingRetry.current = null;
        setRagStatus("connected");
        if (authSession?.accessToken && data.threadId) setActiveThreadId(data.threadId);
        const assistantMsg = createAssistantMessage(prompt, data);
        const nextMessages = [...baseMessages, ...(existingUserMessage ? [] : [requestUserMessage]), assistantMsg];
        setMessages((prev) => [...prev, assistantMsg]);
        if (isLoggedIn) {
          await refreshActiveServerThread(String(data.threadId || activeThreadId.current || ""));
        } else {
          if (!activeThreadId.current) setActiveThreadId(`thread-${Date.now()}`);
          const threadId = activeThreadId.current;
          setLocalRecentThreads((prev) => [
            { id: threadId, title: makeTitle(prompt), time: "방금", createdAt: Date.now(), messages: nextMessages },
            ...prev.filter((t) => t.id !== threadId),
          ].slice(0, 30));
        }
      },
      onError: async (err) => {
        setRagStatus("error");
        if (isAuthExpiredError(err)) {
          await onAuthExpired();
          return;
        }
        if (err?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
        if (isRequestIdReusedError(err)) {
          pendingRetry.current = null;
          await refreshActiveServerThread(String(activeServerThreadId || "")).catch(() => false);
          showNotice("요청 상태가 변경되어 서버 대화를 새로고침했습니다. 내용을 확인한 뒤 다시 요청해주세요.");
          return;
        }
        if (isThreadConcurrencyError(err)) {
          pendingRetry.current = null;
          const refreshed = await refreshActiveServerThread(String(activeServerThreadId || "")).catch(() => null);
          reportMakeConcurrencyRefresh(requestId, Boolean(refreshed));
          setComposerValue(prompt);
          if (refreshed) {
            setMessages((current) => [...current, createImproveErrorMessage(prompt, err, { requestId })]);
            showNotice("최신 대화를 반영했습니다. 다시 시도 버튼으로 요청을 재전송할 수 있습니다.");
          } else {
            setMessages((current) => [...current, createImproveErrorMessage(prompt, err, {
              requestId,
              failure: {
                ...classifyMakeError(err),
                kind: "concurrency_refresh",
                message: "최신 대화를 불러오지 못했습니다. 연결 상태를 확인한 뒤 대화를 다시 불러와 주세요.",
              },
            })]);
            showNotice("최신 대화를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 열어주세요.");
          }
          return;
        }
        const recovered = await recoverActiveServerThreadAfterFailure(prompt).catch(() => false);
        if (recovered) {
          pendingRetry.current = null;
          showNotice("요청 상태를 서버 대화 기준으로 다시 확인했습니다.");
          return;
        }
        setMessages((prev) => [...prev, createImproveErrorMessage(prompt, err, { requestId })]);
      },
    });
  }

  async function retryFailedMessage(message) {
    const prompt = String(message?.sourcePrompt || "").trim();
    if (!prompt || !prepareFailedRetry(message)) return false;
    if (message?.retryMode === "edit" && message?.retryMessageId) {
      await submitEditedMessage(null, message.retryMessageId, prompt);
    } else {
      await submitPrompt(prompt);
    }
    return true;
  }

  async function refreshFailedConcurrency(message) {
    const requestId = String(message?.requestId || "");
    const refreshed = await refreshActiveServerThread(String(activeThreadId.current || "")).catch(() => null);
    reportMakeConcurrencyRefresh(requestId, Boolean(refreshed));
    if (!refreshed) {
      showNotice("최신 대화를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
      return false;
    }
    setMessages((current) => [...current, createImproveErrorMessage(message.sourcePrompt, {
      status: 409,
      code: "THREAD_CONCURRENTLY_UPDATED",
      message: "최신 대화를 반영했습니다. 다시 시도해 주세요.",
    }, {
      requestId,
      retryMode: message.retryMode,
      retryMessageId: message.retryMessageId,
    })]);
    setComposerValue(String(message.sourcePrompt || ""));
    showNotice("최신 대화를 반영했습니다. 다시 시도 버튼으로 요청을 재전송할 수 있습니다.");
    return true;
  }

  function requestDeleteRecentThreadLocal(id, setConfirmAction) {
    if (isLoggedIn) {
      setConfirmAction({
        title: "서버 최근 대화 삭제",
        message: "서버 최근 대화 삭제 API가 준비되면 삭제할 수 있습니다. 현재는 웹과 동일한 서버 목록을 표시합니다.",
        confirmLabel: "확인",
        onConfirm: () => {},
      });
      return;
    }

    setConfirmAction({
      title: "최근 대화 삭제",
      message: "이 최근 대화를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => {
        setLocalRecentThreads((prev) => prev.filter((t) => t.id !== id));
        if (String(activeThreadId.current || "") === String(id || "")) {
          setActiveThreadId(null);
          setMessages([]);
        }
      },
    });
  }

  function requestDeleteRecentThread(id, setConfirmAction) {
    if (!isLoggedIn) {
      requestDeleteRecentThreadLocal(id, setConfirmAction);
      return;
    }

    const thread = serverRecentThreads.find((item) => item.id === id || item.serverId === id);
    const serverId = thread?.serverId || (/^\d+$/.test(String(id || "")) ? id : "");

    setConfirmAction({
      title: "최근 대화 삭제",
      message: "이 서버 최근 대화를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: async () => {
        if (!serverId) {
          showNotice("삭제할 수 있는 서버 대화 ID가 없습니다.");
          return;
        }

        try {
          await deleteMakeThread(ragConfig, serverId, authSession.accessToken);
          setServerRecentThreads((prev) => prev.filter((item) => item.id !== id && item.serverId !== serverId));
          if ([id, serverId].some((value) => String(value || "") === String(activeThreadId.current || ""))) {
            setActiveThreadId(null);
            setMessages([]);
          }
          showNotice("최근 대화를 삭제했습니다.");
          await refreshServerThreads();
        } catch (error) {
          if (isAuthExpiredError(error)) {
            await onAuthExpired?.();
            return;
          }

          if (Number(error?.status || 0) === 404) {
            showNotice("이미 삭제되었거나 접근할 수 없는 대화입니다.");
            setServerRecentThreads((prev) => prev.filter((item) => item.id !== id && item.serverId !== serverId));
            if ([id, serverId].some((value) => String(value || "") === String(activeThreadId.current || ""))) {
              setActiveThreadId(null);
              setMessages([]);
            }
            await refreshServerThreads().catch(() => {});
            return;
          }

          showNotice(error?.message || "최근 대화 삭제에 실패했습니다.");
        }
      },
    });
  }

  return {
    messages,
    composerValue,
    setComposerValue,
    isLoading,
    copiedId,
    ragStatus,
    canEditUserMessages: true,
    editingMessageId,
    editingDraft,
    recentThreads,
    activeRecentId,
    openPrompt,
    openRecentThread,
    startNewChat,
    copyMessage,
    toggleSave,
    executeMessage,
    submitPrompt,
    cancelImproveRequest,
    startEditMessage,
    setEditingDraft,
    cancelEditMessage,
    submitEditedMessage,
    requestDeleteRecentThread,
    prepareFailedRetry,
    retryFailedMessage,
    refreshFailedConcurrency,
  };
}

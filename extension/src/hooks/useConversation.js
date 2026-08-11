import { useEffect, useRef, useState } from "react";
import { deleteMakeThread } from "../api/make";
import { requestPromptImprove } from "../api/prompts";
import { STORAGE } from "../constants";
import { getOrCreateSessionUuid, loadStorage, saveStorage } from "../storage/extensionStorage";
import { isAuthExpiredError } from "../utils/apiErrors";
import { buildAskMessage, buildNoEvidenceMessage, getExecutablePrompt, getServerEditErrorMessage, hasPromptPlaceholders } from "../utils/conversationMessages";
import { buildImproveHistory } from "../utils/conversationHistory";
import { copyText, makePreview, makeTitle } from "../utils/promptUtils";
import { createCancelledMessage, createImproveRequestCoordinator } from "../utils/improveRequestLifecycle";
import { createServerThreadSync } from "./useServerThreads";

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
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [ragStatus, setRagStatus] = useState("idle");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingDraft, setEditingDraft] = useState("");
  const [localRecentThreads, setLocalRecentThreads] = useState(() => loadStorage(STORAGE.RECENTS, []));
  const [serverRecentThreads, setServerRecentThreads] = useState([]);
  const activeThreadId = useRef(null);
  const improveRequestInFlight = useRef(false);
  const improveRequests = useRef(null);
  if (!improveRequests.current) improveRequests.current = createImproveRequestCoordinator();
  const isLoggedIn = Boolean(authSession?.accessToken);
  const recentThreads = isLoggedIn ? serverRecentThreads : localRecentThreads;
  const {
    recoverActiveServerThreadAfterFailure,
    refreshActiveServerThread,
    refreshServerThreads,
  } = createServerThreadSync({
    activeThreadId,
    authSession,
    ragConfig,
    setMessages,
    setServerRecentThreads,
  });

  useEffect(() => {
    if (!isLoggedIn) saveStorage(STORAGE.RECENTS, localRecentThreads);
  }, [isLoggedIn, localRecentThreads]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      setServerRecentThreads([]);
      return () => {
        cancelled = true;
      };
    }

    async function hydrateServerThreads() {
      try {
        const items = await requestMakeThreads(ragConfig, authSession.accessToken);
        if (cancelled) return;
        setServerRecentThreads(items);
      } catch (error) {
        if (cancelled) return;
        if (isAuthExpiredError(error)) {
          await onAuthExpired?.();
          return;
        }
        showNotice(error?.message || "서버 최근 대화를 불러오지 못했습니다.");
      }
    }

    hydrateServerThreads();
    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, isLoggedIn, ragConfig.backendApiUrl]);

  function openPrompt(item) {
    if (item.messages?.length) {
      activeThreadId.current = null;
      setMessages(item.messages);
      return;
    }
    activeThreadId.current = null;
    setComposerValue(item.sourcePrompt || item.content || item.prompt || item.title);
    setMessages([]);
    showNotice("프롬프트가 입력창에 준비되었습니다.");
  }

  function openRecentThread(thread) {
    activeThreadId.current = thread.id;
    setMessages(thread.messages || []);
  }

  function startNewChat() {
    activeThreadId.current = null;
    setMessages([]);
    setComposerValue("");
    setEditingMessageId("");
    setEditingDraft("");
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

  async function refreshServerThreadsAfterImprove() {
    if (!authSession?.accessToken) return;
    try {
      await refreshServerThreads();
    } catch (error) {
      if (isAuthExpiredError(error)) {
        await onAuthExpired?.();
        return;
      }
      showNotice(error?.message || "서버 최근 대화에 저장하지 못했습니다.");
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

  const activeImproveContext = useRef(null);

  function beginImproveRequest(prompt, options = {}) {
    improveRequestInFlight.current = true;
    const request = improveRequests.current.start();
    activeImproveContext.current = { request, prompt, ...options };
    return request;
  }

  function finishImproveRequest(request) {
    if (!improveRequests.current.finish(request)) return false;
    if (activeImproveContext.current?.request === request) activeImproveContext.current = null;
    improveRequestInFlight.current = false;
    setIsLoading(false);
    return true;
  }

  function handleImproveCancellation(request, prompt, { restoreComposer = false } = {}) {
    if (!improveRequests.current.isCurrent(request)) return false;
    if (request.cancellationHandled) return false;
    request.cancellationHandled = true;
    setRagStatus("idle");
    if (restoreComposer) setComposerValue(prompt);
    setMessages((prev) => [...prev, createCancelledMessage(prompt)]);
    showNotice("요청을 취소했습니다. 입력한 내용은 유지됩니다.");
    return true;
  }

  function cancelImproveRequest() {
    const request = improveRequests.current.cancel();
    if (!request) return false;
    const context = activeImproveContext.current;
    handleImproveCancellation(request, context?.prompt || "", context || {});
    finishImproveRequest(request);
    return true;
  }

  async function submitPrompt() {
    const prompt = composerValue.trim();
    if (!prompt || isLoading || improveRequestInFlight.current) {
      if (prompt && improveRequestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
      return;
    }
    const guestSessionUuid = authSession?.accessToken ? "" : sessionUuid || (await getOrCreateSessionUuid());
    if (guestSessionUuid && !sessionUuid) setSessionUuid(guestSessionUuid);
    const request = beginImproveRequest(prompt, { restoreComposer: true });

    const userMsg = { id: `user-${Date.now()}`, role: "user", content: prompt };
    const history = buildImproveHistory(messages);
    const activeServerThreadId = /^\d+$/.test(String(activeThreadId.current || "")) ? Number(activeThreadId.current) : null;
    const improvePayload = {
      prompt,
      category: "prompt_techniques",
      accessToken: authSession?.accessToken || "",
      sessionUuid: guestSessionUuid,
      ...(authSession?.accessToken && activeServerThreadId ? { threadId: activeServerThreadId } : {}),
      ...(!authSession?.accessToken ? { history } : {}),
    };

    setMessages((prev) => [...prev, userMsg]);
    setComposerValue("");
    setIsLoading(true);
    setRagStatus("checking");

    try {
      const data = await requestPromptImprove(ragConfig, improvePayload, { signal: request.controller.signal });
      if (!improveRequests.current.canAcceptResult(request)) return;
      setRagStatus("connected");
      if (authSession?.accessToken && data.threadId) {
        activeThreadId.current = String(data.threadId);
      }

      if (data.mode === "ask") {
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          mode: "ask",
          content: buildAskMessage(data),
          answer: data.answer || "",
          questions: data.questions || [],
          changes: data.changes || [],
          fields: data.fields || [],
          techniques: data.techniques || data.techniquesApplied || [],
          summary: data.summary || "",
          executablePrompt: null,
          sourcePrompt: prompt,
          sources: data.sources || [],
          saved: false,
        };
        const nextMessages = [...messages, userMsg, assistantMsg];
        setMessages((prev) => [...prev, assistantMsg]);
        if (isLoggedIn) {
          await refreshActiveServerThread(String(data.threadId || activeThreadId.current || ""));
        } else {
          if (!activeThreadId.current) activeThreadId.current = `thread-${Date.now()}`;
          const threadId = activeThreadId.current;
          setLocalRecentThreads((prev) => [
            { id: threadId, title: makeTitle(prompt), time: "방금", messages: nextMessages },
            ...prev.filter((t) => t.id !== threadId),
          ].slice(0, 30));
        }
        return;
      }

      if (data.ragStatus === "no_evidence") {
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          mode: "improve",
          content: buildNoEvidenceMessage(prompt, data),
          answer: data.answer || "",
          questions: data.questions || [],
          changes: data.changes || [],
          fields: data.fields || [],
          techniques: data.techniques || data.techniquesApplied || [],
          summary: data.summary || "",
          executablePrompt: getExecutablePrompt(data),
          sourcePrompt: prompt,
          sources: data.sources || [],
          saved: false,
          excludeFromHistory: true,
        };
        const nextMessages = [...messages, userMsg, assistantMsg];
        setMessages((prev) => [...prev, assistantMsg]);
        if (isLoggedIn) {
          await refreshActiveServerThread(String(data.threadId || activeThreadId.current || ""));
        } else {
          if (!activeThreadId.current) activeThreadId.current = `thread-${Date.now()}`;
          const threadId = activeThreadId.current;
          setLocalRecentThreads((prev) => [
            { id: threadId, title: makeTitle(prompt), time: "방금", messages: nextMessages },
            ...prev.filter((t) => t.id !== threadId),
          ].slice(0, 30));
        }
        return;
      }

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        mode: data.mode || "improve",
        content: data.improvedPrompt || data.answer,
        answer: data.answer || "",
        questions: data.questions || [],
        changes: data.changes || [],
        fields: data.fields || [],
        techniques: data.techniques || data.techniquesApplied || [],
        summary: data.summary || "",
        executablePrompt: getExecutablePrompt(data),
        sourcePrompt: prompt,
        sources: data.sources || [],
        saved: false,
      };
      const nextMessages = [...messages, userMsg, assistantMsg];
      setMessages((prev) => [...prev, assistantMsg]);

      if (isLoggedIn) {
        await refreshActiveServerThread(String(data.threadId || activeThreadId.current || ""));
        return;
      }

      if (!activeThreadId.current) activeThreadId.current = `thread-${Date.now()}`;
      const threadId = activeThreadId.current;
      setLocalRecentThreads((prev) => {
        const updatedThread = {
          id: threadId,
          title: makeTitle(prompt),
          time: "방금",
          messages: nextMessages,
        };
        return [updatedThread, ...prev.filter((t) => t.id !== threadId)].slice(0, 30);
      });
    } catch (err) {
      if (!improveRequests.current.isCurrent(request)) return;
      if (err?.code === "REQUEST_ABORTED") {
        handleImproveCancellation(request, prompt);
        return;
      }
      const isNetwork = err instanceof TypeError;
      setRagStatus("error");
      if (isAuthExpiredError(err)) {
        await onAuthExpired();
        return;
      }
      if (err?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
      const recovered = await recoverActiveServerThreadAfterFailure(prompt).catch(() => false);
      if (recovered) {
        showNotice("요청 상태를 서버 대화 기준으로 다시 확인했습니다.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: isNetwork
            ? "백엔드 API에 연결할 수 없습니다.\n\n잠시 후 다시 시도해주세요."
            : `오류가 발생했습니다.\n\n${err.message}`,
          executablePrompt: null,
          sourcePrompt: prompt,
          sources: [],
          saved: false,
          isError: true,
        },
      ]);
    } finally {
      finishImproveRequest(request);
    }
  }

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
    if (isLoggedIn) {
      if (isLoading || improveRequestInFlight.current) {
        if (improveRequestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
        return;
      }
      const prompt = editingDraft.trim();
      const threadId = /^\d+$/.test(String(activeThreadId.current || "")) ? Number(activeThreadId.current) : null;
      if (!prompt) return;
      if (!threadId) {
        showNotice("서버 대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.");
        return;
      }

      const request = beginImproveRequest(prompt, { restoreComposer: true });
      setEditingMessageId("");
      setEditingDraft("");
      setIsLoading(true);
      setRagStatus("checking");

      try {
        await requestPromptImprove(ragConfig, {
          accessToken: authSession.accessToken,
          threadId,
          messageId,
          prompt,
          category: "prompt_techniques",
        }, { signal: request.controller.signal });
        if (!improveRequests.current.canAcceptResult(request)) return;
        setRagStatus("connected");
        await refreshActiveServerThread(String(threadId));
        showNotice("수정한 메시지로 다시 개선했습니다.");
      } catch (error) {
        if (!improveRequests.current.isCurrent(request)) return;
        if (error?.code === "REQUEST_ABORTED") {
          handleImproveCancellation(request, prompt, { restoreComposer: true });
          return;
        }
        setRagStatus("error");
        if (isAuthExpiredError(error)) {
          await onAuthExpired?.();
          return;
        }
        if (Number(error?.status || 0) === 404) {
          await refreshServerThreads().catch(() => {});
        } else {
          await recoverActiveServerThreadAfterFailure(prompt).catch(() => false);
        }
        showNotice(getServerEditErrorMessage(error));
      } finally {
        finishImproveRequest(request);
      }
      return;
    }
    if (isLoading || improveRequestInFlight.current) {
      if (improveRequestInFlight.current) showNotice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.");
      return;
    }

    const prompt = editingDraft.trim();
    const index = messages.findIndex((message) => message.id === messageId && message.role === "user");
    if (index < 0 || !prompt) return;
    const baseMessages = messages.slice(0, index);
    const editedUserMsg = {
      ...messages[index],
      content: prompt,
      editedAt: new Date().toISOString(),
    };
    const history = buildImproveHistory(baseMessages);
    const guestSessionUuid = sessionUuid || (await getOrCreateSessionUuid());
    if (guestSessionUuid && !sessionUuid) setSessionUuid(guestSessionUuid);
    const request = beginImproveRequest(prompt, { restoreComposer: true });

    setMessages([...baseMessages, editedUserMsg]);
    setEditingMessageId("");
    setEditingDraft("");
    setIsLoading(true);
    setRagStatus("checking");

    try {
      const data = await requestPromptImprove(ragConfig, {
        prompt,
        category: "prompt_techniques",
        sessionUuid: guestSessionUuid,
        history,
      }, { signal: request.controller.signal });
      if (!improveRequests.current.canAcceptResult(request)) return;
      setRagStatus("connected");

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        mode: data.mode || "improve",
        content:
          data.mode === "ask"
            ? buildAskMessage(data)
            : data.ragStatus === "no_evidence"
            ? buildNoEvidenceMessage(prompt, data)
            : data.improvedPrompt || data.answer,
        answer: data.answer || "",
        questions: data.questions || [],
        changes: data.changes || [],
        fields: data.fields || [],
        techniques: data.techniques || data.techniquesApplied || [],
        summary: data.summary || "",
        executablePrompt: getExecutablePrompt(data),
        sourcePrompt: prompt,
        sources: data.sources || [],
        saved: false,
        excludeFromHistory: data.ragStatus === "no_evidence",
      };
      const nextMessages = [...baseMessages, editedUserMsg, assistantMsg];
      setMessages(nextMessages);

      if (!activeThreadId.current) activeThreadId.current = `thread-${Date.now()}`;
      const threadId = activeThreadId.current;
      setLocalRecentThreads((prev) => {
        const updatedThread = {
          id: threadId,
          title: makeTitle(prompt),
          time: "방금",
          messages: nextMessages,
        };
        return [updatedThread, ...prev.filter((thread) => thread.id !== threadId)].slice(0, 30);
      });
      showNotice("수정한 메시지를 다시 개선했습니다.");
    } catch (err) {
      if (!improveRequests.current.isCurrent(request)) return;
      if (err?.code === "REQUEST_ABORTED") {
        handleImproveCancellation(request, prompt);
        return;
      }
      const isNetwork = err instanceof TypeError;
      setRagStatus("error");
      if (err?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: isNetwork
            ? "백엔드 API에 연결할 수 없습니다.\n\n잠시 후 다시 시도해주세요."
            : `오류가 발생했습니다.\n\n${err.message}`,
          executablePrompt: null,
          sourcePrompt: prompt,
          sources: [],
          saved: false,
          isError: true,
        },
      ]);
    } finally {
      finishImproveRequest(request);
    }
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
      onConfirm: () => setLocalRecentThreads((prev) => prev.filter((t) => t.id !== id)),
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
          if (activeThreadId.current === id || activeThreadId.current === serverId) {
            activeThreadId.current = null;
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
  };
}

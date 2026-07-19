import { useEffect, useRef, useState } from "react";
import { requestPromptImprove } from "../api/prompts";
import { MODE_META, STORAGE } from "../constants";
import { getOrCreateSessionUuid, loadStorage, saveStorage } from "../storage/extensionStorage";
import { isAuthExpiredError } from "../utils/apiErrors";
import { copyText, makePreview, makeTitle } from "../utils/promptUtils";

export function useConversation({
  authSession,
  executeTarget,
  ragConfig,
  ragMode,
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
  const [recentThreads, setRecentThreads] = useState(() => loadStorage(STORAGE.RECENTS, []));
  const activeThreadId = useRef(null);

  useEffect(() => saveStorage(STORAGE.RECENTS, recentThreads), [recentThreads]);

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
  }

  async function copyMessage(message) {
    await copyText(message.executablePrompt || message.content);
    setCopiedId(message.id);
    showNotice("프롬프트를 복사했습니다.");
    window.setTimeout(() => setCopiedId(""), 1100);
  }

  function toggleSave(messageId) {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
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
      showNotice("Saved에 저장했습니다.");
    } else {
      setSavedItems((items) => items.filter((i) => i.id !== messageId));
      showNotice("저장을 해제했습니다.");
    }
  }

  async function executeMessage(message) {
    const prompt = message.executablePrompt || message.content;
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

  async function submitPrompt() {
    const prompt = composerValue.trim();
    if (!prompt || isLoading) return;
    const guestSessionUuid = authSession?.accessToken ? "" : sessionUuid || (await getOrCreateSessionUuid());
    if (guestSessionUuid && !sessionUuid) setSessionUuid(guestSessionUuid);

    const userMsg = { id: `user-${Date.now()}`, role: "user", content: prompt };
    const history = messages
      .filter((m) => !m.isError && !m.excludeFromHistory)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setComposerValue("");
    setIsLoading(true);
    setRagStatus("checking");

    try {
      const data = await requestPromptImprove(ragConfig, {
        prompt,
        history,
        collectionName: ragConfig.collectionName,
        topK: ragConfig.topK,
        model: ragConfig.model,
        accessToken: authSession?.accessToken || "",
        sessionUuid: guestSessionUuid,
      });
      setRagStatus("connected");

      if (data.ragStatus === "no_evidence") {
        const meta = MODE_META[ragMode];
        const examples = meta.examples.map((example) => `- ${example}`).join("\n");
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              data.answer ||
              data.ragMessage ||
              `"${prompt}"와 관련된 기법 근거는 찾지 못했지만 기본 첨삭을 수행했습니다.\n\n현재 모드: ${meta.label}\n\n이런 질문을 입력해보세요:\n${examples}`,
            executablePrompt: data.improvedPrompt || null,
            sourcePrompt: prompt,
            sources: data.sources || [],
            saved: false,
            excludeFromHistory: true,
          },
        ]);
        return;
      }

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer || data.improvedPrompt,
        executablePrompt: data.improvedPrompt || null,
        sourcePrompt: prompt,
        sources: data.sources || [],
        saved: false,
      };
      const nextMessages = [...messages, userMsg, assistantMsg];
      setMessages((prev) => [...prev, assistantMsg]);

      if (!activeThreadId.current) activeThreadId.current = `thread-${Date.now()}`;
      const threadId = activeThreadId.current;
      setRecentThreads((prev) => {
        const updatedThread = {
          id: threadId,
          title: makeTitle(prompt),
          time: "방금",
          messages: nextMessages,
        };
        return [updatedThread, ...prev.filter((t) => t.id !== threadId)].slice(0, 30);
      });
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      setRagStatus("error");
      if (isAuthExpiredError(err)) await onAuthExpired();
      if (err?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: isNetwork
            ? `백엔드 API에 연결할 수 없습니다.\n\n현재 설정된 주소: ${ragConfig.backendApiUrl}\n\nSpring Boot 서버가 실행 중인지 확인하거나 설정에서 Backend API URL을 확인해주세요.`
            : `오류가 발생했습니다.\n\n${err.message}`,
          executablePrompt: null,
          sourcePrompt: prompt,
          sources: [],
          saved: false,
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function requestDeleteRecentThread(id, setConfirmAction) {
    setConfirmAction({
      title: "최근 대화 삭제",
      message: "이 최근 대화를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => setRecentThreads((prev) => prev.filter((t) => t.id !== id)),
    });
  }

  return {
    messages,
    composerValue,
    setComposerValue,
    isLoading,
    copiedId,
    ragStatus,
    recentThreads,
    openPrompt,
    openRecentThread,
    startNewChat,
    copyMessage,
    toggleSave,
    executeMessage,
    submitPrompt,
    requestDeleteRecentThread,
  };
}

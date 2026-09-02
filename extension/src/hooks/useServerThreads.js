import { useEffect, useRef } from "react";
import { requestMakeThread, requestMakeThreads } from "../api/make";

export function useServerThreadSync({
  activeThreadId,
  authSession,
  ragConfig,
  setActiveThreadId,
  setMessages,
  setServerRecentThreads,
}) {
  const lifecycleController = useRef(new AbortController());
  useEffect(() => {
    if (lifecycleController.current.signal.aborted) lifecycleController.current = new AbortController();
    const controller = lifecycleController.current;
    return () => controller.abort();
  }, []);

  async function refreshServerThreads() {
    if (!authSession?.accessToken) return [];
    const signal = lifecycleController.current.signal;
    const items = await requestMakeThreads(ragConfig, authSession.accessToken, { signal });
    if (signal.aborted) return [];
    setServerRecentThreads(items);
    return items;
  }

  async function refreshActiveServerThread(threadId = activeThreadId.current) {
    const signal = lifecycleController.current.signal;
    const targetId = String(threadId || "");
    if (targetId) {
      try {
        const activeThread = await requestMakeThread(ragConfig, targetId, authSession.accessToken, { signal });
        if (signal.aborted) return null;
        if (activeThread) {
          setActiveThreadId(activeThread.serverId || activeThread.id);
          setServerRecentThreads((prev) => [
            activeThread,
            ...(Array.isArray(prev) ? prev : []).filter((thread) => {
              const serverId = String(thread.serverId || "");
              const id = String(thread.id || "");
              return serverId !== String(activeThread.serverId || activeThread.id) && id !== String(activeThread.id);
            }),
          ]);
          setMessages(activeThread.messages || []);
          return activeThread;
        }
      } catch (error) {
        if (Number(error?.status || 0) !== 404) {
          throw error;
        }
      }
    }

    const items = await refreshServerThreads();
    const activeThread = items.find((thread) => {
      const serverId = String(thread.serverId || "");
      const id = String(thread.id || "");
      return Boolean(targetId) && (serverId === targetId || id === targetId);
    });
    if (activeThread) {
      setActiveThreadId(activeThread.serverId || activeThread.id);
      setMessages(activeThread.messages || []);
    }
    return activeThread;
  }

  async function recoverActiveServerThreadAfterFailure(prompt) {
    if (!authSession?.accessToken || !activeThreadId.current) return false;
    const activeThread = await refreshActiveServerThread(String(activeThreadId.current));
    return Boolean(
      activeThread?.messages?.some(
        (message) => message?.role === "user" && String(message.content || "").trim() === String(prompt || "").trim(),
      ),
    );
  }

  return {
    recoverActiveServerThreadAfterFailure,
    refreshActiveServerThread,
    refreshServerThreads,
  };
}

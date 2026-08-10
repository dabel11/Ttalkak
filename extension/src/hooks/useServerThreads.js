import { requestMakeThread, requestMakeThreads } from "../api/make";

export function createServerThreadSync({
  activeThreadId,
  authSession,
  ragConfig,
  setMessages,
  setServerRecentThreads,
}) {
  async function refreshServerThreads() {
    if (!authSession?.accessToken) return [];
    const items = await requestMakeThreads(ragConfig, authSession.accessToken);
    setServerRecentThreads(items);
    return items;
  }

  async function refreshActiveServerThread(threadId = activeThreadId.current) {
    const targetId = String(threadId || "");
    if (targetId) {
      try {
        const activeThread = await requestMakeThread(ragConfig, targetId, authSession.accessToken);
        if (activeThread) {
          activeThreadId.current = String(activeThread.serverId || activeThread.id);
          setServerRecentThreads((prev) => [
            activeThread,
            ...prev.filter((thread) => {
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
      activeThreadId.current = String(activeThread.serverId || activeThread.id);
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

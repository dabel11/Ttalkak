import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthModal } from "./components/AuthModal";
import { ChatFeed } from "./components/ChatFeed";
import { Composer } from "./components/Composer";
import { ConfirmModal } from "./components/ConfirmModal";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { useAuth } from "./hooks/useAuth";
import { useConversation } from "./hooks/useConversation";
import { useAskAnswers } from "./hooks/useAskAnswers";
import { useSavedLibrary } from "./hooks/useSavedLibrary";
import { loadBackendConfig, promptMatches } from "./utils/promptUtils";
import "./styles.css";
import "./styles/response.css";

function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [executeTarget] = useState("auto");
  const [confirmAction, setConfirmAction] = useState(null);
  const [ragConfig] = useState(loadBackendConfig);
  const composerRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const {
    authMode,
    authSession,
    currentUser,
    handleAuthExpired,
    handleCheckDuplicate,
    handleFindId,
    handleLogin,
    handleLogout,
    handlePasswordReset,
    handleSignup,
    handleWithdraw,
    sessionUuid,
    setAuthMode,
    setSessionUuid,
  } = useAuth({ ragConfig, showNotice });

  const {
    filteredSavedItems,
    isSaved,
    requestDeleteSavedItem,
    saveLibraryPrompt,
    searchItems,
    setSavedItems,
  } = useSavedLibrary({
    authSession,
    query,
    ragConfig,
    showNotice,
    setConfirmAction,
    onAuthExpired: handleAuthExpired,
  });

  const {
    messages,
    composerValue,
    setComposerValue,
    isLoading,
    copiedId,
    ragStatus,
    canEditUserMessages,
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
    retryFailedMessage,
  } = useConversation({
    authSession,
    executeTarget,
    ragConfig,
    sessionUuid,
    setAuthMode,
    setSavedItems,
    setSessionUuid,
    showNotice,
    onAuthExpired: handleAuthExpired,
  });

  const filteredRecentThreads = useMemo(() => {
    if (activeTab !== "recents") return recentThreads;
    return recentThreads.filter((thread) => promptMatches({ ...thread, content: thread.title }, query));
  }, [query, recentThreads, activeTab]);

  const { answeringQuestions } = useAskAnswers({ messages, isLoading, composerRef });

  function showNotice(message) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 1800);
  }

  function handleStartNewChat() {
    startNewChat();
    setQuery("");
  }

  function handleSelectExample(example) {
    setComposerValue(example);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      const length = example.length;
      composerRef.current?.setSelectionRange(length, length);
    });
  }

  function handleRefineUnchanged(message) {
    const prompt = String(message?.sourcePrompt || "").trim();
    if (!prompt) return;
    setComposerValue(prompt);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  }

  function handleResolveError(message) {
    if (message?.failure?.requiresLogin) {
      setAuthMode("login");
      return;
    }
    void retryFailedMessage(message);
  }

  return (
    <main className="extension-frame" aria-label="TTALKAK Chrome extension">
      <section className="extension-shell">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          query={query}
          setQuery={setQuery}
          searchItems={searchItems}
          savedItems={filteredSavedItems}
          recentItems={filteredRecentThreads}
          activeRecentId={activeRecentId}
          isSaved={isSaved}
          onOpenPrompt={openPrompt}
          onSavePrompt={saveLibraryPrompt}
          onOpenRecentThread={openRecentThread}
          onDeleteSaved={requestDeleteSavedItem}
          onDeleteRecent={(id) => requestDeleteRecentThread(id, setConfirmAction)}
        />
        <section className="work-area" aria-label="프롬프트 첨삭 영역">
          <Header
            currentUser={currentUser}
            onLogin={() => setAuthMode("login")}
            onLogout={() => handleLogout()}
            onWithdraw={() => setAuthMode("withdraw")}
            ragStatus={ragStatus}
          />
          <ChatFeed
            messages={messages}
            isLoading={isLoading}
            copiedId={copiedId}
            canEditUserMessages={canEditUserMessages}
            editingMessageId={editingMessageId}
            editingDraft={editingDraft}
            onCopy={copyMessage}
            onSave={toggleSave}
            onExecute={executeMessage}
            onStartEdit={startEditMessage}
            onChangeEditDraft={setEditingDraft}
            onCancelEdit={cancelEditMessage}
            onSubmitEdit={submitEditedMessage}
            onCancelRequest={() => {
              if (!cancelImproveRequest()) return;
              requestAnimationFrame(() => composerRef.current?.focus());
            }}
            onRefineUnchanged={handleRefineUnchanged}
            onResolveError={handleResolveError}
            onSelectExample={handleSelectExample}
          />
          <Composer
            ref={composerRef}
            value={composerValue}
            onChange={setComposerValue}
            onSubmit={submitPrompt}
            disabled={isLoading}
            onNewChat={handleStartNewChat}
            hasMessages={messages.length > 0}
            answeringQuestions={answeringQuestions}
          />
        </section>
      </section>
      {notice && <div className="notice" role="status">{notice}</div>}
      {authMode && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          onLogin={handleLogin}
          onSignup={handleSignup}
          onFindId={handleFindId}
          onPasswordReset={handlePasswordReset}
          onWithdraw={handleWithdraw}
          onCheckDuplicate={handleCheckDuplicate}
          isLoggedIn={Boolean(authSession?.accessToken)}
        />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

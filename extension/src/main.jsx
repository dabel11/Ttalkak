import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthModal } from "./components/AuthModal";
import { ChatFeed } from "./components/ChatFeed";
import { Composer } from "./components/Composer";
import { ConfirmModal } from "./components/ConfirmModal";
import { Header } from "./components/Header";
import { RagSettingsPanel } from "./components/RagSettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { MODE_META, STORAGE } from "./constants";
import { useAuth } from "./hooks/useAuth";
import { useConversation } from "./hooks/useConversation";
import { useSavedLibrary } from "./hooks/useSavedLibrary";
import { saveStorage } from "./storage/extensionStorage";
import { loadBackendConfig, promptMatches } from "./utils/promptUtils";
import "./styles.css";

function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [executeTarget] = useState("auto");
  const [showRagSettings, setShowRagSettings] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [ragConfig, setRagConfig] = useState(loadBackendConfig);
  const ragMode = MODE_META[ragConfig.collectionName] ? ragConfig.collectionName : "prompt_techniques";

  const {
    authMode,
    authSession,
    currentUser,
    handleAuthExpired,
    handleLogin,
    handleLogout,
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
    recentThreads,
    openPrompt,
    openRecentThread,
    startNewChat,
    copyMessage,
    toggleSave,
    executeMessage,
    submitPrompt,
    requestDeleteRecentThread,
  } = useConversation({
    authSession,
    executeTarget,
    ragConfig,
    ragMode,
    sessionUuid,
    setAuthMode,
    setSavedItems,
    setSessionUuid,
    showNotice,
    onAuthExpired: handleAuthExpired,
  });

  useEffect(() => saveStorage(STORAGE.CONFIG, ragConfig), [ragConfig]);

  const filteredRecentThreads = useMemo(() => {
    if (activeTab !== "recents") return recentThreads;
    return recentThreads.filter((thread) => promptMatches({ ...thread, content: thread.title }, query));
  }, [query, recentThreads, activeTab]);

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(""), 1800);
  }

  function handleStartNewChat() {
    startNewChat();
    setQuery("");
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
            onToggleRagSettings={() => setShowRagSettings((v) => !v)}
            ragMode={ragMode}
            ragStatus={ragStatus}
            onToggleRagMode={() =>
              setRagConfig((config) => ({
                ...config,
                collectionName: config.collectionName === "papers" ? "prompt_techniques" : "papers",
              }))
            }
          />
          {showRagSettings && (
            <RagSettingsPanel
              config={ragConfig}
              status={ragStatus}
              onChange={setRagConfig}
              onClose={() => setShowRagSettings(false)}
            />
          )}
          <ChatFeed
            messages={messages}
            isLoading={isLoading}
            copiedId={copiedId}
            onCopy={copyMessage}
            onSave={toggleSave}
            onExecute={executeMessage}
            ragMode={ragMode}
          />
          <Composer
            value={composerValue}
            onChange={setComposerValue}
            onSubmit={submitPrompt}
            disabled={isLoading}
            onNewChat={handleStartNewChat}
            hasMessages={messages.length > 0}
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
          backendApiUrl={ragConfig.backendApiUrl}
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

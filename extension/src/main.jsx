import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  X,
} from "lucide-react";
import "./styles.css";

const STORAGE = {
  SAVED: "pp_saved_prompts",
  RECENTS: "pp_recent_threads",
  CONFIG: "pp_rag_config",
};

const DEFAULT_RAG_CONFIG = {
  serverUrl: "http://localhost:8000",
  collectionName: "prompt_techniques",
  topK: 5,
  model: "gemini-2.0-flash",
};

const MODE_META = {
  prompt_techniques: {
    label: "기법 모드",
    desc: "프롬프트 엔지니어링 기법 기반",
    examples: [
      "역할 프롬프트 예시를 보여줘",
      "Chain-of-Thought 기법을 설명해줘",
      "Few-shot 프롬프팅 예시를 보여줘",
      "제약 조건을 포함한 프롬프트로 바꿔줘",
    ],
  },
  papers: {
    label: "논문 모드",
    desc: "프롬프트 엔지니어링 논문 기반",
    examples: [
      "프롬프트 엔지니어링 연구 흐름을 요약해줘",
      "LLM에서 Few-shot 학습 원리를 설명해줘",
      "Promptware Engineering이 뭐야?",
      "논문 기반으로 메타프롬프트 작성법을 알려줘",
    ],
  },
};

const PROMPT_LIBRARY = [
  {
    id: "library-marketing-campaign",
    title: "Marketing Campaign Strategy",
    preview: "Plan campaign channels and execution steps from product and audience details.",
    content: "You are a professional marketing strategist. Based on the product value, target audience, budget, and timeline, propose channel-specific campaign strategies and an execution schedule.",
    tags: ["marketing", "campaign", "strategy"],
  },
  {
    id: "library-blog-seo",
    title: "SEO Blog Writing",
    preview: "Suggest keyword intent, title options, structure, and CTA direction.",
    content: "You are an SEO content editor. Based on the primary keyword, suggest search intent, title options, heading structure, body direction, and CTA.",
    tags: ["SEO", "blog", "writing"],
  },
  {
    id: "library-email",
    title: "Business Email Draft",
    preview: "Write a concise and polite email for the recipient and purpose.",
    content: "You are a business communication expert. Based on the email purpose, recipient, and desired outcome, draft a concise and polite business email.",
    tags: ["email", "business", "communication"],
  },
  {
    id: "library-code-question",
    title: "Coding Question Builder",
    preview: "Structure a coding question with context, error, and attempted solutions.",
    content: "You are a development mentor. Organize the problem, expected result, actual result, error message, and attempted solutions into a clear question that is easy to answer.",
    tags: ["coding", "question", "debugging"],
  },
  {
    id: "library-summary",
    title: "Long Text Summary",
    preview: "Summarize long text by claims, evidence, key points, and next actions.",
    content: "You are a professional summarizer. Summarize the text into core claims, key evidence, easily missed points, and next actions.",
    tags: ["summary", "analysis", "organizing"],
  },
];

const tips = [
  { icon: "1", title: "Set A Clear Goal", description: "Describe the desired output and usage context clearly." },
  { icon: "2", title: "Add Context", description: "Include audience, tone, constraints, and output criteria." },
  { icon: "3", title: "Specify Format", description: "Ask for bullets, tables, steps, or another concrete format." },
];

function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function makeTitle(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "???꾨＼?꾪듃";
  return t.length > 20 ? `${t.slice(0, 20)}...` : t;
}

function makePreview(text = "") {
  const p = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return p.length > 44 ? `${p.slice(0, 44)}...` : p;
}

function promptMatches(item, query) {
  const q = query.trim().replace(/^#/, "").toLowerCase();
  if (!q) return true;
  return `${item.title} ${item.preview} ${item.content || ""} ${(item.tags || []).join(" ")}`
    .toLowerCase()
    .includes(q);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [composerValue, setComposerValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [executeTarget] = useState("auto");
  const [showRagSettings, setShowRagSettings] = useState(false);
  const [ragStatus, setRagStatus] = useState("idle");
  const [confirmAction, setConfirmAction] = useState(null);
  const activeThreadId = useRef(null);

  const [ragConfig, setRagConfig] = useState(() => loadStorage(STORAGE.CONFIG, DEFAULT_RAG_CONFIG));
  const [savedItems, setSavedItems] = useState(() => loadStorage(STORAGE.SAVED, []));
  const [recentThreads, setRecentThreads] = useState(() => loadStorage(STORAGE.RECENTS, []));

  useEffect(() => saveStorage(STORAGE.CONFIG, ragConfig), [ragConfig]);
  useEffect(() => saveStorage(STORAGE.SAVED, savedItems), [savedItems]);
  useEffect(() => saveStorage(STORAGE.RECENTS, recentThreads), [recentThreads]);

  const ragMode = MODE_META[ragConfig.collectionName] ? ragConfig.collectionName : "prompt_techniques";

  const searchItems = useMemo(() => {
    const generated = savedItems
      .filter((item) => item.content)
      .map((item) => ({ ...item, source: "saved" }));
    const merged = [...PROMPT_LIBRARY.map((item) => ({ ...item, source: "library" })), ...generated];
    const seen = new Set();
    return merged
      .filter((item) => {
        const key = `${item.title}:${item.content || item.preview}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((item) => promptMatches(item, query));
  }, [query, savedItems]);

  const filteredSavedItems = useMemo(
    () => savedItems.filter((item) => promptMatches(item, query)),
    [query, savedItems]
  );

  const filteredRecentThreads = useMemo(() => {
    if (activeTab !== "recents") return recentThreads;
    return recentThreads.filter((thread) => promptMatches({ ...thread, content: thread.title }, query));
  }, [query, recentThreads, activeTab]);

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(""), 1800);
  }

  function openPrompt(item) {
    if (item.messages?.length) {
      activeThreadId.current = null;
      setMessages(item.messages);
      return;
    }
    activeThreadId.current = null;
    setComposerValue(item.sourcePrompt || item.content || item.prompt || item.title);
    setMessages([]);
    showNotice("?꾨＼?꾪듃媛 ?낅젰李쎌뿉 以鍮꾨릺?덉뒿?덈떎.");
  }

  function openRecentThread(thread) {
    activeThreadId.current = thread.id;
    setMessages(thread.messages || []);
  }

  function startNewChat() {
    activeThreadId.current = null;
    setMessages([]);
    setComposerValue("");
    setQuery("");
  }

  function saveLibraryPrompt(item) {
    const id = item.id.startsWith("library-") ? item.id : `saved-${item.id}`;
    setSavedItems((items) => {
      const alreadySaved = items.some((saved) => saved.id === id || saved.id === item.id || saved.content === item.content);
      if (alreadySaved) {
        showNotice("??μ쓣 ?댁젣?덉뒿?덈떎.");
        return items.filter((saved) => saved.id !== id && saved.id !== item.id && saved.content !== item.content);
      }
      showNotice("Saved????ν뻽?듬땲??");
      return [
        {
          id,
          title: item.title,
          preview: item.preview || makePreview(item.content),
          content: item.content,
          executablePrompt: item.content,
          sourcePrompt: item.content,
          tags: item.tags || [],
        },
        ...items,
      ];
    });
    return;
    showNotice("Saved????ν뻽?듬땲??");
  }

  function isSaved(item) {
    return savedItems.some((saved) => saved.id === item.id || saved.id === `saved-${item.id}` || saved.content === item.content);
  }

  async function copyMessage(message) {
    await copyText(message.executablePrompt || message.content);
    setCopiedId(message.id);
    showNotice("?꾨＼?꾪듃瑜?蹂듭궗?덉뒿?덈떎.");
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
                tags: ["泥⑥궘"],
              },
              ...items,
            ]
      );
      showNotice("Saved????ν뻽?듬땲??");
    } else {
      setSavedItems((items) => items.filter((i) => i.id !== messageId));
      showNotice("??μ쓣 ?댁젣?덉뒿?덈떎.");
    }
  }

  async function executeMessage(message) {
    const prompt = message.executablePrompt || message.content;
    const targetLabel = executeTarget === "claude" ? "Claude" : executeTarget === "gemini" ? "Gemini" : "selected AI site";

    if (executeTarget === "claude") {
      await copyText(prompt);
      showNotice("Prompt copied.");
      window.alert("The final prompt was copied to the clipboard. Open Claude and paste it into the input field.");
      return;
    }

    if (window.chrome?.runtime?.sendMessage) {
      window.chrome.runtime.sendMessage(
        { type: "EXECUTE_PROMPT", prompt, target: executeTarget },
        async (response) => {
          if (response?.ok) {
            showNotice(`Prompt inserted into ${targetLabel}.`);
            return;
          }
          await copyText(prompt);
          showNotice("Prompt copied.");
          window.alert(`Automatic insertion into ${targetLabel} failed. The final prompt was copied, so paste it into the AI site's input field.`);
        }
      );
      return;
    }

    await copyText(prompt);
    showNotice("Prompt copied.");
    window.alert("Automatic insertion is unavailable in preview mode. The final prompt was copied, so paste it into the AI site you want to use.");
  }

  async function submitPrompt() {
    const prompt = composerValue.trim();
    if (!prompt || isLoading) return;

    const userMsg = { id: `user-${Date.now()}`, role: "user", content: prompt };
    const history = messages
      .filter((m) => !m.isError && !m.excludeFromHistory)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setComposerValue("");
    setIsLoading(true);
    setRagStatus("checking");

    try {
      const res = await fetch(`${ragConfig.serverUrl}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: prompt,
          collection_name: ragConfig.collectionName,
          top_k: ragConfig.topK,
          model: ragConfig.model,
          history,
        }),
      });

      setRagStatus("connected");

      if (res.status === 404) {
        const meta = MODE_META[ragMode];
        const examples = meta.examples.map((example) => `- ${example}`).join("\n");
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `"${prompt}"? 愿?⑤맂 ?댁슜??李얠? 紐삵뻽?듬땲??\n\n?꾩옱 紐⑤뱶: ${meta.label}\n\n?대윴 吏덈Ц???낅젰?대낫?몄슂:\n${examples}`,
            executablePrompt: null,
            sourcePrompt: prompt,
            sources: [],
            saved: false,
            excludeFromHistory: true,
          },
        ]);
        return;
      }

      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Gemini API ?ъ슜?됱씠 珥덇낵?섏뿀?듬땲??");
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`?쒕쾭 ?ㅻ쪟 (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        executablePrompt: data.improved_prompt || null,
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
          time: "諛⑷툑",
          messages: nextMessages,
        };
        return [updatedThread, ...prev.filter((t) => t.id !== threadId)].slice(0, 30);
      });
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      setRagStatus("error");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: isNetwork
            ? `RAG ?쒕쾭???곌껐?????놁뒿?덈떎.\n\n?꾩옱 ?ㅼ젙???쒕쾭: ${ragConfig.serverUrl}\n\n?곕え ?붾㈃? 怨꾩냽 ?ъ슜?????덉?留??ㅼ젣 泥⑥궘??諛쏆쑝?ㅻ㈃ RAG ?쒕쾭瑜??ㅽ뻾?섍굅???곷떒??RAG ?ㅼ젙?먯꽌 ?쒕쾭 二쇱냼瑜??뺤씤?댁＜?몄슂.`
            : `?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.\n\n${err.message}`,
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

  function requestDeleteRecentThread(id) {
    setConfirmAction({
      title: "理쒓렐 ?????젣",
      message: "??理쒓렐 ??붾? ??젣?좉퉴??",
      confirmLabel: "??젣",
      onConfirm: () => setRecentThreads((prev) => prev.filter((t) => t.id !== id)),
    });
  }

  function requestDeleteSavedItem(id) {
    setConfirmAction({
      title: "??λ맂 ?꾨＼?꾪듃 ??젣",
      message: "????λ맂 ?꾨＼?꾪듃瑜???젣?좉퉴??",
      confirmLabel: "??젣",
      onConfirm: () => setSavedItems((prev) => prev.filter((i) => i.id !== id)),
    });
  }

  return (
    <main className="extension-frame" aria-label="AI ?꾨＼?꾪듃 泥⑥궘 ?щ＼ ?뺤옣 ?꾨줈洹몃옩">
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
          onDeleteRecent={requestDeleteRecentThread}
        />
        <section className="work-area" aria-label="?꾨＼?꾪듃 泥⑥궘 ?곸뿭">
          <Header
            currentUser={currentUser}
            onLogin={() => setAuthMode("login")}
            onLogout={() => setCurrentUser(null)}
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
            onNewChat={startNewChat}
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
          onLogin={(userName) => {
            setCurrentUser(userName);
            setAuthMode(null);
          }}
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

function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  query,
  setQuery,
  searchItems,
  savedItems,
  recentItems,
  isSaved,
  onOpenPrompt,
  onSavePrompt,
  onOpenRecentThread,
  onDeleteSaved,
  onDeleteRecent,
}) {
  function selectTab(tabId) {
    setActiveTab(tabId);
    setQuery("");
    if (collapsed) setCollapsed(false);
  }

  const placeholder =
    activeTab === "search"
      ? "Search all prompts..."
      : activeTab === "saved"
        ? "Search saved prompts..."
        : "Search recent chats...";

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Search, saved prompts, and recent chats">
      <div className="sidebar-top">
        <button className="collapse-button" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((v) => !v)}>
          <ChevronLeft size={16} />
        </button>
      </div>
      <nav className="tab-list" aria-label="Sidebar tabs">
        <TabButton id="search" activeTab={activeTab} onClick={selectTab} icon={<Search size={15} />} label="Search" />
        <TabButton id="saved" activeTab={activeTab} onClick={selectTab} icon={<Save size={15} />} label="Saved" />
        <TabButton id="recents" activeTab={activeTab} onClick={selectTab} icon={<Clock3 size={15} />} label="Recents" />
      </nav>
      <div className="sidebar-content">
        <label className="search-input">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
        {activeTab === "search" && (
          <PromptList
            items={searchItems}
            emptyText="寃?됲븷 ???덈뒗 ?꾨＼?꾪듃媛 ?놁뒿?덈떎."
            mode="search"
            isSaved={isSaved}
            onOpenPrompt={onOpenPrompt}
            onSavePrompt={onSavePrompt}
          />
        )}
        {activeTab === "saved" && (
          <PromptList
            items={savedItems}
            emptyText="??λ맂 ?꾨＼?꾪듃媛 ?놁뒿?덈떎."
            mode="saved"
            onOpenPrompt={onOpenPrompt}
            onDelete={onDeleteSaved}
          />
        )}
        {activeTab === "recents" && <RecentList items={recentItems} onOpenThread={onOpenRecentThread} onDelete={onDeleteRecent} />}
      </div>
    </aside>
  );
}

function TabButton({ id, activeTab, onClick, icon, label }) {
  return (
    <button className={`tab-button ${activeTab === id ? "active" : ""}`} type="button" onClick={() => onClick(id)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PromptList({ items, emptyText, mode, isSaved, onOpenPrompt, onSavePrompt, onDelete }) {
  if (items.length === 0) return <p className="empty-list">{emptyText}</p>;

  return (
    <div className="prompt-list" aria-label={mode === "search" ? "?꾩껜 ?꾨＼?꾪듃 寃??寃곌낵" : "??λ맂 ?꾨＼?꾪듃 紐⑸줉"}>
      {items.map((item) => {
        const saved = isSaved?.(item);
        return (
          <div className="saved-item-wrap" key={item.id}>
            <div
              className="saved-item"
              role="button"
              tabIndex={0}
              onClick={() => onOpenPrompt(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenPrompt(item);
                }
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.preview}</span>
              {item.tags?.length > 0 && <small>{item.tags.map((tag) => `#${tag}`).join(" ")}</small>}
              {mode === "search" && (
                <button
                  className={`save-card-action ${saved ? "saved" : ""}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSavePrompt(item);
                  }}
                  aria-label={saved ? "Unsave" : "Save"}
                  title={saved ? "Unsave" : "Save"}
                >
                  {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  {saved ? "Saved" : "Save"}
                </button>
              )}
            </div>
            {mode === "saved" && (
              <button
                className="delete-item-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                aria-label="??젣"
                title="??젣"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentList({ items, onOpenThread, onDelete }) {
  if (items.length === 0) return <p className="empty-list">理쒓렐 ??붽? ?놁뒿?덈떎.</p>;

  return (
    <div className="recent-list" aria-label="理쒓렐 ???紐⑸줉">
      {items.map((item) => (
        <div className="saved-item-wrap" key={item.id}>
          <button className="recent-item" type="button" onClick={() => onOpenThread(item)}>
            <strong>{item.title}</strong>
            <span>{item.time}</span>
          </button>
          <button
            className="delete-item-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            aria-label="??젣"
            title="??젣"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Header({ currentUser, onLogin, onLogout, onToggleRagSettings, ragMode, ragStatus, onToggleRagMode }) {
  const meta = MODE_META[ragMode] || MODE_META.prompt_techniques;
  return (
    <header className="header">
      <div className="brand-mark" aria-label="TTALKAK">
        <span className="brand-dot">T</span>
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <button className={`rag-mode-toggle ${ragMode}`} type="button" onClick={onToggleRagMode} title={`Current: ${meta.label}`}>
          {meta.label === "기법 모드" ? "기법" : "논문"}
        </button>
        <button className="rag-settings-button" type="button" onClick={onToggleRagSettings} title="RAG settings">
          <Settings size={15} />
          <span>RAG</span>
        </button>
        <span className={`rag-status ${ragStatus}`}>{getRagStatusText(ragStatus)}</span>
        {currentUser ? (
          <button className="login-button" type="button" onClick={onLogout}>{currentUser}님</button>
        ) : (
          <button className="login-button" type="button" onClick={onLogin}>로그인</button>
        )}
      </div>
    </header>
  );
}

function getRagStatusText(status) {
  if (status === "connected") return "Connected";
  if (status === "checking") return "Checking";
  if (status === "error") return "Error";
  return "Not connected";
}

function ChatFeed({ messages, isLoading, copiedId, onCopy, onSave, onExecute, ragMode }) {
  const isEmpty = messages.length === 0 && !isLoading;
  const scrollRef = useRef(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || isEmpty) return;
    requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }));
  }, [messages, isLoading, isEmpty]);

  return (
    <section ref={scrollRef} className={`chat-feed ${isEmpty ? "empty" : ""}`} aria-label="梨꾪똿 硫붿떆吏">
      {isEmpty ? (
        <Intro ragMode={ragMode} />
      ) : (
        <div className="message-stack">
          {messages.map((message) => (
            <MessageCard message={message} copied={copiedId === message.id} onCopy={onCopy} onSave={onSave} onExecute={onExecute} key={message.id} />
          ))}
          {isLoading && <TypingIndicator />}
        </div>
      )}
    </section>
  );
}

function Intro({ ragMode }) {
  const meta = MODE_META[ragMode] || MODE_META.prompt_techniques;
  return (
    <div className="intro">
      <div className="intro-icon"><Plus size={34} /></div>
      <h1>AI Prompt Assistant</h1>
      <div className="mode-badge">
        <span>{meta.label}</span>
        <span className="mode-desc">{meta.desc}</span>
      </div>
      <p>Write a prompt for an AI tool, and TTALKAK will improve it into a clearer, executable prompt.</p>
      <div className="tip-list">
        {tips.map((tip) => (
          <article className="tip-card" key={tip.title}>
            <span>{tip.icon}</span>
            <div>
              <h2>{tip.title}</h2>
              <p>{tip.description}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="example-queries">
        <p className="example-label">Try one of these</p>
        {meta.examples.map((example) => <span className="example-chip" key={example}>{example}</span>)}
      </div>
    </div>
  );
}

function MessageCard({ message, copied, onCopy, onSave, onExecute }) {
  const isAssistant = message.role === "assistant";
  const [showSources, setShowSources] = useState(false);
  const hasSources = isAssistant && message.sources?.length > 0;

  return (
    <article className={`message-row ${message.role}${message.isError ? " error" : ""}`} data-mid={message.id}>
      <div className="message-card">
        <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
        {hasSources && (
          <div className="sources-section">
            <button className="sources-toggle" type="button" onClick={() => setShowSources((v) => !v)}>
              李멸퀬 臾몄꽌 {message.sources.length}嫄?{showSources ? "?묎린" : "蹂닿린"}
            </button>
            {showSources && (
              <ul className="sources-list">
                {message.sources.map((source, idx) => (
                  <li key={idx} className="source-item">
                    <span className="source-meta">
                      [{idx + 1}] {source.metadata?.source || source.metadata?.technique || "?????놁쓬"}
                      {source.metadata?.category ? ` (${source.metadata.category})` : ""}
                      {typeof source.score === "number" ? ` ?좎궗??${(source.score * 100).toFixed(1)}%` : ""}
                    </span>
                    <p className="source-text">{source.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {isAssistant && !message.isError && (
          <div className="card-actions">
            <ActionButton icon={copied ? <Check size={14} /> : <Copy size={14} />} label={copied ? "Copied" : "Copy"} onClick={() => onCopy(message)} />
            <ActionButton icon={message.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} label={message.saved ? "Saved" : "Save"} onClick={() => onSave(message.id)} />
            {message.executablePrompt && <ActionButton icon={<Play size={14} />} label="Execute" onClick={() => onExecute(message)} />}
          </div>
        )}
      </div>
    </article>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button className="action-button" type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="message-row assistant">
      <div className="typing-message" aria-label="Improving prompt"><span /><span /><span /></div>
    </div>
  );
}

function Composer({ value, onChange, onSubmit, disabled, onNewChat, hasMessages }) {
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {hasMessages && (
        <button className="newchat-button" type="button" onClick={onNewChat} disabled={disabled} aria-label="New chat" title="New chat">
          <Plus size={16} />
        </button>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={hasMessages ? "Enter a follow-up improvement request..." : "Enter a prompt to improve..."}
        aria-label="Prompt input"
      />
      <button className="send-button" type="submit" disabled={!value.trim() || disabled} aria-label="Send prompt">
        <Send size={18} />
      </button>
    </form>
  );
}

function RagSettingsPanel({ config, status, onChange, onClose }) {
  const [local, setLocal] = useState({ ...config });

  useEffect(() => setLocal({ ...config }), [config]);

  function update(field, value) {
    setLocal((state) => ({ ...state, [field]: value }));
  }

  function apply(e) {
    e.preventDefault();
    onChange({ ...local, topK: Number(local.topK) });
    onClose();
  }

  return (
    <div className="rag-settings-panel" role="dialog" aria-label="RAG ?쒕쾭 ?ㅼ젙">
      <div className="rag-settings-header">
        <span>RAG ?쒕쾭 ?ㅼ젙</span>
        <span className={`rag-status ${status}`}>{getRagStatusText(status)}</span>
        <button type="button" onClick={onClose} aria-label="?リ린"><X size={15} /></button>
      </div>
      <form className="rag-settings-form" onSubmit={apply}>
        <label>
          ?쒕쾭 URL
          <input value={local.serverUrl} onChange={(e) => update("serverUrl", e.target.value)} placeholder="http://localhost:8000" />
        </label>
        <label>
          而щ젆??          <select value={local.collectionName} onChange={(e) => update("collectionName", e.target.value)}>
            <option value="prompt_techniques">湲곕쾿 紐⑤뱶</option>
            <option value="papers">?쇰Ц 紐⑤뱶</option>
          </select>
        </label>
        <div className="rag-settings-row">
          <label>
            Top-K
            <input type="number" min={1} max={20} value={local.topK} onChange={(e) => update("topK", e.target.value)} />
          </label>
          <label>
            紐⑤뜽
            <select value={local.model} onChange={(e) => update("model", e.target.value)}>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </label>
        </div>
        <button className="rag-settings-apply" type="submit">?곸슜</button>
      </form>
    </div>
  );
}

function AuthModal({ mode, setMode, onClose, onLogin }) {
  const isSignup = mode === "signup";
  const isFindId = mode === "findId";
  const isFindPassword = mode === "findPassword";
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ userId: "", password: "", name: "", phone: "" });
  const [result, setResult] = useState("");

  const title = isSignup ? "Sign up" : isFindId ? "Find ID" : isFindPassword ? "Find password" : "Login";
  const description = isSignup
    ? "Create an account with your name and phone number."
    : isFindId
      ? "Enter your name and phone number to find your ID."
      : isFindPassword
        ? "Enter your ID and phone number to request a password reset."
        : "Continue using your saved prompts and previous chats.";

  function updateField(field, value) {
    setResult("");
    setForm((state) => ({ ...state, [field]: value }));
  }

  function moveMode(nextMode) {
    setResult("");
    setMode(nextMode);
  }

  function submitAuth(e) {
    e.preventDefault();
    if (isFindId) {
      setResult("After backend account API integration, the matching ID will be shown here.");
      return;
    }
    if (isFindPassword) {
      setResult("After backend account API integration, this will start the password reset flow.");
      return;
    }
    onLogin(isSignup ? form.name || "User" : form.userId || "User");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="auth-heading">
          <div className="auth-icon"><Plus size={22} /></div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {(isSignup || isFindId) && (
            <label>
              Name
              <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Name" required />
            </label>
          )}
          {(isSignup || isFindId || isFindPassword) && (
            <label>
              Phone
              <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="010-0000-0000" required />
            </label>
          )}
          {(!isFindId || isFindPassword) && (
            <label>
              ID
              <input value={form.userId} onChange={(e) => updateField("userId", e.target.value)} placeholder="Enter your ID" required />
            </label>
          )}
          {!isFindId && !isFindPassword && (
            <label>
              Password
              <div className="password-field">
                <input value={form.password} onChange={(e) => updateField("password", e.target.value)} placeholder="Enter your password" type={showPassword ? "text" : "password"} required />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          )}
          {result && <p className="auth-result">{result}</p>}
          <button className="auth-submit" type="submit">
            {isFindId ? "Find ID" : isFindPassword ? "Find password" : isSignup ? "Sign up" : "Login"}
          </button>
        </form>
        {isSignup || isFindId || isFindPassword ? (
          <p className="auth-switch"><button type="button" onClick={() => moveMode("login")}>Back to login</button></p>
        ) : (
          <div className="auth-link-row" aria-label="Account help">
            <button type="button" onClick={() => moveMode("findId")}>Find ID</button>
            <button type="button" onClick={() => moveMode("findPassword")}>Find password</button>
            <button type="button" onClick={() => moveMode("signup")}>Sign up</button>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" type="button" onClick={onCancel}>痍⑥냼</button>
          <button className="confirm-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);


import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
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
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import "./styles.css";

// ── localStorage 유틸 ─────────────────────────────────────────
const STORAGE = {
  SAVED:   "pp_saved_prompts",
  RECENTS: "pp_recent_threads",
  CONFIG:  "pp_rag_config",
};

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

// ── 기본 RAG 설정 ─────────────────────────────────────────────
const DEFAULT_RAG_CONFIG = {
  serverUrl:      "http://localhost:8000",
  collectionName: "prompt_techniques",
  topK:           5,
  model:          "gemini-2.0-flash",
};

// ── 모드 메타 ─────────────────────────────────────────────────
const MODE_META = {
  prompt_techniques: {
    icon: "📖",
    label: "기법 모드",
    desc: "100가지 프롬프트 엔지니어링 기법 기반",
    examples: [
      "역할 프롬프트(Role Prompting)란?",
      "Chain-of-Thought 기법 설명해줘",
      "Few-shot 프롬프팅 예시 보여줘",
      "Constraint Prompting 어떻게 사용해?",
    ],
  },
  papers: {
    icon: "📄",
    label: "논문 모드",
    desc: "프롬프트 엔지니어링 논문 기반",
    examples: [
      "프롬프트 엔지니어링의 최신 연구 동향은?",
      "LLM에서 Few-shot 학습 원리 설명해줘",
      "Promptware Engineering이란?",
      "TDD 기반 멀티에이전트 코드 생성 방법은?",
    ],
  },
};

const tips = [
  { icon: "💡", title: "명확한 목표 설정",  description: "원하는 결과를 구체적으로 설명해주세요" },
  { icon: "🎯", title: "컨텍스트 제공",     description: "배경 정보와 제약사항을 포함하세요" },
  { icon: "📝", title: "구조화된 형식",     description: "출력 형식을 명시하면 더 좋은 결과를 얻을 수 있습니다" },
];

// ── 유틸 ─────────────────────────────────────────────────────
function makeTitle(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "저장한 프롬프트";
  return t.length > 20 ? `${t.slice(0, 20)}…` : t;
}

function makePreview(text = "") {
  const p = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return p.length > 40 ? `${p.slice(0, 40)}…` : p;
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

// ── App ───────────────────────────────────────────────────────
function App() {
  const [activeTab,     setActiveTab]     = useState("search");
  const [collapsed,     setCollapsed]     = useState(() => window.innerWidth <= 760);
  const [query,         setQuery]         = useState("");
  const [messages,      setMessages]      = useState([]);
  const activeThreadId = useRef(null);   // 진행 중인 대화 스레드 id
  const [composerValue, setComposerValue] = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [copiedId,      setCopiedId]      = useState("");
  const [notice,        setNotice]        = useState("");
  const [authMode,      setAuthMode]      = useState(null);
  const [currentUser,   setCurrentUser]   = useState(null);
  const [executeTarget, setExecuteTarget] = useState("auto");
  const [showRagSettings, setShowRagSettings] = useState(false);

  // localStorage 에서 초기값 로드
  const [ragConfig, setRagConfig] = useState(() =>
    loadStorage(STORAGE.CONFIG, DEFAULT_RAG_CONFIG)
  );
  const [savedItems, setSavedItems] = useState(() =>
    loadStorage(STORAGE.SAVED, [])
  );
  const [recentThreads, setRecentThreads] = useState(() =>
    loadStorage(STORAGE.RECENTS, [])
  );

  // ragConfig / savedItems / recentThreads 변경 시 자동 저장
  useEffect(() => { saveStorage(STORAGE.CONFIG,  ragConfig);      }, [ragConfig]);
  useEffect(() => { saveStorage(STORAGE.SAVED,   savedItems);     }, [savedItems]);
  useEffect(() => { saveStorage(STORAGE.RECENTS, recentThreads);  }, [recentThreads]);

  const ragMode = Object.keys(MODE_META).includes(ragConfig.collectionName)
    ? ragConfig.collectionName
    : "prompt_techniques";

  // ── 검색 필터 ──────────────────────────────────────────────
  const filteredSavedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return savedItems;
    return savedItems.filter((item) =>
      `${item.title} ${item.preview}`.toLowerCase().includes(q)
    );
  }, [query, savedItems]);

  const filteredRecentThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || activeTab !== "recents") return recentThreads;
    return recentThreads.filter((t) =>
      t.title.toLowerCase().includes(q)
    );
  }, [query, recentThreads, activeTab]);

  // ── 저장된 프롬프트 열기 ───────────────────────────────────
  function openPrompt(item) {
    // 저장된 대화 내용이 있으면 그대로 복원 (새 스레드로 이어감)
    if (item.messages && item.messages.length > 0) {
      activeThreadId.current = null;
      setMessages(item.messages);
      return;
    }
    // 단순 텍스트만 있으면 RAG로 재질의
    const prompt = item.sourcePrompt || item.prompt || item.title;
    activeThreadId.current = null;
    setComposerValue(prompt);
    setMessages([]);
  }

  // ── 최근 대화 열기 (이어서 대화) ───────────────────────────
  function openRecentThread(thread) {
    activeThreadId.current = thread.id;
    setMessages(thread.messages || []);
  }

  // ── 새 대화 시작 ───────────────────────────────────────────
  function startNewChat() {
    activeThreadId.current = null;
    setMessages([]);
    setComposerValue("");
    setQuery("");
  }

  // ── 복사 ──────────────────────────────────────────────────
  async function copyMessage(message) {
    await copyText(message.content);
    setCopiedId(message.id);
    showNotice("프롬프트를 복사했습니다.");
    window.setTimeout(() => setCopiedId(""), 1100);
  }

  // ── 저장 / 해제 ───────────────────────────────────────────
  function toggleSave(messageId) {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    const nextSaved = !message.saved;

    setMessages((items) =>
      items.map((m) => (m.id === messageId ? { ...m, saved: nextSaved } : m))
    );
    showNotice(nextSaved ? "저장했습니다." : "저장을 해제했습니다.");

    if (nextSaved) {
      setSavedItems((items) =>
        items.some((i) => i.id === messageId)
          ? items
          : [
              {
                id:             message.id,
                title:          makeTitle(message.sourcePrompt || message.content),
                preview:        makePreview(message.content),
                content:        message.content,
                executablePrompt: message.executablePrompt,
                sourcePrompt:   message.sourcePrompt || message.content,
                messages:       messages, // 전체 대화 저장
              },
              ...items,
            ]
      );
    } else {
      setSavedItems((items) => items.filter((i) => i.id !== messageId));
    }
  }

  // ── Execute ───────────────────────────────────────────────
  async function executeMessage(message) {
    const prompt = message.executablePrompt || message.content;

    if (executeTarget === "claude") {
      await copyText(prompt);
      showNotice("Claude용 프롬프트를 복사했습니다.");
      window.alert("Claude에서는 프롬프트를 클립보드에 복사했습니다.");
      return;
    }

    if (window.chrome?.runtime?.sendMessage) {
      window.chrome.runtime.sendMessage(
        { type: "EXECUTE_PROMPT", prompt, target: executeTarget },
        async (response) => {
          if (response?.ok) {
            showNotice("선택한 AI 입력창에 넣었습니다.");
            return;
          }
          await copyText(prompt);
          showNotice("자동 입력 대신 클립보드에 복사했습니다.");
          window.alert(
            response?.fallback === "clipboard"
              ? "Claude에서는 프롬프트를 클립보드에 복사했습니다."
              : "입력창에 자동 입력하지 못해 프롬프트를 클립보드에 복사했습니다."
          );
        }
      );
      return;
    }

    await copyText(prompt);
    showNotice("프롬프트를 복사했습니다.");
  }

  // ── RAG 질의 ─────────────────────────────────────────────
  async function submitPrompt() {
    const prompt = composerValue.trim();
    if (!prompt || isLoading) return;

    const userMsg = { id: `user-${Date.now()}`, role: "user", content: prompt };

    // 직전 대화를 LLM 으로 보낼 history 로 변환.
    // 에러/미매칭만 제외하고, 어시스턴트의 '질문'도 포함해야 의도를 이어서 파악함.
    const history = messages
      .filter((m) => !m.isError && !m.excludeFromHistory)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setComposerValue("");
    setIsLoading(true);

    try {
      const res = await fetch(`${ragConfig.serverUrl}/query`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:           prompt,
          collection_name: ragConfig.collectionName,
          top_k:           ragConfig.topK,
          model:           ragConfig.model,
          history,
        }),
      });

      // ── 상태 코드별 처리 ──────────────────────────────────
      if (res.status === 404) {
        const meta     = MODE_META[ragMode] || MODE_META.prompt_techniques;
        const examples = meta.examples.map((e) => `• "${e}"`).join("\n");
        const noMatch  = {
          id:    `assistant-${Date.now()}`,
          role:  "assistant",
          content:
            `🔍 "${prompt}" 와 관련된 내용을 찾지 못했습니다.\n\n` +
            `현재 모드: ${meta.icon} ${meta.label}\n\n` +
            `💡 이런 질문을 입력해보세요:\n${examples}`,
          executablePrompt: null,
          sourcePrompt:     prompt,
          sources:          [],
          saved:            false,
          isError:          false,
          excludeFromHistory: true,   // 안내 메시지 → 대화 맥락에서 제외
        };
        setMessages((prev) => [...prev, noMatch]);
        setIsLoading(false);
        return;
      }

      if (res.status === 503) {
        const body   = await res.json().catch(() => ({}));
        const detail = body.detail || "Gemini API 할당량 초과";
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`, role: "assistant",
            content: `⛔ ${detail}`,
            executablePrompt: null, sourcePrompt: prompt,
            sources: [], saved: false, isError: true,
          },
        ]);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`서버 오류 (${res.status}): ${errText}`);
      }

      const data      = await res.json();
      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg = {
        id:               assistantId,
        role:             "assistant",
        content:          data.answer,
        // 개선 모드일 때만 Execute 대상 존재. 질문 모드(improved_prompt 빈값)면 null → Execute 숨김
        executablePrompt: data.improved_prompt ? data.improved_prompt : null,
        sourcePrompt:     prompt,
        sources:          data.sources || [],
        saved:            false,
      };

      const nextMessages = [...messages, userMsg, assistantMsg];

      setMessages((prev) => [...prev, assistantMsg]);

      // ── 최근 대화 자동 저장 (대화 단위로 in-place 갱신) ─────
      if (!activeThreadId.current) {
        activeThreadId.current = `thread-${Date.now()}`;
      }
      const threadId      = activeThreadId.current;
      const firstUserMsg  = nextMessages.find((m) => m.role === "user");
      const updatedThread = {
        id:       threadId,
        title:    makeTitle(firstUserMsg ? firstUserMsg.content : prompt),
        time:     "방금",
        messages: nextMessages,
      };
      setRecentThreads((prev) => {
        const rest = prev.filter((t) => t.id !== threadId);
        return [updatedThread, ...rest].slice(0, 30); // 최대 30개
      });

    } catch (err) {
      const isNetwork = err instanceof TypeError;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`, role: "assistant",
          content: isNetwork
            ? `🔌 RAG 서버에 연결할 수 없습니다.\n\n` +
              `설정된 서버: ${ragConfig.serverUrl}\n\n` +
              `터미널에서 RAG 서버를 실행해주세요:\n` +
              `python3 main.py`
            : `⚠️ 오류가 발생했습니다.\n\n${err.message}`,
          executablePrompt: null, sourcePrompt: prompt,
          sources: [], saved: false, isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(""), 1600);
  }

  // ── 최근 대화 삭제 ────────────────────────────────────────
  function deleteRecentThread(id) {
    setRecentThreads((prev) => prev.filter((t) => t.id !== id));
  }

  // ── 저장 아이템 삭제 ──────────────────────────────────────
  function deleteSavedItem(id) {
    setSavedItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <main className="extension-frame" aria-label="AI 프롬프트 첨삭 크롬 확장 프로그램">
      <section className="extension-shell">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          query={query}
          setQuery={setQuery}
          savedItems={filteredSavedItems}
          recentItems={filteredRecentThreads}
          onOpenSavedPrompt={openPrompt}
          onOpenRecentThread={openRecentThread}
          onDeleteSaved={deleteSavedItem}
          onDeleteRecent={deleteRecentThread}
        />
        <section className="work-area" aria-label="프롬프트 첨삭 영역">
          <Header
            currentUser={currentUser}
            executeTarget={executeTarget}
            setExecuteTarget={setExecuteTarget}
            onLogin={() => setAuthMode("login")}
            onLogout={() => setCurrentUser(null)}
            onToggleRagSettings={() => setShowRagSettings((v) => !v)}
            ragMode={ragMode}
            onToggleRagMode={() =>
              setRagConfig((c) => ({
                ...c,
                collectionName:
                  c.collectionName === "papers" ? "prompt_techniques" : "papers",
              }))
            }
          />
          {showRagSettings && (
            <RagSettingsPanel
              config={ragConfig}
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
    </main>
  );
}

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar({
  activeTab, setActiveTab, collapsed, setCollapsed,
  query, setQuery,
  savedItems, recentItems,
  onOpenSavedPrompt, onOpenRecentThread,
  onDeleteSaved, onDeleteRecent,
}) {
  function selectTab(tabId) {
    setActiveTab(tabId);
    if (collapsed) setCollapsed(false);
  }

  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label="검색, 저장, 최근 대화 사이드바"
    >
      <div className="sidebar-top">
        <button
          className="collapse-button"
          type="button"
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <nav className="tab-list" aria-label="사이드바 탭">
        <TabButton id="search"  activeTab={activeTab} onClick={selectTab} icon={<Search size={15} />} label="Search" />
        <TabButton id="saved"   activeTab={activeTab} onClick={selectTab} icon={<Save size={15} />}   label="Saved" />
        <TabButton id="recents" activeTab={activeTab} onClick={selectTab} icon={<Clock3 size={15} />} label="Recents" />
      </nav>
      <div className="sidebar-content">
        {(activeTab === "search" || activeTab === "saved") && (
          <>
            <label className="search-input">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeTab === "search" ? "프롬프트 검색" : "저장된 프롬프트 검색..."}
                aria-label="프롬프트 검색"
              />
            </label>
            <PromptList items={savedItems} onOpenPrompt={onOpenSavedPrompt} onDelete={onDeleteSaved} />
          </>
        )}
        {activeTab === "recents" && (
          <>
            <label className="search-input">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="최근 대화 검색..."
                aria-label="최근 대화 검색"
              />
            </label>
            <RecentList items={recentItems} onOpenThread={onOpenRecentThread} onDelete={onDeleteRecent} />
          </>
        )}
      </div>
    </aside>
  );
}

function TabButton({ id, activeTab, onClick, icon, label }) {
  return (
    <button
      className={`tab-button ${activeTab === id ? "active" : ""}`}
      type="button"
      onClick={() => onClick(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PromptList({ items, onOpenPrompt, onDelete }) {
  if (items.length === 0) {
    return <p className="empty-list">저장된 프롬프트가 없습니다.</p>;
  }
  return (
    <div className="prompt-list" aria-label="저장된 프롬프트 목록">
      {items.map((item) => (
        <div className="saved-item-wrap" key={item.id}>
          <button className="saved-item" type="button" onClick={() => onOpenPrompt(item)}>
            <strong>{item.title}</strong>
            <span>{item.preview}</span>
          </button>
          <button
            className="delete-item-btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            aria-label="삭제"
            title="삭제"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function RecentList({ items, onOpenThread, onDelete }) {
  if (items.length === 0) {
    return <p className="empty-list">최근 대화가 없습니다.</p>;
  }
  return (
    <div className="recent-list" aria-label="최근 대화 목록">
      {items.map((item) => (
        <div className="saved-item-wrap" key={item.id}>
          <button className="recent-item" type="button" onClick={() => onOpenThread(item)}>
            <strong>{item.title}</strong>
            <span>{item.time}</span>
          </button>
          <button
            className="delete-item-btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            aria-label="삭제"
            title="삭제"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────
function Header({
  currentUser, executeTarget, setExecuteTarget,
  onLogin, onLogout, onToggleRagSettings,
  ragMode, onToggleRagMode,
}) {
  const meta = MODE_META[ragMode] || MODE_META.prompt_techniques;
  return (
    <header className="header">
      <button
        className={`rag-mode-toggle ${ragMode}`}
        type="button"
        onClick={onToggleRagMode}
        title={`현재: ${meta.label} — 클릭 시 전환`}
        aria-label="RAG 모드 전환"
      >
        {meta.icon} {meta.label === "기법 모드" ? "기법" : "논문"}
      </button>

      <button
        className="rag-settings-button"
        type="button"
        onClick={onToggleRagSettings}
        title="RAG 서버 설정"
        aria-label="RAG 서버 설정 열기"
      >
        <Settings size={15} />
        <span>RAG</span>
      </button>

      {currentUser ? (
        <button className="login-button" type="button" onClick={onLogout}>
          {currentUser}님
        </button>
      ) : (
        <button className="login-button" type="button" onClick={onLogin}>
          로그인
        </button>
      )}
    </header>
  );
}

// ── ChatFeed ──────────────────────────────────────────────────
function ChatFeed({ messages, isLoading, copiedId, onCopy, onSave, onExecute, ragMode }) {
  const isEmpty = messages.length === 0 && !isLoading;
  const scrollRef      = useRef(null);
  const spacerRef      = useRef(null);
  const lastUserIdRef  = useRef(null);

  // 새 메시지를 보내면, 방금 보낸 사용자 메시지를 화면 최상단에 고정시킨다(ChatGPT 방식).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    const el = container.querySelector(`[data-mid="${lastUser.id}"]`);
    if (!el) return;

    const TOP_GAP = 16;

    // 1) 스페이서를 0으로 두고 실제 내용 높이 측정
    if (spacerRef.current) spacerRef.current.style.height = "0px";
    const stack = el.parentElement;
    const contentBelow =
      stack.getBoundingClientRect().bottom - el.getBoundingClientRect().top;

    // 2) 마지막 사용자 메시지가 상단까지 올라올 수 있도록 부족한 만큼 스페이서 확보
    const need = Math.max(0, container.clientHeight - contentBelow - TOP_GAP);
    if (spacerRef.current) spacerRef.current.style.height = `${need}px`;

    // 3) '새로' 보낸 사용자 메시지일 때만 상단으로 스크롤
    const isNew = lastUser.id !== lastUserIdRef.current;
    if (isNew) {
      lastUserIdRef.current = lastUser.id;
      requestAnimationFrame(() => {
        const eRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        container.scrollBy({ top: eRect.top - cRect.top - TOP_GAP, behavior: "smooth" });
      });
    }
  }, [messages, isLoading]);

  return (
    <section
      ref={scrollRef}
      className={`chat-feed ${isEmpty ? "empty" : ""}`}
      aria-label="채팅 메시지"
    >
      {isEmpty ? (
        <Intro ragMode={ragMode} />
      ) : (
        <div className="message-stack">
          {messages.map((message) => (
            <MessageCard
              message={message}
              copied={copiedId === message.id}
              onCopy={onCopy}
              onSave={onSave}
              onExecute={onExecute}
              key={message.id}
            />
          ))}
          {isLoading && <TypingIndicator />}
          {/* 마지막 메시지를 상단에 고정하기 위한 가변 여백 */}
          <div ref={spacerRef} className="scroll-spacer" aria-hidden="true" />
        </div>
      )}
    </section>
  );
}

// ── Intro ─────────────────────────────────────────────────────
function Intro({ ragMode }) {
  const meta = MODE_META[ragMode] || MODE_META.prompt_techniques;
  return (
    <div className="intro">
      <div className="intro-icon"><Sparkles size={34} /></div>
      <h1>AI 프롬프트 첨삭 도우미</h1>
      <div className="mode-badge">
        <span>{meta.icon} {meta.label}</span>
        <span className="mode-desc">{meta.desc}</span>
      </div>
      <p>AI 툴에 입력할 프롬프트를 작성하면, 더 나은 결과를 얻을 수 있도록 첨삭해 드립니다.</p>
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
        <p className="example-label">💬 이런 질문을 해보세요</p>
        {meta.examples.map((ex) => (
          <span className="example-chip" key={ex}>{ex}</span>
        ))}
      </div>
    </div>
  );
}

// ── MessageCard ───────────────────────────────────────────────
function MessageCard({ message, copied, onCopy, onSave, onExecute }) {
  const isAssistant = message.role === "assistant";
  const [showSources, setShowSources] = useState(false);
  const hasSources = isAssistant && message.sources?.length > 0;

  return (
    <article
      className={`message-row ${message.role}${message.isError ? " error" : ""}`}
      data-mid={message.id}
    >
      <div className="message-card">
        <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
        {hasSources && (
          <div className="sources-section">
            <button
              className="sources-toggle"
              type="button"
              onClick={() => setShowSources((v) => !v)}
            >
              📚 참고 문서 {message.sources.length}건 {showSources ? "▲" : "▼"}
            </button>
            {showSources && (
              <ul className="sources-list">
                {message.sources.map((src, idx) => (
                  <li key={idx} className="source-item">
                    <span className="source-meta">
                      [{idx + 1}] {src.metadata?.source || src.metadata?.technique || "알 수 없음"}
                      {src.metadata?.category ? ` (${src.metadata.category})` : ""}
                      {" "}(유사도: {(src.score * 100).toFixed(1)}%)
                    </span>
                    <p className="source-text">{src.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {isAssistant && !message.isError && (
          <div className="card-actions">
            <ActionButton
              icon={copied ? <Check size={14} /> : <Copy size={14} />}
              label={copied ? "Copied" : "Copy"}
              onClick={() => onCopy(message)}
            />
            <ActionButton
              icon={message.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
              label={message.saved ? "Saved" : "Save"}
              onClick={() => onSave(message.id)}
            />
            {message.executablePrompt && (
              <ActionButton
                icon={<Play size={14} />}
                label="Execute"
                onClick={() => onExecute(message)}
              />
            )}
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
      <div className="typing-message" aria-label="첨삭 중">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────
function Composer({ value, onChange, onSubmit, disabled, onNewChat, hasMessages }) {
  return (
    <form
      className="composer"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      {hasMessages && (
        <button
          className="newchat-button"
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          aria-label="새 대화 시작"
          title="새 대화 시작"
        >
          <Sparkles size={16} />
        </button>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // 한글 IME 조합 중 Enter 는 무시 (마지막 음절 '줘' 잔류 방지)
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={hasMessages
          ? "이어서 개선 요청을 입력하세요 (예: 더 짧게, 페르소나 빼줘)..."
          : "개선할 프롬프트를 입력하세요..."}
        aria-label="첨삭받을 프롬프트 입력"
      />
      <button
        className="send-button"
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="프롬프트 보내기"
      >
        <Send size={18} />
      </button>
    </form>
  );
}

// ── RagSettingsPanel ──────────────────────────────────────────
function RagSettingsPanel({ config, onChange, onClose }) {
  const [local, setLocal] = useState({ ...config });

  // config 바뀌면 (외부에서 모드 토글 등) 동기화
  useEffect(() => { setLocal({ ...config }); }, [config]);

  function update(field, value) {
    setLocal((s) => ({ ...s, [field]: value }));
  }

  function apply(e) {
    e.preventDefault();
    onChange({ ...local, topK: Number(local.topK) });
    onClose();
  }

  return (
    <div className="rag-settings-panel" role="dialog" aria-label="RAG 서버 설정">
      <div className="rag-settings-header">
        <span>RAG 서버 설정</span>
        <button type="button" onClick={onClose} aria-label="닫기"><X size={15} /></button>
      </div>
      <form className="rag-settings-form" onSubmit={apply}>
        <label>
          서버 URL
          <input
            value={local.serverUrl}
            onChange={(e) => update("serverUrl", e.target.value)}
            placeholder="http://localhost:8000"
          />
        </label>
        <label>
          컬렉션 (RAG 모드)
          <select
            value={local.collectionName}
            onChange={(e) => update("collectionName", e.target.value)}
          >
            <option value="prompt_techniques">📖 기법 모드 (PDF 100개 기법)</option>
            <option value="papers">📄 논문 모드 (프롬프트 엔지니어링 논문)</option>
          </select>
        </label>
        <div className="rag-settings-row">
          <label>
            Top-K
            <input
              type="number"
              min={1}
              max={20}
              value={local.topK}
              onChange={(e) => update("topK", e.target.value)}
            />
          </label>
          <label>
            모델
            <select value={local.model} onChange={(e) => update("model", e.target.value)}>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </label>
        </div>
        <button className="rag-settings-apply" type="submit">적용</button>
      </form>
    </div>
  );
}

// ── AuthModal ─────────────────────────────────────────────────
function AuthModal({ mode, setMode, onClose, onLogin }) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ userId: "", password: "", name: "", phone: "" });

  function updateField(field, value) {
    setForm((s) => ({ ...s, [field]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button className="close-button" type="button" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
        <div className="auth-heading">
          <div className="auth-icon"><Sparkles size={22} /></div>
          <h2>{isSignup ? "회원가입" : "로그인"}</h2>
          <p>
            {isSignup
              ? "이름과 전화번호를 입력해 계정을 만들어보세요."
              : "저장한 프롬프트와 이전 대화를 계속 사용하세요."}
          </p>
        </div>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(isSignup ? form.name || "사용자" : form.userId || "사용자");
          }}
        >
          {isSignup && (
            <>
              <label>
                이름
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="홍길동"
                  required
                />
              </label>
              <label>
                전화번호
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="010-0000-0000"
                  required
                />
              </label>
            </>
          )}
          <label>
            아이디
            <input
              value={form.userId}
              onChange={(e) => updateField("userId", e.target.value)}
              placeholder="아이디를 입력하세요"
              required
            />
          </label>
          <label>
            비밀번호
            <div className="password-field">
              <input
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="비밀번호를 입력하세요"
                type={showPassword ? "text" : "password"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="비밀번호 표시 전환"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button className="auth-submit" type="submit">
            {isSignup ? "가입하기" : "로그인"}
          </button>
        </form>
        <p className="auth-switch">
          {isSignup ? "이미 계정이 있나요?" : "계정이 없나요?"}
          <button type="button" onClick={() => setMode(isSignup ? "login" : "signup")}>
            {isSignup ? "로그인" : "회원가입"}
          </button>
        </p>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

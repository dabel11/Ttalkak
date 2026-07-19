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
  CONFIG: "pp_backend_config",
  LEGACY_CONFIG: "pp_rag_config",
  AUTH: "pp_auth_session",
  SESSION_UUID: "pp_session_uuid",
};

const DEFAULT_RAG_CONFIG = {
  backendApiUrl: "http://localhost:8080",
  collectionName: "prompt_techniques",
  topK: 5,
  model: "gemini-2.0-flash",
};
const API_TIMEOUT_MS = 15000;

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

function getChromeLocalStorage() {
  return window.chrome?.storage?.local || null;
}

async function loadExtensionStorage(key, fallback) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) return loadStorage(key, fallback);

  return new Promise((resolve) => {
    chromeStorage.get([key], (result) => {
      if (window.chrome?.runtime?.lastError) {
        resolve(fallback);
        return;
      }
      resolve(result?.[key] ?? fallback);
    });
  });
}

async function saveExtensionStorage(key, value) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) {
    saveStorage(key, value);
    return;
  }

  await new Promise((resolve) => chromeStorage.set({ [key]: value }, resolve));
}

async function removeExtensionStorage(key) {
  const chromeStorage = getChromeLocalStorage();
  if (!chromeStorage) {
    try {
      localStorage.removeItem(key);
    } catch {}
    return;
  }

  await new Promise((resolve) => chromeStorage.remove([key], resolve));
}

function createSessionUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const randomPart = Array.from(window.crypto?.getRandomValues?.(new Uint8Array(16)) || [])
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `session-${Date.now()}-${randomPart || Math.random().toString(36).slice(2)}`;
}

async function getOrCreateSessionUuid() {
  const existing = await loadExtensionStorage(STORAGE.SESSION_UUID, "");
  if (existing) return existing;
  const sessionUuid = createSessionUuid();
  await saveExtensionStorage(STORAGE.SESSION_UUID, sessionUuid);
  return sessionUuid;
}

function normalizeBackendConfig(config = {}) {
  const legacyUrl = config.serverUrl && !String(config.serverUrl).includes(":8000") ? config.serverUrl : "";
  return {
    ...DEFAULT_RAG_CONFIG,
    ...config,
    backendApiUrl: config.backendApiUrl || legacyUrl || DEFAULT_RAG_CONFIG.backendApiUrl,
  };
}

function loadBackendConfig() {
  const stored = loadStorage(STORAGE.CONFIG, null);
  const legacy = stored ? null : loadStorage(STORAGE.LEGACY_CONFIG, null);
  return normalizeBackendConfig(stored || legacy || DEFAULT_RAG_CONFIG);
}

function makeTitle(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "새 프롬프트";
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

async function requestPromptImprove(config, payload) {
  const baseUrl = String(config.backendApiUrl || DEFAULT_RAG_CONFIG.backendApiUrl).replace(/\/+$/, "");
  const accessToken = payload?.accessToken || "";
  const sessionUuid = payload?.sessionUuid || "";
  const { accessToken: _accessToken, sessionUuid: _sessionUuid, ...requestPayload } = payload;
  const res = await fetchWithTimeout(`${baseUrl}/api/prompts/improve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(!accessToken && sessionUuid ? { "X-Session-UUID": sessionUuid } : {}),
    },
    body: JSON.stringify(requestPayload),
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return normalizeImproveResult(responseBody, requestPayload.prompt);
}

async function requestLogin(config, credentials) {
  const baseUrl = String(config.backendApiUrl || DEFAULT_RAG_CONFIG.backendApiUrl).replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return normalizeAuthSession(responseBody);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      timeoutError.status = 0;
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeAuthSession(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const user = data.user || {};
  const accessToken = String(data.accessToken || data.token || data.authToken || data.jwt || "").trim();
  if (!accessToken) throw new Error("로그인 응답에 accessToken이 없습니다.");

  const normalizedUser = {
    id: user.id ?? null,
    userId: user.userId || "",
    nickname: user.nickname || user.name || user.userId || "사용자",
    role: String(user.role || "user").toLowerCase(),
  };

  return {
    accessToken,
    user: normalizedUser,
    displayName: normalizedUser.nickname || normalizedUser.userId || "사용자",
  };
}

function isAuthExpiredError(error) {
  const status = Number(error?.status || error?.payload?.status || 0);
  const code = String(error?.code || error?.payload?.code || "").toUpperCase();
  return status === 401 || code === "LOGIN_REQUIRED" || code === "AUTHENTICATION_REQUIRED" || code === "ACCOUNT_BLOCKED";
}

function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const answer = result.answer || result.explanation || result.summary || "";
  const improvedText =
    result.improvedPrompt ||
    result.improved_prompt ||
    result.text ||
    result.content ||
    answer ||
    fallbackPrompt;

  return {
    answer: answer || "프롬프트를 개선했습니다.",
    improvedPrompt: improvedText,
    sources: result.sources || result.references || result.documents || [],
    ragStatus: String(result.ragStatus || result.rag_status || result.status || "ok").toLowerCase(),
    ragMessage: result.ragMessage || result.rag_message || "",
  };
}

function getApiErrorMessage(status, body) {
  const code = body?.code || "";
  if (code === "ACCOUNT_BLOCKED") return body?.message || "차단된 계정입니다. 관리자에게 문의해주세요.";
  if (code === "REQUEST_TIMEOUT") return body?.message || "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  if (code === "AI_TIMEOUT") return body?.message || "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  if (code === "AI_SERVICE_UNAVAILABLE") return body?.message || "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
  if (code === "FREE_TRIAL_LIMIT_EXCEEDED") return body?.message || "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
  if (code === "RATE_LIMIT_EXCEEDED") return body?.message || "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  if (status === 400) return body?.message || "요청 내용을 확인해주세요.";
  if (status === 401 || code === "LOGIN_REQUIRED") return "로그인이 필요하거나 세션이 만료되었습니다.";
  if (status === 403) return "이 작업을 수행할 권한이 없습니다.";
  if (status === 404) return "요청한 데이터를 찾을 수 없습니다.";
  if (status === 409) return body?.message || "이미 처리 중인 요청이 있습니다.";
  if (status === 429) return body?.message || "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  if (status === 503) return "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
  if (status === 504) return "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  if (status >= 500) return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  return body?.message || `요청 처리 중 오류가 발생했습니다. (${status})`;
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
  const [authSession, setAuthSession] = useState(null);
  const [sessionUuid, setSessionUuid] = useState("");
  const [executeTarget] = useState("auto");
  const [showRagSettings, setShowRagSettings] = useState(false);
  const [ragStatus, setRagStatus] = useState("idle");
  const [confirmAction, setConfirmAction] = useState(null);
  const activeThreadId = useRef(null);

  const [ragConfig, setRagConfig] = useState(loadBackendConfig);
  const [savedItems, setSavedItems] = useState(() => loadStorage(STORAGE.SAVED, []));
  const [recentThreads, setRecentThreads] = useState(() => loadStorage(STORAGE.RECENTS, []));
  const currentUser = authSession?.displayName || authSession?.user?.nickname || authSession?.user?.userId || "";

  useEffect(() => saveStorage(STORAGE.CONFIG, ragConfig), [ragConfig]);
  useEffect(() => saveStorage(STORAGE.SAVED, savedItems), [savedItems]);
  useEffect(() => saveStorage(STORAGE.RECENTS, recentThreads), [recentThreads]);
  useEffect(() => {
    let mounted = true;
    loadExtensionStorage(STORAGE.AUTH, null).then((session) => {
      if (!mounted || !session?.accessToken) return;
      setAuthSession(session);
    });
    getOrCreateSessionUuid().then((uuid) => {
      if (mounted) setSessionUuid(uuid);
    });
    return () => {
      mounted = false;
    };
  }, []);

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

  async function handleLogin(credentials) {
    const session = await requestLogin(ragConfig, credentials);
    setAuthSession(session);
    await saveExtensionStorage(STORAGE.AUTH, session);
    setAuthMode(null);
    showNotice(`${session.displayName}님으로 로그인했습니다.`);
  }

  async function handleLogout(message = "로그아웃했습니다.") {
    setAuthSession(null);
    await removeExtensionStorage(STORAGE.AUTH);
    showNotice(message);
  }

  async function handleAuthExpired() {
    await handleLogout("로그인이 만료되었습니다. 다시 로그인해주세요.");
    setAuthMode("login");
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
    setQuery("");
  }

  function saveLibraryPrompt(item) {
    const id = item.id.startsWith("library-") ? item.id : `saved-${item.id}`;
    setSavedItems((items) => {
      const alreadySaved = items.some((saved) => saved.id === id || saved.id === item.id || saved.content === item.content);
      if (alreadySaved) {
        showNotice("저장을 해제했습니다.");
        return items.filter((saved) => saved.id !== id && saved.id !== item.id && saved.content !== item.content);
      }
      showNotice("Saved에 저장했습니다.");
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
  }

  function isSaved(item) {
    return savedItems.some((saved) => saved.id === item.id || saved.id === `saved-${item.id}` || saved.content === item.content);
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
      showNotice("Claude는 자동 입력 대신 복사 방식으로 동작합니다. 입력창에 붙여넣어 주세요.");
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
          showNotice(`${targetLabel} 자동 입력에 실패했습니다. 복사된 프롬프트를 입력창에 붙여넣어 주세요.`);
        }
      );
      return;
    }

    await copyText(prompt);
    showNotice("미리보기 모드에서는 자동 입력을 사용할 수 없습니다. 복사된 프롬프트를 붙여넣어 주세요.");
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
      if (isAuthExpiredError(err)) await handleAuthExpired();
      if (err?.code === "FREE_TRIAL_LIMIT_EXCEEDED") setAuthMode("login");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: isNetwork
            ? `백엔드 API에 연결할 수 없습니다.\n\n현재 설정된 주소: ${ragConfig.backendApiUrl}\n\nSpring Boot 서버가 실행 중인지 확인하거나, 설정에서 Backend API URL을 확인해주세요.`
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

  function requestDeleteRecentThread(id) {
    setConfirmAction({
      title: "최근 대화 삭제",
      message: "이 최근 대화를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => setRecentThreads((prev) => prev.filter((t) => t.id !== id)),
    });
  }

  function requestDeleteSavedItem(id) {
    setConfirmAction({
      title: "저장한 프롬프트 삭제",
      message: "이 저장한 프롬프트를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => setSavedItems((prev) => prev.filter((i) => i.id !== id)),
    });
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
          onDeleteRecent={requestDeleteRecentThread}
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
            emptyText="검색할 수 있는 프롬프트가 없습니다."
            mode="search"
            isSaved={isSaved}
            onOpenPrompt={onOpenPrompt}
            onSavePrompt={onSavePrompt}
          />
        )}
        {activeTab === "saved" && (
          <PromptList
            items={savedItems}
            emptyText="저장한 프롬프트가 없습니다."
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
    <div className="prompt-list" aria-label={mode === "search" ? "전체 프롬프트 검색 결과" : "저장한 프롬프트 목록"}>
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
                aria-label="삭제"
                title="삭제"
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
  if (items.length === 0) return <p className="empty-list">최근 대화가 없습니다.</p>;

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
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
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
        <button className="rag-settings-button" type="button" onClick={onToggleRagSettings} title="Backend API settings">
          <Settings size={15} />
          <span>API</span>
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
  if (status === "connected") return "Backend connected";
  if (status === "checking") return "Checking backend";
  if (status === "error") return "Backend error";
  return "Backend idle";
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
    <section ref={scrollRef} className={`chat-feed ${isEmpty ? "empty" : ""}`} aria-label="채팅 메시지">
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
              참고 자료 {message.sources.length}건 {showSources ? "접기" : "보기"}
            </button>
            {showSources && (
              <ul className="sources-list">
                {message.sources.map((source, idx) => (
                  <li key={idx} className="source-item">
                    <span className="source-meta">
                      [{idx + 1}] {source.metadata?.source || source.metadata?.technique || "출처 없음"}
                      {source.metadata?.category ? ` (${source.metadata.category})` : ""}
                      {typeof source.score === "number" ? ` 유사도 ${(source.score * 100).toFixed(1)}%` : ""}
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
    const { serverUrl: _legacyServerUrl, ...nextConfig } = local;
    onChange(normalizeBackendConfig({ ...nextConfig, topK: Number(local.topK) }));
    onClose();
  }

  return (
    <div className="rag-settings-panel" role="dialog" aria-label="Backend API settings">
      <div className="rag-settings-header">
        <span>Backend API settings</span>
        <span className={`rag-status ${status}`}>{getRagStatusText(status)}</span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <form className="rag-settings-form" onSubmit={apply}>
        <label>
          Backend API URL
          <input value={local.backendApiUrl} onChange={(e) => update("backendApiUrl", e.target.value)} placeholder="http://localhost:8080" />
        </label>
        <label>
          Knowledge mode
          <select value={local.collectionName} onChange={(e) => update("collectionName", e.target.value)}>
            <option value="prompt_techniques">기법 모드</option>
            <option value="papers">논문 모드</option>
          </select>
        </label>
        <div className="rag-settings-row">
          <label>
            Top-K
            <input type="number" min={1} max={20} value={local.topK} onChange={(e) => update("topK", e.target.value)} />
          </label>
          <label>
            Model hint
            <select value={local.model} onChange={(e) => update("model", e.target.value)}>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </label>
        </div>
        <button className="rag-settings-apply" type="submit">Apply</button>
      </form>
    </div>
  );
}

function AuthModal({ mode, setMode, onClose, onLogin, backendApiUrl }) {
  const isSignup = mode === "signup";
  const isFindId = mode === "findId";
  const isFindPassword = mode === "findPassword";
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ userId: "", password: "", name: "", phone: "" });
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = isSignup ? "Sign up" : isFindId ? "Find ID" : isFindPassword ? "Find password" : "Login";
  const description = isSignup
    ? "회원가입은 웹사이트에서 진행해주세요."
    : isFindId
      ? "Enter your name and phone number to find your ID."
      : isFindPassword
        ? "Enter your ID and phone number to request a password reset."
        : "Spring Boot 계정으로 로그인해 웹과 동일한 회원 정보를 사용합니다.";

  function updateField(field, value) {
    setResult("");
    setForm((state) => ({ ...state, [field]: value }));
  }

  function moveMode(nextMode) {
    setResult("");
    setMode(nextMode);
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (isFindId) {
      setResult("After backend account API integration, the matching ID will be shown here.");
      return;
    }
    if (isFindPassword) {
      setResult("After backend account API integration, this will start the password reset flow.");
      return;
    }
    if (isSignup) {
      setResult("Extension 회원가입은 아직 지원하지 않습니다. 웹사이트에서 가입 후 로그인해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onLogin({ userId: form.userId.trim(), password: form.password });
    } catch (error) {
      setResult(error?.message || "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="auth-heading">
          <div className="auth-icon"><Plus size={22} /></div>
          <h2>{title}</h2>
          <p>{description}</p>
          {!isSignup && !isFindId && !isFindPassword && backendApiUrl && <p className="auth-result">API: {backendApiUrl}</p>}
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
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : isFindId ? "Find ID" : isFindPassword ? "Find password" : isSignup ? "Sign up" : "Login"}
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
          <button className="confirm-cancel" type="button" onClick={onCancel}>취소</button>
          <button className="confirm-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);


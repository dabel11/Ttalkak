// @ts-check
/** @param {{ demo?: { fallbackPopularTags?: string[], promptOverrides?: Record<string, Partial<TtalkakPromptRecord>>, popularPromptMetrics?: Record<string, number[]>, savedPrompts?: TtalkakPromptRecord[], existingNicknames?: string[], existingUserIds?: string[], commentOverrides?: Record<string, TtalkakStateEntity[]> } | null, demoFallbackEnabled?: boolean }} [options] */
export function createAppStaticData({ demo = null, demoFallbackEnabled = false } = {}) {
  const DEMO_FALLBACK_ENABLED = Boolean(demoFallbackEnabled);
  const DEMO_DATA_ENABLED = globalThis.TTALKAK_PRODUCTION_BUILD !== true && DEMO_FALLBACK_ENABLED;
  /** @type {TtalkakPromptRecord[]} */
  const popularPrompts = DEMO_DATA_ENABLED
    ? Object.entries(demo?.promptOverrides || {}).map(([id, prompt]) => {
      const [views = 0, comments = 0, saves = 0] = demo?.popularPromptMetrics?.[id] || [];
      return { id, ...prompt, views, comments, saves, source: "community" };
    })
    : [];
  /** @type {TtalkakPromptRecord[]} */
  const savedPrompts = DEMO_DATA_ENABLED
    ? [...popularPrompts.slice(0, 4), ...(demo?.savedPrompts || [])].sort((a, b) => Number(b.saves || 0) - Number(a.saves || 0))
    : [];
  const DEMO_LIBRARY_PROMPT_IDS = new Set(savedPrompts.map((prompt) => prompt.id));
  const fallbackPopularTags = DEMO_DATA_ENABLED ? demo?.fallbackPopularTags || [] : [];
  const promptTemplates = [
    {
      id: "writing",
      label: "글쓰기",
      prompt: "목적: 글을 더 명확하고 설득력 있게 작성하고 싶습니다.\n글의 주제:\n읽는 사람:\n핵심 메시지:\n원하는 톤:\n반드시 포함할 내용:\n출력 형식:",
    },
    {
      id: "summary",
      label: "요약",
      prompt: "목적: 내용을 요약하고 싶습니다.\n요약할 원문/자료:\n요약 대상 독자:\n원하는 요약 길이:\n반드시 남길 핵심:\n제외할 내용:\n출력 형식:",
    },
    {
      id: "analysis",
      label: "분석",
      prompt: "목적: 자료나 상황을 분석하고 싶습니다.\n분석 대상:\n현재 상황:\n확인하고 싶은 관점:\n중요한 기준:\n이미 알고 있는 정보:\n원하는 결과 형식:",
    },
    {
      id: "planning",
      label: "기획",
      prompt: "목적: 실행 가능한 기획안을 만들고 싶습니다.\n기획 주제:\n목표:\n대상 사용자/고객:\n제약 조건:\n필요한 구성 요소:\n원하는 결과 형식:",
    },
    {
      id: "coding",
      label: "코딩",
      prompt: "목적: 개발 문제를 더 정확하게 질문하고 싶습니다.\n사용 언어/프레임워크:\n현재 상황:\n문제 증상:\n시도해본 방법:\n에러 메시지/로그:\n원하는 결과:",
    },
    {
      id: "marketing",
      label: "마케팅",
      prompt: "목적: 마케팅 전략이나 문구를 만들고 싶습니다.\n제품/서비스:\n타겟 고객:\n핵심 장점:\n고객의 고민:\n사용 채널:\n원하는 톤:\nCTA:",
    },
    {
      id: "support",
      label: "고객 응대",
      prompt: "목적: 고객에게 답변할 내용을 만들고 싶습니다.\n고객 문의 내용:\n현재 상황:\n전달해야 할 사실:\n피해야 할 표현:\n원하는 톤:\n후속 안내:",
    },
    {
      id: "learning",
      label: "학습/설명",
      prompt: "목적: 개념을 쉽게 설명하거나 학습 자료를 만들고 싶습니다.\n설명할 주제:\n대상 수준:\n이미 알고 있는 내용:\n어려워하는 부분:\n원하는 예시:\n출력 형식:",
    },
    {
      id: "custom",
      label: "직접 입력",
      prompt: "",
    },
  ];
  const FREE_MAKE_LIMIT = 3;
  const WITHDRAWN_AUTHOR_LABEL = "탈퇴한 사용자";
  const PROTECTED_BACKEND_ACTIONS = new Set([
    "addComment",
    "addReply",
    "deleteComment",
    "deleteAdminComment",
    "deleteMakeFolder",
    "deletePrompt",
    "hideAdminComment",
    "hideAdminPrompt",
    "likeComment",
    "likePrompt",
    "reportComment",
    "reportPrompt",
    "requestAuthorRevision",
    "requestPromptRevision",
    "restoreAdminPrompt",
    "savePrompt",
    "unlikeComment",
    "unlikePrompt",
    "unhideAdminComment",
    "unsavePrompt",
    "unsharePrompt",
    "updateAuthorRevisionRequest",
    "updateAdminReportStatus",
    "updateAdminRevisionRequestStatus",
    "updateAdminTagStatus",
    "updateComment",
    "updateMakeFolder",
  ]);
  const SAVED_PAGE_SIZE = 16;
  const HOME_PAGE_SIZE = 16;
  const SEARCH_DEBOUNCE_MS = 320;
  const MAX_CUSTOM_MAKE_FOLDERS = 5;
  const DEMO_EXISTING_NICKNAMES = DEMO_DATA_ENABLED ? demo?.existingNicknames || [] : [];
  const DEMO_EXISTING_USER_IDS = DEMO_DATA_ENABLED ? demo?.existingUserIds || [] : [];
  const commentsByPrompt = DEMO_DATA_ENABLED ? structuredClone(demo?.commentOverrides || {}) : {};
  const demoCommentBackfill = commentsByPrompt;
  return Object.freeze({ DEMO_FALLBACK_ENABLED, popularPrompts, savedPrompts, DEMO_LIBRARY_PROMPT_IDS, fallbackPopularTags, promptTemplates, FREE_MAKE_LIMIT, WITHDRAWN_AUTHOR_LABEL, PROTECTED_BACKEND_ACTIONS, SAVED_PAGE_SIZE, HOME_PAGE_SIZE, SEARCH_DEBOUNCE_MS, MAX_CUSTOM_MAKE_FOLDERS, DEMO_EXISTING_NICKNAMES, DEMO_EXISTING_USER_IDS, commentsByPrompt, demoCommentBackfill });
}

/** @param {TtalkakModuleRegistry} modules */
export function startApp(modules) {
if (!modules) throw new Error("TTALKAK application modules are not initialized");
const toWarningError = (...args) => {
  const error = args.find((value) => value instanceof Error) || new Error(args.map(String).join(" "));
  return error;
};
const reportWarning = (area, action, error) => modules.observability.reportWarning(area, action, error);

const {
  normalizeSearchText,
  normalizeTag,
  isValidPhone,
  isFutureDate,
  escapeHtml: utilEscapeHtml,
  escapeAttr: utilEscapeAttr,
  getFinalPromptText,
  formatNumber,
  formatShortDate,
  parseTimestamp,
} = modules.utils || {};

function fallbackEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const escapeHtml = typeof utilEscapeHtml === "function" ? utilEscapeHtml : fallbackEscapeHtml;
const escapeAttr = typeof utilEscapeAttr === "function" ? utilEscapeAttr : escapeHtml;
const {
  collectPopularTags,
  getValidSearchScope,
  parsePromptSearchQuery,
  selectVisiblePrompts,
  sortPrompts,
  uniquePrompts,
} = modules.home.model || {};
const getUniquePrompts = uniquePrompts;
const { createHomeController } = modules.home.controller || {};
const { bindHomeEvents } = modules.home.events || {};
const { createSavedLibraryController } = modules.saved || {};
const { createDiscoveryController } = modules.discovery || {};
const { createPromptEngagementController } = modules.interactions.engagement || {};
const { bindPromptEngagementEvents } = modules.interactions.events || {};
const {
  canDeleteComment: canDeleteCommentModel,
  countCommentThread: countCommentThreadModel,
  createCommentRepository,
  findCommentById: findCommentByIdModel,
  findCommentInList,
  findPromptIdByCommentId: findPromptIdByCommentIdModel,
  getCommentLikes: getCommentLikesModel,
  sortComments: sortCommentsModel,
  syncPromptCommentCount: syncPromptCommentCountModel,
} = modules.interactions.comments || {};
const { createCommentView } = modules.interactions.commentView || {};
const { createPromptWorkflows } = modules.interactions.workflows || {};
const loadShareRuntime = modules.share.loadRuntime;
const { createModalController } = modules.modal.controller || {};
const { bindModalEvents } = modules.modal.events || {};
const { createModalView } = modules.modal.view || {};
const { createAuthSession, normalizeAuthResult } = modules.auth.session || {};
const { getUserIdValidationMessage, isValidEmail } = modules.auth.validation || {};
const { createAuthController } = modules.auth.controller || {};
const { bindAuthControlEvents: bindAuthControls, bindAuthFormEvents: bindAuthForm } = modules.auth.events || {};
const { createAuthView } = modules.auth.view || {};
const { createAdminSelectors } = modules.admin.selectors || {};
const loadAdminRuntime = modules.admin.loadRuntime;
const { createAppBootstrap } = modules.bootstrap || {};
const {
  makePreview,
  sanitizeMakeBackendMessage,
} = modules.make.preview || {};
const {
  recoverActiveMakeThreadAfterFailure,
} = modules.effects.makeFailureRecovery || {};
const {
  createMakeServerSyncEffects,
} = modules.effects.makeServerSync || {};
const loadMakeRuntime = modules.make.loadRuntime;
const apiClient = modules.api;
let makeControllerModule = null;
let makeEventsModule = null;
const makeFocusModule = modules.make.focus;
const makeMessageModel = modules.make.messageModel;
const makePersistenceModule = modules.make.persistence;
const makeStateModule = modules.make.state;

if (
  [
    normalizeSearchText,
    normalizeTag,
    isValidPhone,
    isFutureDate,
    getFinalPromptText,
    formatNumber,
    formatShortDate,
    parseTimestamp,
    collectPopularTags,
    getValidSearchScope,
    parsePromptSearchQuery,
    selectVisiblePrompts,
    sortPrompts,
    uniquePrompts,
    createHomeController,
    bindHomeEvents,
    createSavedLibraryController,
    createDiscoveryController,
    createPromptEngagementController,
    bindPromptEngagementEvents,
    canDeleteCommentModel,
    countCommentThreadModel,
    createCommentRepository,
    findCommentByIdModel,
    findCommentInList,
    findPromptIdByCommentIdModel,
    getCommentLikesModel,
    sortCommentsModel,
    syncPromptCommentCountModel,
    createCommentView,
    createPromptWorkflows,
    loadShareRuntime,
    createModalController,
    bindModalEvents,
    createModalView,
    createAuthSession,
    normalizeAuthResult,
    getUserIdValidationMessage,
    isValidEmail,
    createAuthController,
    bindAuthControls,
    bindAuthForm,
    createAuthView,
    createAdminSelectors,
    loadAdminRuntime,
    createAppBootstrap,
    makePreview,
    sanitizeMakeBackendMessage,
    recoverActiveMakeThreadAfterFailure,
    createMakeServerSyncEffects,
    loadMakeRuntime,
  ].some((fn) => typeof fn !== "function")
) {
  throw new Error("TTALKAK 공통 유틸을 불러오지 못했습니다.");
}

const {
  AdminUserBlockDialog,
  ConfirmDialog,
  Pagination: BasePagination,
} = modules.components || {};

if ([AdminUserBlockDialog, ConfirmDialog, BasePagination].some((fn) => typeof fn !== "function")) {
  throw new Error("TTALKAK 공통 컴포넌트를 불러오지 못했습니다.");
}

const { bindAppEvents } = modules.events.app || {};

if (typeof bindAppEvents !== "function") {
  throw new Error("TTALKAK 이벤트 바인더를 불러오지 못했습니다.");
}

const {
  bindMakeFeedScrollEvents,
  queueLatestMakeScroll,
  renderWithPreservedMakeScroll,
  scheduleMakeLatestScroll: scheduleMakeLatestScrollEffect,
  scrollToMakeLatestMessage,
  scrollToPendingLatestMakeMessage,
} = modules.events.makeScroll || {};

if (
  [
    bindMakeFeedScrollEvents,
    queueLatestMakeScroll,
    renderWithPreservedMakeScroll,
    scheduleMakeLatestScrollEffect,
    scrollToMakeLatestMessage,
    scrollToPendingLatestMakeMessage,
  ].some((fn) => typeof fn !== "function")
) {
  throw new Error("TTALKAK Make scroll events failed to load.");
}

const {
  applyBackendHomePromptsResult,
  applyBackendHomeTagsResult,
  applyLikedLibraryResult,
  applyMakeFoldersResult,
  applyMakeThreadsResult,
  applyMyCommentsResult,
  applyMyLibraryResult,
  applyMyPromptsResult,
  applyMyReportsResult,
  getBackendErrorCode,
  getBackendErrorCodeMessage,
  getBackendErrorMessage,
  hydrateBackendHomeDataEffect,
  hydrateBackendMakeDataEffect,
  hydrateBackendMyPageDataEffect,
  refreshBackendHomePromptsEffect,
} = modules.effects.backend || {};

if (
  [
    applyBackendHomePromptsResult,
    applyBackendHomeTagsResult,
    applyLikedLibraryResult,
    applyMakeFoldersResult,
    applyMakeThreadsResult,
    applyMyCommentsResult,
    applyMyLibraryResult,
    applyMyPromptsResult,
    applyMyReportsResult,
    getBackendErrorCode,
    getBackendErrorCodeMessage,
    getBackendErrorMessage,
    hydrateBackendHomeDataEffect,
    hydrateBackendMakeDataEffect,
    hydrateBackendMyPageDataEffect,
    refreshBackendHomePromptsEffect,
  ].some((fn) => typeof fn !== "function")
) {
  throw new Error("TTALKAK 백엔드 후처리 헬퍼를 불러오지 못했습니다.");
}

const {
  canTransitionAdminTagStatus,
  getAdminTagStatusClass,
  getAdminTagStatusLabel,
  getAdminTagStatusOrder,
  hydrateBackendAdminData,
  normalizeAdminSearchText,
  refreshAdminAfterMutationEffect,
  refreshAdminAuditLogsEffect,
  resolveAdminTagStatus,
} = modules.effects.admin || {};

if (
  [
    canTransitionAdminTagStatus,
    getAdminTagStatusClass,
    getAdminTagStatusLabel,
    getAdminTagStatusOrder,
    hydrateBackendAdminData,
    normalizeAdminSearchText,
    refreshAdminAfterMutationEffect,
    refreshAdminAuditLogsEffect,
    resolveAdminTagStatus,
  ].some((fn) => typeof fn !== "function")
) {
  throw new Error("TTALKAK admin effects failed to load.");
}

const { handleBackendAccessErrorEffect } = modules.effects.error || {};

if (typeof handleBackendAccessErrorEffect !== "function") {
  throw new Error("TTALKAK error effects failed to load.");
}

const {
  STORAGE_KEY,
  AUTH_TOKEN_KEY,
  DEMO_AUTH_TOKEN,
  addCommentReplyState,
  addPromptCommentState,
  applyAdminPromptHiddenState,
  applyAdminReportStatusState,
  applyAdminRevisionRequestState,
  applyAdminTagDecisionState,
  applyAdminUserActivityRefreshState,
  applyAdminUserBlockActivityState,
  applyBackendPromptUnsavedState,
  applyAuthenticatedIdentityState,
  applyCommentReportedState,
  applyHomeAuthorSearchState,
  applyHomePageState,
  applyHomeSearchQueryState,
  applyHomeSearchScopeState,
  applyHomeSortState,
  applyHomeTagSearchState,
  toggleReportedVisibilityState,
  applyDeletedPromptState,
  applyEditedPromptState,
  deleteCommentState,
  applyExistingPromptSavedState,
  applyNewPromptSavedState,
  applyPendingUnsavesState,
  applyPublishedSavedPromptState,
  applySharedPromptState,
  applyPromptLikedState,
  applyPromptReportedState,
  applyPromptUnlikedState,
  applyPromptUnsavedState,
  applyUnsharedPromptState,
  toggleCommentLikedState,
  toggleEditCommentState,
  toggleReplyCommentState,
  appendMakeAssistantMessageState,
  appendMakeUserMessageState,
  applyEditedMakeMessageState,
  clearAuthenticatedIdentityState,
  clearAuthenticatedSessionState,
  createInitialState,
  closeTopModalState,
  clearPersistedPayload,
  clearSessionBackendDataState,
  clearTransientSessionUiState: clearTransientSessionUiStateValue,
  createLocalMakeFolderState,
  deleteMakeFolderState,
  deleteMakeThreadState,
  finishAdminRevisionRequestState,
  finishEditedMakeMessageState,
  loadPersistedAppState,
  openRecentMakeThreadState,
  openSavedMakePromptState,
  readStorageItem,
  removeStorageItem,
  removePromptByIdState,
  removeLocalMakeFolderState,
  restoreMakeThreadFolderState,
  normalizeSavedPageState,
  persistAppState,
  resetSessionBackendState: resetSessionBackendStateValue,
  resetHomeViewState,
  startNewMakeChatState,
  togglePendingUnsaveState,
  toggleSavedMakeMessageState,
  updateOwnCommentState,
  updateRecentMakeThreadState,
  writeStorageItem,
} = modules.state.api;

if (
  !STORAGE_KEY ||
  !AUTH_TOKEN_KEY ||
  !DEMO_AUTH_TOKEN ||
  [
    createInitialState,
    addCommentReplyState,
    addPromptCommentState,
    applyAdminPromptHiddenState,
    applyAdminReportStatusState,
    applyAdminRevisionRequestState,
    applyAdminTagDecisionState,
    applyAdminUserActivityRefreshState,
    applyAdminUserBlockActivityState,
    applyBackendPromptUnsavedState,
    applyAuthenticatedIdentityState,
    applyCommentReportedState,
    applyHomeAuthorSearchState,
    applyHomePageState,
    applyHomeSearchQueryState,
    applyHomeSearchScopeState,
    applyHomeSortState,
    applyHomeTagSearchState,
    toggleReportedVisibilityState,
    applyDeletedPromptState,
    applyEditedPromptState,
    deleteCommentState,
    applyExistingPromptSavedState,
    applyNewPromptSavedState,
    applyPendingUnsavesState,
    applyPublishedSavedPromptState,
    applySharedPromptState,
    applyPromptLikedState,
    applyPromptReportedState,
    applyPromptUnlikedState,
    applyPromptUnsavedState,
    applyUnsharedPromptState,
    toggleCommentLikedState,
    toggleEditCommentState,
    toggleReplyCommentState,
    appendMakeAssistantMessageState,
    appendMakeUserMessageState,
    applyEditedMakeMessageState,
    clearAuthenticatedIdentityState,
    clearAuthenticatedSessionState,
    closeTopModalState,
    clearPersistedPayload,
    clearSessionBackendDataState,
    clearTransientSessionUiStateValue,
    createLocalMakeFolderState,
    deleteMakeFolderState,
    deleteMakeThreadState,
    finishAdminRevisionRequestState,
    finishEditedMakeMessageState,
    loadPersistedAppState,
    openRecentMakeThreadState,
    openSavedMakePromptState,
    readStorageItem,
    removeStorageItem,
    removePromptByIdState,
    removeLocalMakeFolderState,
    restoreMakeThreadFolderState,
    normalizeSavedPageState,
    persistAppState,
    resetSessionBackendStateValue,
    resetHomeViewState,
    startNewMakeChatState,
    togglePendingUnsaveState,
    toggleSavedMakeMessageState,
    updateOwnCommentState,
    updateRecentMakeThreadState,
    writeStorageItem,
  ].some((fn) => typeof fn !== "function")
) {
  throw new Error("TTALKAK 상태 헬퍼를 불러오지 못했습니다.");
}

const {
  AdminAuditPanelView,
  AdminPromptsPanelView,
  AdminRevisionRequestModalView,
  AdminReportsPanelView,
  AdminPageView,
  AdminTagsPanelView,
  AdminUsersPanelView,
  AuthModalView,
  ExecuteModalView,
  HomePageView,
  MakeComposerView,
  MakeFeedView,
  MakeFolderButtonView,
  MakePageView,
  MakeSidePanelView,
  MakeTemplateBarView,
  MessageBubbleView,
  MyCommentsPanelView,
  MyPromptsPanelView,
  MyReportsPanelView,
  PromptCardView,
  PromptDetailModalView,
  PromptEditModalView,
  ReportModalView,
  SavedLibraryPanelView,
  SavedPageView,
  SharePageView,
  HeaderView,
  SidebarView,
  renderAppShell,
} = modules.renderers || {};

if ([AdminAuditPanelView, AdminPromptsPanelView, AdminRevisionRequestModalView, AdminReportsPanelView, AdminPageView, AdminTagsPanelView, AdminUsersPanelView, AuthModalView, ExecuteModalView, HeaderView, HomePageView, MakeComposerView, MakeFeedView, MakeFolderButtonView, MakePageView, MakeSidePanelView, MakeTemplateBarView, MessageBubbleView, MyCommentsPanelView, MyPromptsPanelView, MyReportsPanelView, PromptCardView, PromptDetailModalView, PromptEditModalView, ReportModalView, SavedLibraryPanelView, SavedPageView, SharePageView, SidebarView, renderAppShell].some((fn) => typeof fn !== "function")) {
  throw new Error("TTALKAK 렌더러를 불러오지 못했습니다.");
}

const { resolvePageView } = modules.routing || {};

if (typeof resolvePageView !== "function") {
  throw new Error("TTALKAK 라우팅 헬퍼를 불러오지 못했습니다.");
}

const DEMO_FALLBACK_ENABLED = window.TTALKAK_DEMO_FALLBACK_ENABLED === true;

const popularPrompts = [
  {
    id: "post-1",
    title: "전문적인 인스타그램 캡션 작성",
    text: "당신은 전문적인 콘텐츠 마케터입니다. 브랜드의 핵심 메시지를 살려 인스타그램 캡션을 작성해주세요. 해시태그도 5개 포함해주세요.",
    tags: ["마케팅", "인스타그램", "콘텐츠"],
    views: 150420,
    comments: 1835,
    saves: 62880,
    author: "카피메이커",
    source: "community",
  },
  {
    id: "post-2",
    title: "글쓰기 첨삭 프롬프트",
    text: "더 매력적인 글쓰기를 위한 첨삭봇. 글의 흐름, 문법, 가독성을 모두 고려해서 개선안을 제안해주세요.",
    tags: ["첨삭", "글쓰기", "편집"],
    views: 89340,
    comments: 3210,
    saves: 44820,
    author: "카피메이커",
    source: "community",
  },
  {
    id: "post-3",
    title: "SEO 블로그 포스팅",
    text: "검색엔진 상위 노출을 위한 키워드 중심의 블로그 글을 작성해주세요. 제목, 소제목, 본문을 구조화해주세요.",
    tags: ["SEO", "블로그", "검색최적화"],
    views: 72450,
    comments: 1980,
    saves: 35670,
    author: "태그지니",
    source: "community",
  },
  {
    id: "post-4",
    title: "소셜미디어 캠페인 전략",
    text: "특정 제품이나 서비스를 위한 소셜미디어 마케팅 캠페인 전략을 수립해주세요. 플랫폼별 접근 방법을 포함해주세요.",
    tags: ["소셜미디어", "캠페인", "전략"],
    views: 68920,
    comments: 2340,
    saves: 33560,
    author: "콘텐츠랩",
    source: "community",
  },
  {
    id: "post-5",
    title: "클릭을 유도하는 제목 작성",
    text: "특정 키워드를 중심으로 클릭을 유도할 수 있는 제목을 10개 만들어주세요. 숫자와 질문 형식을 활용해주세요.",
    tags: ["제목", "클릭베이트", "SEO"],
    views: 58720,
    comments: 2140,
    saves: 29450,
    author: "콘텐츠랩",
    source: "community",
  },
  {
    id: "post-6",
    title: "유튜브 영상 기획안",
    text: "시청자의 관심을 끌 수 있는 유튜브 영상 기획안을 작성해주세요. 훅, 본문, 마무리 CTA를 포함해주세요.",
    tags: ["유튜브", "영상", "기획"],
    views: 54230,
    comments: 1450,
    saves: 27890,
    author: "콘텐츠랩",
    source: "community",
  },
  {
    id: "post-7",
    title: "브레인스토밍 도우미",
    text: "새로운 아이디어나 프로젝트를 위한 창의적인 발상을 도와주세요. 다양한 관점에서 아이디어를 제시해주세요.",
    tags: ["브레인스토밍", "아이디어", "창의성"],
    views: 47560,
    comments: 1120,
    saves: 21340,
    author: "태그지니",
    source: "community",
  },
  {
    id: "post-8",
    title: "협찬 제안서 만들기",
    text: "브랜드와 협업을 위한 전문적인 제안서를 작성해주세요. 나의 채널 특성과 타깃 오디언스를 강조해주세요.",
    tags: ["협찬", "제안서", "비즈니스"],
    views: 35680,
    comments: 892,
    saves: 18920,
    author: "콘텐츠랩",
    source: "community",
  },
];

const savedPrompts = [
  ...popularPrompts.slice(0, 4),
  {
    id: "mine-1",
    title: "딸깍 확장 프로그램 소개문",
    text: "프롬프트 첨삭 Chrome Extension을 소개하는 짧은 랜딩 카피를 작성해주세요. 핵심 기능, 사용 이점, CTA를 포함해주세요.",
    tags: ["내프롬프트", "카피", "확장프로그램"],
    views: 0,
    comments: 0,
    saves: 128,
    author: "나",
    source: "mine",
    isShared: false,
  },
  {
    id: "mine-2",
    title: "코딩 질문 개선",
    text: "막연한 코딩 질문을 재현 단계, 기대 결과, 실제 결과, 에러 로그, 환경 정보가 들어간 질문으로 바꿔주세요.",
    tags: ["내프롬프트", "코딩", "질문"],
    views: 0,
    comments: 0,
    saves: 94,
    author: "나",
    source: "mine",
    isShared: false,
  },
].sort((a, b) => b.saves - a.saves);

const DEMO_LIBRARY_PROMPT_IDS = new Set(savedPrompts.map((prompt) => prompt.id));

const fallbackPopularTags = window.TTALKAK_DEMO_COPY?.fallbackPopularTags || ["SEO", "마케팅", "코딩", "이메일", "블로그", "콘텐츠", "첨삭", "기획"];
const demoPromptTextOverrides = {
  "post-1": {
    title: "전문적인 인스타그램 캡션 작성",
    text: "당신은 전문적인 콘텐츠 마케터입니다. 브랜드의 핵심 메시지를 살려 인스타그램 캡션을 작성해주세요. 해시태그도 5개 포함해주세요.",
    tags: ["마케팅", "인스타그램", "콘텐츠"],
    author: "카피메이커",
  },
  "post-2": {
    title: "글쓰기 첨삭 프롬프트",
    text: "더 매력적인 글쓰기를 위한 첨삭봇입니다. 글의 흐름, 문법, 가독성을 모두 고려해서 개선안을 제안해주세요.",
    tags: ["첨삭", "글쓰기", "편집"],
    author: "카피메이커",
  },
  "post-3": {
    title: "SEO 블로그 포스팅",
    text: "검색엔진 상위 노출을 위한 키워드 중심의 블로그 글을 작성해주세요. 제목, 소제목, 본문 구조를 함께 제안해주세요.",
    tags: ["SEO", "블로그", "검색최적화"],
    author: "태그지니",
  },
  "post-4": {
    title: "소셜미디어 캠페인 전략",
    text: "특정 제품이나 서비스를 위한 소셜미디어 마케팅 캠페인 전략을 수립해주세요. 플랫폼별 접근 방법을 포함해주세요.",
    tags: ["소셜미디어", "캠페인", "전략"],
    author: "콘텐츠랩",
  },
  "post-5": {
    title: "클릭을 유도하는 제목 작성",
    text: "특정 키워드를 중심으로 클릭을 유도할 수 있는 제목을 10개 만들어주세요. 숫자와 질문 형식을 활용해주세요.",
    tags: ["제목", "클릭베이트", "SEO"],
    author: "콘텐츠랩",
  },
  "post-6": {
    title: "유튜브 영상 기획안",
    text: "시청자의 관심을 끌 수 있는 유튜브 영상 기획안을 작성해주세요. 훅, 본문, 마무리 CTA를 포함해주세요.",
    tags: ["유튜브", "영상", "기획"],
    author: "콘텐츠랩",
  },
  "post-7": {
    title: "브레인스토밍 도우미",
    text: "새로운 아이디어나 프로젝트를 위한 창의적인 발상을 도와주세요. 다양한 관점에서 아이디어를 제시해주세요.",
    tags: ["브레인스토밍", "아이디어", "창의성"],
    author: "태그지니",
  },
  "post-8": {
    title: "협찬 제안서 만들기",
    text: "브랜드와의 협업을 위한 전문적인 제안서를 작성해주세요. 나의 채널 특성과 타깃 오디언스를 강조해주세요.",
    tags: ["협찬", "제안서", "비즈니스"],
    author: "콘텐츠랩",
  },
  "mine-1": {
    title: "딸깍 확장 프로그램 소개문",
    text: "프롬프트 첨삭 Chrome Extension을 소개하는 짧은 랜딩 카피를 작성해주세요. 핵심 기능, 사용 이점, CTA를 포함해주세요.",
    tags: ["내프롬프트", "카피", "확장프로그램"],
    author: "나",
  },
  "mine-2": {
    title: "코딩 질문 개선",
    text: "막연한 코딩 질문을 재현 단계, 기대 결과, 실제 결과, 에러 로그, 환경 정보가 들어간 질문으로 바꿔주세요.",
    tags: ["내프롬프트", "코딩", "질문"],
    author: "나",
  },
};

const demoCommentTextOverrides = {
  "post-1": [
    {
      id: "comment-1",
      author: "태그지니",
      text: "해시태그까지 같이 요청하는 구조라서 바로 활용하기 좋네요.",
      likes: 4,
      replies: [{ id: "reply-1", author: "카피메이커", text: "맞아요. 바로 복사해서 쓰기 좋은 형태라 편합니다.", likes: 0, edited: true }],
    },
    { id: "comment-2", author: "콘텐츠랩", text: "브랜드 톤앤매너를 추가하면 결과가 더 정확해질 것 같아요.", likes: 2, edited: true },
  ],
  "post-2": [
    {
      id: "comment-3",
      author: "카피메이커",
      text: "문법, 흐름, 가독성을 나눠서 첨삭하는 방식이 마음에 듭니다.",
      likes: 1,
      replies: [{ id: "reply-2", author: "콘텐츠랩", text: "여기에 톤 조정까지 넣으면 더 좋을 것 같아요.", likes: 0 }],
    },
  ],
  "post-3": [
    { id: "comment-4", author: "콘텐츠랩", text: "검색 키워드와 독자 수준을 함께 넣으면 더 좋겠어요.", likes: 3 },
  ],
  "post-4": [
    { id: "comment-5", author: "태그지니", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞습니다." },
    { id: "comment-6", author: "카피메이커", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같아요." },
  ],
  "post-5": [
    { id: "comment-7", author: "콘텐츠랩", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나오네요." },
    { id: "comment-8", author: "태그지니", text: "타깃 독자까지 넣으면 클릭률을 더 고려할 수 있겠어요." },
  ],
  "post-6": [
    { id: "comment-9", author: "카피메이커", text: "훅, 본문, 마무리 CTA로 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "콘텐츠랩", text: "영상 길이와 업로드 채널을 추가하면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "태그지니", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "카피메이커", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "콘텐츠랩", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "태그지니", text: "목표와 핵심 메시지를 분리하면 더 설득력 있을 것 같아요." },
  ],
};

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
const DEMO_EXISTING_NICKNAMES = ["Google닉네임", "태그지니", "콘텐츠랩", "카피메이커", "박민준", "김지수", "이서연", "나"];
const DEMO_EXISTING_USER_IDS = ["google", "demo", "admin", "user", "ttalkak", "jaewon7025"];

const commentsByPrompt = {
  "post-1": [
    { id: "comment-1", author: "태그지니", text: "해시태그까지 같이 요청하는 구성이 실무에서 쓰기 좋네요." },
    { id: "comment-2", author: "콘텐츠랩", text: "브랜드 톤앤매너를 추가하면 더 정확한 결과가 나올 것 같아요." },
  ],
  "post-2": [
    { id: "comment-3", author: "카피메이커", text: "문법, 흐름, 가독성을 나눠서 첨삭하는 방식이 마음에 듭니다." },
  ],
  "post-3": [
    { id: "comment-4", author: "콘텐츠랩", text: "검색 키워드와 독자 페르소나도 함께 넣으면 더 좋겠어요." },
  ],
  "post-4": [
    { id: "comment-5", author: "태그지니", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞아요." },
    { id: "comment-6", author: "카피메이커", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같습니다." },
  ],
  "post-5": [
    { id: "comment-7", author: "콘텐츠랩", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나와요." },
    { id: "comment-8", author: "태그지니", text: "타깃 독자까지 넣으면 클릭률을 더 잘 겨냥할 수 있겠네요." },
  ],
  "post-6": [
    { id: "comment-9", author: "카피메이커", text: "인트로, 본문, 마무리 CTA를 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "콘텐츠랩", text: "영상 길이와 톤을 같이 적으면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "태그지니", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "카피메이커", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "콘텐츠랩", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "태그지니", text: "목차와 핵심 메시지를 분리해달라고 하면 더 정돈될 것 같아요." },
  ],
};

const demoCommentBackfill = {
  "post-4": [
    { id: "comment-5", author: "태그지니", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞아요." },
    { id: "comment-6", author: "카피메이커", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같습니다." },
  ],
  "post-5": [
    { id: "comment-7", author: "콘텐츠랩", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나와요." },
    { id: "comment-8", author: "태그지니", text: "타깃 독자까지 넣으면 클릭률을 더 잘 겨냥할 수 있겠네요." },
  ],
  "post-6": [
    { id: "comment-9", author: "카피메이커", text: "인트로, 본문, 마무리 CTA를 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "콘텐츠랩", text: "영상 길이와 톤을 같이 적으면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "태그지니", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "카피메이커", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "콘텐츠랩", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "태그지니", text: "목차와 핵심 메시지를 분리해달라고 하면 더 정돈될 것 같아요." },
  ],
};

const state = createInitialState({ homePageSize: HOME_PAGE_SIZE });


let pendingMessageScrollId = null;
let isMakeThinking = false;
const makeRequestState = makeStateModule.createMakeRequestState();
let activeMakeRequestController = null;
let makeInteractionVersion = 0;
let makeServerSyncEffects = null;
let appBootstrap = null;
const getBackendDataEffectContext = (...args) => appBootstrap.getBackendDataEffectContext(...args);
const getBackendHydrationEffectContext = (...args) => appBootstrap.getBackendHydrationEffectContext(...args);
const hydrateBackendMakeDataIfNeeded = (...args) => appBootstrap.hydrateBackendMakeDataIfNeeded(...args);
const refreshMyPageDataAfterMutation = (...args) => appBootstrap.refreshMyPageDataAfterMutation(...args);
const hydrateBackendMyPageDataIfNeeded = (...args) => appBootstrap.hydrateBackendMyPageDataIfNeeded(...args);
const getAdminHydrationEffectContext = (...args) => appBootstrap.getAdminHydrationEffectContext(...args);
const hydrateBackendAdminDataIfNeeded = (...args) => appBootstrap.hydrateBackendAdminDataIfNeeded(...args);
const hydrateBackendHomeData = (...args) => appBootstrap.hydrateBackendHomeData(...args);
const refreshBackendHomePrompts = (...args) => appBootstrap.refreshBackendHomePrompts(...args);

const homeController = createHomeController({
  state,
  root: document,
  document,
  debounceMs: SEARCH_DEBOUNCE_MS,
  validScope: getValidSearchScope,
  applySearchQuery: (value) => applyHomeSearchQueryState(state, value),
  applyScope: (value) => applyHomeSearchScopeState(state, value),
  applySort: (value) => applyHomeSortState(state, value),
  applyPage: (value) => applyHomePageState(state, value),
  refresh: refreshBackendHomePrompts,
  render,
});

const savedLibraryController = createSavedLibraryController({
  state,
  savedPrompts,
  popularPrompts,
  demoPromptIds: DEMO_LIBRARY_PROMPT_IDS,
  uniquePrompts: getUniquePrompts,
  canUseDemoFallback,
  getLikes: getPromptLikes,
  getCommentCount: (...args) => getPromptCommentCount(...args),
});
normalizeSavedPromptOwnership();

const discoveryController = createDiscoveryController({
  state,
  document,
  searchDebounceMs: SEARCH_DEBOUNCE_MS,
  cancelHomeSearch: () => homeController.cancelSearchCommit(),
  applyTag: applyHomeTagSearchState,
  applyAuthor: applyHomeAuthorSearchState,
  refresh: refreshBackendHomePrompts,
  render,
  restoreHomeFocus: () => homeController.restoreSearchFocus(),
});

const commentRepository = createCommentRepository({ state, commentsByPrompt, promptLists: [popularPrompts, savedPrompts] });
const promptEngagementController = createPromptEngagementController({
  state,
  savedPrompts,
  guard: guardAdminUserAction,
  notice: showNotice,
  render,
  findPrompt: findPromptById,
  findComment: commentRepository.findById,
  findPromptIdByComment: commentRepository.findPromptId,
  getCommentLikes: commentRepository.getLikes,
  canDeleteComment: commentRepository.canDelete,
  getPromptMutationContext: getPromptMutationStateContext,
  getCommentMutationContext: getCommentMutationStateContext,
  runMutation: runPromptStateMutation,
  isHiddenDemoPrompt: isHiddenDemoLibraryPrompt,
  isBackendId: isBackendNumericId,
  refreshMyPage: refreshMyPageDataAfterMutation,
  callApi: callBackendApi,
  hasBackendToken: hasBackendAuthToken,
  hydrateComments: (...args) => promptEngagementController.hydratePromptComments(...args),
  revisionKey: (...args) => makeRevisionRequestKey(...args),
  applyExistingSaved: applyExistingPromptSavedState,
  applyBackendUnsaved: applyBackendPromptUnsavedState,
  togglePendingUnsave: togglePendingUnsaveState,
  applyUnsaved: applyPromptUnsavedState,
  applyNewSaved: applyNewPromptSavedState,
  applyPromptLiked: applyPromptLikedState,
  applyPromptUnliked: applyPromptUnlikedState,
  toggleCommentLiked: toggleCommentLikedState,
  addPromptCommentState,
  addReplyState: addCommentReplyState,
  toggleReplyState: toggleReplyCommentState,
  toggleEditState: toggleEditCommentState,
  updateCommentState: updateOwnCommentState,
  commentsByPrompt,
  api: apiClient,
  getToken: getAuthToken,
  warn: (...args) => reportWarning("prompt-engagement", "controller-warning", toWarningError(...args)),
  incrementViews: incrementPromptViews,
  syncCommentCount: commentRepository.syncCount,
  findCommentInList: commentRepository.findInList,
  confirm: (...args) => modalController.openConfirm(...args),
  deleteCommentState,
  refreshAdmin: (options) => callAdminController("refreshAdminAfterMutation", options),
});
const hydratePromptComments = (...args) => promptEngagementController.hydratePromptComments(...args);
const syncPromptCommentCount = commentRepository.syncCount;
const findPromptIdByCommentId = commentRepository.findPromptId;
const getPromptComments = commentRepository.getPromptComments;
const getSortedPromptComments = commentRepository.getSortedPromptComments;
const findCommentContextById = (commentId) => {
  const context = commentRepository.findContext(commentId);
  return context ? { ...context, prompt: findPromptById(context.promptId) } : null;
};
const getSortedCommentReplies = commentRepository.getSortedReplies;
const findCommentById = commentRepository.findById;
const countCommentThread = commentRepository.countThread;
const getCommentLikes = commentRepository.getLikes;
const getPromptCommentCount = commentRepository.getPromptCommentCount;
const canDeleteComment = commentRepository.canDelete;
const commentView = createCommentView({
  state, canDeleteComment, canShowReportedState, escapeAttr, escapeHtml, formatNumber, formatShortDate,
  getCommentLikes, getSortedCommentReplies, getIcons: () => icons,
});
const { CommentItem, ReplyItem } = commentView;
const adminSelectors = createAdminSelectors({
  state, popularPrompts, savedPrompts, commentsByPrompt, getUniquePrompts, normalizeTag, normalizeSearchText,
  parseTimestamp, getDisplayPromptAuthor, getPromptAuthorId, getPromptComments, getSortedPromptComments,
  getPromptCommentCount, findPromptById, findCommentInList, normalizeAdminSearchText, getKnownTags,
  getAdminTagStatusOrder, getPromptCreatedAt, makePreview, findCommentById, findCommentContextById,
  resolveAdminTagStatus,
});
const {
  getAdminManagedTags, getAdminPromptsByTag, getTagStats, getAdminUserActivity, getReportRecord,
  mapBackendReportStatus, mapFrontendReportStatus, makeRevisionRequestKey, getPromptRevisionRequest,
  getRevisionRequestTarget, isRevisionTargetOwnedByCurrentUser, getAdminReportRecords, getReportStatusLabel,
  isFinalReportStatus, getAuthorRevisionStatusLabel, matchesAdminPromptQuery, matchesAdminPromptFilter,
  getAdminTagStatus,
} = adminSelectors;

let shareController = null;
let bindShareEvents = null;
let getShareTagSuggestionsModel = null;
let shareRuntimePromise = null;
async function ensureShareRuntime() {
  if (shareController && bindShareEvents && getShareTagSuggestionsModel) return true;
  shareRuntimePromise ||= loadShareRuntime().then((runtime) => {
    const { createShareController, getShareTagSuggestions } = runtime.controller || {};
    bindShareEvents = runtime.events?.bindShareEvents || null;
    if (typeof createShareController !== "function" || typeof getShareTagSuggestions !== "function" || typeof bindShareEvents !== "function") throw new Error("TTALKAK Share 모듈을 불러오지 못했습니다.");
    getShareTagSuggestionsModel = getShareTagSuggestions;
    shareController = createShareController({
      state, root: document, savedPrompts, popularPrompts, parseTags: parseSharedTags, normalizeTag, getKnownTags,
      escapeAttr, escapeHtml, render, guard: guardAdminUserAction, findPrompt: findPromptById, api: apiClient,
      hasToken: hasBackendAuthToken, getToken: getAuthToken, removePrompt: (...args) => promptWorkflows.removePromptById(...args),
      handleError: handleBackendAccessError, getMutationContext: getCommentMutationStateContext,
      applyShared: applySharedPromptState, notice: showNotice,
    });
    return true;
  }).catch((error) => {
    shareRuntimePromise = null;
    reportWarning("share", "load-runtime", error);
    showNotice("공유 기능을 불러오지 못했습니다. 다시 시도해주세요.");
    return false;
  });
  return shareRuntimePromise;
}
const modalController = createModalController({ state, root: document, closeState: closeTopModalState, render, renderPreservingScroll: renderPreservingMakeScroll });
const authSession = createAuthSession({ state, applyIdentity: applyAuthenticatedIdentityState, resetBackend: resetSessionBackendStateValue, clearState: clearAuthenticatedSessionState, normalizeLikes: normalizePersistedLikeCounts, writeToken: (token) => writeStorageItem(AUTH_TOKEN_KEY, token), removeToken: () => removeStorageItem(AUTH_TOKEN_KEY) });
const getCurrentAccountScopeKey = authSession.key;
const snapshotCurrentAccountScope = authSession.snapshot;
const saveCurrentAccountScope = authSession.saveScope;
const applyAccountScope = authSession.applyScope;
const restoreCurrentAccountScope = authSession.restoreScope;
const applyAuthenticatedUser = authSession.applyUser;
const clearAuthenticatedSession = authSession.clear;
const authController = createAuthController({ state, root: document, document, render, normalizeText: normalizeSearchText, existingNicknames: DEMO_EXISTING_NICKNAMES, existingUserIds: DEMO_EXISTING_USER_IDS, userIdError: getUserIdValidationMessage, emailValid: isValidEmail, phoneValid: isValidPhone, futureDate: isFutureDate, api: apiClient, normalizeResult: normalizeAuthResult, applyUser: applyAuthenticatedUser, clearSession: clearAuthenticatedSession, getToken: getAuthToken, demoToken: DEMO_AUTH_TOKEN, icons: { get eye() { return icons.eye; }, get eyeOff() { return icons.eyeOff; } }, notice: showNotice, warn: (...args) => reportWarning("authentication", "controller-warning", toWarningError(...args)), confirm: (...args) => modalController.openConfirm(...args), handleError: handleBackendAccessError, hydrateMake: hydrateBackendMakeDataIfNeeded });
const authView = createAuthView({ state, AuthModalView, escapeAttr, escapeHtml, getIcons: () => icons });
const { AuthModal } = authView;
let adminController = null;
let adminView = null;
let bindAdminEvents = null;
let adminRuntimePromise = null;

function callAdminController(method, ...args) {
  if (adminController?.[method]) return adminController[method](...args);
  return ensureAdminRuntime().then(() => adminController?.[method]?.(...args));
}

function callAdminView(method, fallback, ...args) {
  return adminView?.[method]?.(...args) ?? fallback;
}

async function ensureAdminRuntime() {
  if (adminController && adminView && bindAdminEvents) return true;
  adminRuntimePromise ||= loadAdminRuntime().then((runtime) => {
    const { createAdminController } = runtime.controller || {};
    const { createAdminView } = runtime.view || {};
    bindAdminEvents = runtime.events?.bindAdminEvents || null;
    if (typeof createAdminController !== "function" || typeof createAdminView !== "function" || typeof bindAdminEvents !== "function") {
      throw new Error("TTALKAK Admin 모듈을 불러오지 못했습니다.");
    }
    adminController = createAdminController({
      state, api: apiClient, canUseDemoFallback, getAuthToken, hasBackendAuthToken, handleBackendAccessError, render, showNotice,
      normalizeSearchText, getDisplayPromptAuthor, getPromptAuthorId, popularPrompts, savedPrompts, getUniquePrompts,
      applyAdminUserActivityRefreshState, applyAdminUserBlockActivityState, applyAdminTagDecisionState, applyAdminReportStatusState,
      applyAdminRevisionRequestState, applyAdminPromptHiddenState, canTransitionAdminTagStatus, getAdminTagStatus,
      resolveAdminTagStatus, normalizeTag, getReportRecord, mapFrontendReportStatus, mapBackendReportStatus, isFinalReportStatus,
      makeRevisionRequestKey, getRevisionRequestTarget, isRevisionTargetOwnedByCurrentUser,
      refreshAdminAfterMutationEffect, refreshAdminAuditLogsEffect, hydratePromptComments, isBackendNumericId,
      refreshBackendHomePrompts, getPromptMutationStateContext, normalizeAdminSearchText, getAdminUserActivity,
      hydrateBackendAdminDataIfNeeded, finishAdminRevisionRequestState, getBackendErrorCode, getSortedPromptComments,
      getAdminReportRecords, getAdminTagStatusLabel, getReportStatusLabel, getAuthorRevisionStatusLabel,
      commentsByPrompt, findCommentInList: commentRepository.findInList, findPromptById, getAdminHydrationEffectContext,
      reportWarning,
    });
    adminView = createAdminView({
      state, popularPrompts, savedPrompts, getUniquePrompts, getAdminReportRecords, getAdminManagedTags,
      matchesAdminPromptFilter, matchesAdminPromptQuery, canUseDemoFallback, formatNumber, getReportStatusLabel,
      escapeHtml, escapeAttr, getAdminTagStatusLabel, getTagStats, getAdminPromptsByTag, PromptCard,
      normalizeSearchText, getDisplayPromptAuthor, getPromptAuthorId, getSortedPromptComments,
      normalizeAdminSearchText, getAdminUserActivity, getAdminKnownMemberId: (...args) => adminController.getAdminKnownMemberId(...args),
      getIcons: () => icons, getRevisionRequestTarget, getAuthorRevisionStatusLabel,
      AdminRevisionRequestModalView, truncateText, AdminUserBlockDialog, formatShortDate,
      getAdminTagStatusClass, getPromptCommentCount, getPromptCreatedAt, getPromptLikes,
      getPromptRevisionRequest, getPromptSaveCount, getPromptViewCount, isFinalReportStatus, makePreview,
      renderAdminInlineAuthorControl, AdminPageView, AdminReportsPanelView, AdminPromptsPanelView,
      AdminTagsPanelView, AdminUsersPanelView, AdminAuditPanelView,
    });
    return true;
  }).catch((error) => {
    adminRuntimePromise = null;
    reportWarning("admin", "load-runtime", error);
    showNotice("관리자 기능을 불러오지 못했습니다. 다시 시도해주세요.");
    return false;
  });
  return adminRuntimePromise;
}

const getAdminTabs = (...args) => callAdminView("getAdminTabs", [], ...args);
const getAdminCanShowData = (...args) => callAdminView("getAdminCanShowData", false, ...args);
const getAdminReportFilters = (...args) => callAdminView("getAdminReportFilters", [], ...args);
const getAdminPromptFilters = (...args) => callAdminView("getAdminPromptFilters", [], ...args);
const getAdminTagFilters = (...args) => callAdminView("getAdminTagFilters", [], ...args);
const getActiveAdminPanel = (...args) => callAdminView("getActiveAdminPanel", "", ...args);
const AdminRevisionRequestModal = (...args) => callAdminView("AdminRevisionRequestModal", "", ...args);
const AdminUserBlockModal = (...args) => callAdminView("AdminUserBlockModal", "", ...args);
const getAdminPanelRendererContext = (...args) => callAdminView("getAdminPanelRendererContext", {}, ...args);
const AdminPage = (...args) => callAdminView("AdminPage", '<section class="route-module-status" role="status">관리자 기능을 불러오는 중입니다.</section>', ...args);
const AdminTagPromptUsagePanel = (...args) => callAdminView("AdminTagPromptUsagePanel", "", ...args);
const getAdminAuditActionLabel = (...args) => callAdminView("getAdminAuditActionLabel", "", ...args);
const getAdminAuditTargetLabel = (...args) => callAdminView("getAdminAuditTargetLabel", "", ...args);
const getAdminModeNotice = (...args) => callAdminView("getAdminModeNotice", "", ...args);
const AdminUserActivitySummary = (...args) => callAdminView("AdminUserActivitySummary", "", ...args);
const modalView = createModalView({
  state, findPromptById, PromptDetailModalView, PromptEditModalView, ReportModalView, ConfirmDialog,
  ExecuteModalView, getDisplayPromptAuthor, getPromptCommentCount, getPromptLikes, getPromptSaveCount,
  getPromptViewCount, getSortedPromptComments, CommentItem, escapeAttr, escapeHtml, formatNumber,
  formatShortDate, getPromptRevisionRequest, getIcons: () => icons, makePreview,
  renderAdminInlineAuthorControl, renderAuthorSearchControl, isPromptSaved, isPromptPendingUnsave,
  canShowReportedState, getPromptCreatedAt, findCommentById, getFinalPromptText,
});
const { PromptDetailModal, PromptEditModal, ReportModal, ConfirmModal, ExecuteModal } = modalView;
const searchAdminUserCandidates = (...args) => callAdminController("searchAdminUserCandidates", ...args);
const openAdminUserActivity = (...args) => callAdminController("openAdminUserActivity", ...args);
const getAdminKnownMemberId = (...args) => adminController?.getAdminKnownMemberId(...args) || null;
const updateAdminUserBlockState = (...args) => callAdminController("updateAdminUserBlockState", ...args);
const updateAdminTagDecision = (...args) => callAdminController("updateAdminTagDecision", ...args);
const updateReportRecordStatus = (...args) => callAdminController("updateReportRecordStatus", ...args);
const requestPromptRevision = (...args) => callAdminController("requestPromptRevision", ...args);
const updateAuthorRevisionRequest = (...args) => callAdminController("updateAuthorRevisionRequest", ...args);
const updateAdminCommentHiddenState = (...args) => callAdminController("updateAdminCommentHiddenState", ...args);
const toggleAdminPromptHidden = (...args) => callAdminController("toggleAdminPromptHidden", ...args);
const refreshAdminAuditLogs = (...args) => callAdminController("refreshAdminAuditLogs", ...args);
const openAuth = authController.open;
const closeTopModal = modalController.closeTop;
const focusActiveModal = modalController.focusActive;
const openConfirmAction = modalController.openConfirm;
let makeWorkflows = null;
let makeRuntimePromise = null;
async function ensureMakeRuntime() {
  if (makeWorkflows && makeControllerModule && makeEventsModule) return true;
  makeRuntimePromise ||= loadMakeRuntime().then((runtime) => {
    const { createMakeWorkflows } = runtime.workflows || {};
    makeControllerModule = runtime.controller || null;
    makeEventsModule = runtime.events || null;
    if (typeof createMakeWorkflows !== "function" || !makeControllerModule || !makeEventsModule) throw new Error("TTALKAK Make 모듈을 불러오지 못했습니다.");
    makeWorkflows = createMakeWorkflows({
      state, savedPrompts, popularPrompts, promptTemplates, document, window, render, renderPreservingMakeScroll,
      showNotice, openConfirmAction, guardAdminUserAction, findPromptById, getFinalPromptText, makePreview,
      copyTextToClipboard, makePromptTitle, normalizeSearchText, persistState, getMakeApi, getMakeApiToken,
      handleMakeBackendSyncError, getMakeThreadById, getMakeBackendThreadId, isBackendNumericId,
      normalizeMakeFolders, normalizeRecentThreads, hydrateBackendMakeDataIfNeeded, getMakeServerSyncEffects,
      getMakeServerSyncContext, getMakeControllerContext, submitMakePrompt, openAuth, deleteMakeThreadState,
      createLocalMakeFolderState, removeLocalMakeFolderState, restoreMakeThreadFolderState,
      MAX_CUSTOM_MAKE_FOLDERS, canUseDemoFallback, deleteMakeFolderState, getMakeMutationStateContext,
      toggleSavedMakeMessageState, updateRecentMakeThreadState, openRecentMakeThreadState,
      openSavedMakePromptState, startNewMakeChatState, autosizeTextarea, hasBackendAuthToken,
      handleBackendAccessError, reportWarning,
    });
    return true;
  }).catch((error) => {
    makeRuntimePromise = null;
    reportWarning("make", "load-runtime", error);
    showNotice("Make 기능을 불러오지 못했습니다. 다시 시도해주세요.");
    return false;
  });
  return makeRuntimePromise;
}

function callMakeWorkflow(method, fallback, ...args) {
  if (makeWorkflows?.[method]) return makeWorkflows[method](...args);
  ensureMakeRuntime().then((loaded) => { if (loaded) makeWorkflows?.[method]?.(...args); });
  return fallback;
}

const performDeleteThread = (...args) => callMakeWorkflow("performDeleteThread", undefined, ...args);
const guardMakeFolderMutation = (...args) => callMakeWorkflow("guardMakeFolderMutation", true, ...args);
const normalizeMakeFolderName = (...args) => callMakeWorkflow("normalizeMakeFolderName", String(args[0] || "").trim(), ...args);
const hasMakeFolderName = (...args) => callMakeWorkflow("hasMakeFolderName", false, ...args);
const createLocalMakeFolder = (...args) => callMakeWorkflow("createLocalMakeFolder", null, ...args);
const removeLocalMakeFolder = (...args) => callMakeWorkflow("removeLocalMakeFolder", undefined, ...args);
const restoreThreadFolder = (...args) => callMakeWorkflow("restoreThreadFolder", undefined, ...args);
const createMakeFolder = (...args) => callMakeWorkflow("createMakeFolder", undefined, ...args);
const createMakeFolderAndMoveThread = (...args) => callMakeWorkflow("createMakeFolderAndMoveThread", undefined, ...args);
const getCustomMakeFolderCount = (...args) => callMakeWorkflow("getCustomMakeFolderCount", 0, ...args);
const renameMakeFolder = (...args) => callMakeWorkflow("renameMakeFolder", undefined, ...args);
const performDeleteFolder = (...args) => callMakeWorkflow("performDeleteFolder", undefined, ...args);
const moveThreadToFolder = (...args) => callMakeWorkflow("moveThreadToFolder", undefined, ...args);
const moveThreadToFolderOnBackend = (...args) => callMakeWorkflow("moveThreadToFolderOnBackend", false, ...args);
const countThreadsInFolder = (...args) => callMakeWorkflow("countThreadsInFolder", 0, ...args);
const getThreadFolderId = (...args) => callMakeWorkflow("getThreadFolderId", "uncategorized", ...args);
const getActiveFolderName = (...args) => callMakeWorkflow("getActiveFolderName", "최근 대화", ...args);
const copyMakeMessage = (...args) => callMakeWorkflow("copyMakeMessage", undefined, ...args);
const saveMakeMessage = (...args) => callMakeWorkflow("saveMakeMessage", undefined, ...args);
const resendEditedMessage = (...args) => callMakeWorkflow("resendEditedMessage", undefined, ...args);
const openShareFromMakeMessage = (...args) => callMakeWorkflow("openShareFromMakeMessage", undefined, ...args);
const openExecuteModal = (...args) => callMakeWorkflow("openExecuteModal", undefined, ...args);
const openPromptExecuteModal = (...args) => callMakeWorkflow("openPromptExecuteModal", undefined, ...args);
const confirmPlaceholderExecution = (...args) => callMakeWorkflow("confirmPlaceholderExecution", false, ...args);
const hasPromptPlaceholders = (...args) => callMakeWorkflow("hasPromptPlaceholders", false, ...args);
const executeMakeMessage = (...args) => callMakeWorkflow("executeMakeMessage", undefined, ...args);
const getExecuteTarget = (...args) => callMakeWorkflow("getExecuteTarget", null, ...args);
const updateRecentThread = (...args) => callMakeWorkflow("updateRecentThread", undefined, ...args);
const openRecentThread = (...args) => callMakeWorkflow("openRecentThread", undefined, ...args);
const openSavedMakePrompt = (...args) => callMakeWorkflow("openSavedMakePrompt", undefined, ...args);
const startNewChat = (...args) => callMakeWorkflow("startNewChat", undefined, ...args);
const getRecentThreadKeyFromThread = (...args) => callMakeWorkflow("getRecentThreadKeyFromThread", "", ...args);
const getRecentThreadKey = (...args) => callMakeWorkflow("getRecentThreadKey", "", ...args);
const applyTemplate = (...args) => callMakeWorkflow("applyTemplate", undefined, ...args);
const toggleTemplateBar = (...args) => callMakeWorkflow("toggleTemplateBar", undefined, ...args);
const createBackendMakeFolder = (...args) => callMakeWorkflow("createBackendMakeFolder", "", ...args);
const updateBackendMakeFolderName = (...args) => callMakeWorkflow("updateBackendMakeFolderName", false, ...args);
const deleteBackendMakeFolder = (...args) => callMakeWorkflow("deleteBackendMakeFolder", false, ...args);
const createBackendMakeThread = (...args) => callMakeWorkflow("createBackendMakeThread", "", ...args);
const ensureBackendMakeThreadId = (...args) => callMakeWorkflow("ensureBackendMakeThreadId", "", ...args);
const getBackendFolderId = (...args) => callMakeWorkflow("getBackendFolderId", null, ...args);
const syncMakeThreadWithBackend = (...args) => callMakeWorkflow("syncMakeThreadWithBackend", undefined, ...args);
const refreshMakeThreadsFromBackend = (...args) => callMakeWorkflow("refreshMakeThreadsFromBackend", false, ...args);
const refreshActiveMakeThreadFromBackend = (...args) => callMakeWorkflow("refreshActiveMakeThreadFromBackend", false, ...args);
const promptWorkflows = createPromptWorkflows({
  state, savedPrompts, popularPrompts, commentsByPrompt, render, showNotice, openAuth, openConfirmAction,
  findPromptById, findCommentById, findCommentContextById, guardAdminUserAction, isBackendNumericId,
  hasBackendAuthToken, callBackendApi, handleBackendAccessError, getAuthToken, getPromptMutationStateContext,
  getCommentMutationStateContext, applyPromptReportedState, applyCommentReportedState, applyEditedPromptState,
  makeRevisionRequestKey: (...args) => makeRevisionRequestKey(...args), removePromptByIdState,
  refreshBackendHomePrompts, refreshMyPageDataAfterMutation, hydrateBackendAdminDataIfNeeded, normalizeTag,
  parseSharedTags, stampCurrentUserOwnedPrompts, isDemoAuthToken, applyPublishedSavedPromptState,
  applyDeletedPromptState, applyUnsharedPromptState, SAVED_PAGE_SIZE,
});
const {
  openReportPrompt, openReportComment, submitReport, reportPrompt, reportComment, deleteOwnPrompt,
  unshareOwnPrompt, publishSavedPrompt, updateOwnPrompt, performDeletePrompt, performUnsharePrompt,
  removePromptById,
} = promptWorkflows;
const confirmActionHandlers = {
  "delete-prompt": (action) => performDeletePrompt(action.targetId),
  "unshare-prompt": (action) => performUnsharePrompt(action.targetId),
  "delete-comment": (action) => promptEngagementController.performDeleteComment(action.targetId),
  "delete-thread": (action) => performDeleteThread(action.targetId),
  "delete-folder": (action) => performDeleteFolder(action.targetId),
  "admin-tag-status": (action) => updateAdminTagDecision(action.targetId, action.value),
  logout: () => {
    stampCurrentUserOwnedPrompts();
    const wasAdminMode = state.adminMode;
    clearAuthenticatedSession();
    showNotice(wasAdminMode ? "로그아웃하여 관리자 화면을 종료했습니다." : "로그아웃했습니다.");
  },
  withdraw: authController.withdraw,
  "reset-demo": () => { resetDemoState(); return false; },
};

const icons = {
  home: `<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  make: `<svg viewBox="0 0 24 24"><circle class="nav-fill" cx="12" cy="12" r="8"/><path class="plus-mark" d="M12 8v8M8 12h8"/></svg>`,
  save: `<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-3.8L6 21z"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.5 14.5A6 6 0 1 1 15.5 14c-.9.7-1.5 1.8-1.5 3h-4c0-1.1-.6-2-1.5-2.5z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="m3 3 18 18"/><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"/><path d="M9.9 4.3A9.8 9.8 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-2.3 3.4"/><path d="M6.1 6.1C3.5 7.9 2 12 2 12s3.5 8 10 8a9.6 9.6 0 0 0 5.9-2.1"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 1 1 21 12z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  flag: `<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-1 5 1 5H5"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></svg>`,
  siren: `<svg viewBox="0 0 24 24"><path d="M7 15v-4a5 5 0 0 1 10 0v4"/><path d="M5 15h14l1 5H4z"/><path d="M12 2v3M4.5 5.5l2 2M19.5 5.5l-2 2"/></svg>`,
  hash: `<svg viewBox="0 0 24 24"><path d="M8 3 6 21M18 3l-2 18M4 9h17M3 15h17"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-3.8L6 21z"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
};

function render() {
  return renderAppShell({
    state,
    escapeHtml,
    persistState,
    Sidebar,
    Header,
    Page,
    PromptDetailModal,
    PromptEditModal,
    AdminRevisionRequestModal,
    AuthModal,
    ReportModal,
    ExecuteModal,
    ConfirmModal,
    AdminUserBlockModal,
    bindEvents,
    focusActiveModal,
    restorePendingMessageScroll,
    scrollToPendingLatestMessage,
    scrollToHighlightedComment,
    hydrateBackendMakeDataIfNeeded,
    hydrateBackendMyPageDataIfNeeded,
    hydrateBackendAdminDataIfNeeded,
  });
}

document.addEventListener("ttalkak:route-renderers-changed", (event) => {
  if (!(event instanceof CustomEvent)) return;
  if (event.detail?.route === state.route || (event.detail?.route === "admin" && state.adminMode)) render();
});

function renderPreservingMakeScroll() {
  renderWithPreservedMakeScroll(render);
}

function scrollToHighlightedComment() {
  if (!state.detailHighlightCommentId) return;
  window.setTimeout(() => {
    document.querySelector(`[data-comment-id="${CSS.escape(state.detailHighlightCommentId)}"]`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, 40);
}

function restorePendingMessageScroll() {
  if (!pendingMessageScrollId) return;
  const messageId = pendingMessageScrollId;
  pendingMessageScrollId = null;
  requestAnimationFrame(() => {
    const safeId = String(messageId).replace(/"/g, '\\"');
    const target = document.querySelector(`[data-message-id="${safeId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const textarea = target.querySelector("textarea");
    if (textarea) {
      textarea.focus({ preventScroll: true });
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }
  });
}

function scrollToPendingLatestMessage() {
  scrollToPendingLatestMakeMessage(state, {
    behavior: "smooth",
    hasPendingMessageScroll: () => Boolean(pendingMessageScrollId),
  });
}

function scheduleMakeLatestScroll({ behavior = "smooth" } = {}) {
  scheduleMakeLatestScrollEffect(state, { behavior });
}

function waitForThinkingIndicatorPaint() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 120);
  });
}

function navigateTo(route) {
  if (route === "admin" && !adminController) {
    ensureAdminRuntime().then((loaded) => { if (loaded && state.route === "admin") render(); });
  }
  if (route === "share" && !shareController) {
    ensureShareRuntime().then((loaded) => { if (loaded && state.route === "share") render(); });
  }
  if (route === "make" && !makeWorkflows) {
    ensureMakeRuntime().then((loaded) => { if (loaded && state.route === "make") render(); });
  }
  if (state.route === "make" && route !== "make" && activeMakeRequestController) {
    activeMakeRequestController.abort();
  }
  if (state.adminMode && route !== "admin") {
    state.route = "admin";
    render();
    return;
  }

  if (isAdminAccount() && !["home", "admin"].includes(route)) {
    state.route = "home";
    showNotice("관리자 계정은 Admin 운영 기능과 Home 검토 화면만 사용할 수 있습니다.");
    render();
    return;
  }

  if (isAdminAccount() && route === "admin") {
    state.adminMode = true;
  }

  if (route === "home" && state.route === "home") {
    resetHomeView();
    render();
    return;
  }

  if (state.route === route) return;

  const content = document.querySelector(".content-area");
  if (!content) {
    commitPendingUnsaves(route);
    state.route = route;
    if (route === "home") resetHomeView();
    render();
    return;
  }

  content.classList.add("is-leaving");
  window.setTimeout(() => {
    commitPendingUnsaves(route);
    state.route = route;
    if (route === "home") resetHomeView();
    render();
  }, 90);
}

function resetHomeView() {
  homeController.cancelSearchCommit();
  resetHomeViewState(state);
  if (state.backendStatus === "connected") refreshBackendHomePrompts();
}

function Sidebar() {
  return SidebarView(
    { icons, state, escapeAttr, escapeHtml, formatNumber },
    {
      adminTabs: state.adminMode ? getAdminTabs() : [],
      isAdminAccount: isAdminAccount(),
    },
  );
}







function Header() {
  const remaining = Math.max(0, FREE_MAKE_LIMIT - state.guestImproveCount);
  const canUseReportTools = (state.isLoggedIn && !isAdminAccount()) || state.adminMode;
  const hasReportedPrompts = canUseReportTools && state.reportedPromptIds.size > 0;
  const showPromptTools = canUseReportTools && (state.route === "home" || state.route === "saved");
  const adminAccessButton = isAdminAccount()
    ? `<button class="topbar-tool ${state.adminMode ? "active" : ""}" type="button" data-toggle-admin-view title="${state.adminMode ? "일반 화면을 읽기 전용으로 확인합니다." : "관리자 운영 화면으로 이동합니다."}" aria-label="관리자 화면 전환">${state.adminMode ? "사용자 화면 보기" : "관리자 화면"}</button>`
    : "";

  return HeaderView(
    { icons, state, escapeHtml, BackendStatusBadge },
    {
      adminAccessButton,
      authButton: `<button class="login-button" type="button" data-open-auth="login">로그인</button>`,
      freeMakeLimit: FREE_MAKE_LIMIT,
      hasReportedPrompts,
      remaining,
      showPromptTools,
    },
  );
}

function Page() {
  return resolvePageView(getPageRouteContext());
}

function getPageRouteContext() {
  return {
    state,
    isAdminAccount,
    AdminPage,
    HomePage,
    MakePage,
    SavedPage,
    SharePage,
  };
}

function HomePage() {
  const isBackendHome = state.backendStatus === "connected";
  const canShowDemoHome = !isBackendHome && canUseDemoFallback();
  const prompts = applyReportedVisibility(isBackendHome ? popularPrompts : canShowDemoHome ? getVisiblePopularPrompts() : []);
  const popularTags = getPopularTags(applyReportedVisibility(sortPopularPrompts(uniquePrompts(popularPrompts))));
  const displayTags = isBackendHome ? state.backendPopularTags : canShowDemoHome ? popularTags.length ? popularTags : fallbackPopularTags : [];
  const searchCriteria = parsePromptSearchQuery(state.searchQuery, state.searchScope);
  const totalPages = isBackendHome ? getBackendHomeTotalPages() : getPopularTotalPages(prompts.length);
  const currentPage = Math.min(state.popularPage, totalPages);
  const pagePrompts = isBackendHome ? prompts : prompts.slice((currentPage - 1) * HOME_PAGE_SIZE, currentPage * HOME_PAGE_SIZE);
  const isSearching = state.searchQuery.trim().length > 0;
  const searchPlaceholder = getSearchPlaceholder(state.searchScope);

  return HomePageView(
    {
      icons,
      state,
      escapeAttr,
      escapeHtml,
      normalizeTag,
      SearchScopeOption,
      SortOption,
      PromptCard,
      Pagination,
    },
    {
      displayTags,
      searchCriteria,
      totalPages,
      currentPage,
      pagePrompts,
      isSearching,
      searchPlaceholder,
      canShowDemoFallback: canShowDemoHome,
    },
  );
}

function SortOption(value, label) {
  return `<option value="${escapeAttr(value)}" ${state.popularSort === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function SearchScopeOption(value, label) {
  return `<option value="${escapeAttr(value)}" ${state.searchScope === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function getSearchPlaceholder(scope) {
  if (scope === "tag") return "해시태그를 입력하세요...";
  if (scope === "keyword") return "프롬프트 제목이나 내용을 검색하세요...";
  if (scope === "author") return "작성자 닉네임을 입력하세요...";
  return "프롬프트를 검색하세요...";
}

function Pagination(totalPages, currentPage) {
  return BasePagination({ totalPages, currentPage, pageAttribute: "data-page", ariaLabel: "인기 프롬프트 페이지" });
}

function normalizeSavedPromptOwnership() {
  savedLibraryController.normalizeOwnership();
}

function isPromptSaved(promptId) {
  return savedLibraryController.isSaved(promptId);
}

function isHiddenDemoLibraryPrompt(prompt) {
  return savedLibraryController.isHiddenDemoLibraryPrompt(prompt);
}

function getPromptSaveCount(prompt) {
  return savedLibraryController.getSaveCount(prompt);
}

function normalizeSavedCounts() {
  savedLibraryController.normalizeSavedCounts();
}

function isPromptPendingUnsave(promptId) {
  return state.pendingUnsaveIds.has(promptId);
}

function commitPendingUnsaves(nextRoute = state.route, nextMyPageTab = state.myPageTab) {
  const promptIds = applyPendingUnsavesState(getPromptMutationStateContext(), {
    nextRoute,
    nextMyPageTab,
    pageSize: SAVED_PAGE_SIZE,
  });
  promptIds.forEach((promptId) => {
    if (isBackendNumericId(promptId)) callBackendApi("unsavePrompt", promptId).then(refreshMyPageDataAfterMutation);
  });
}

function PromptCard(prompt, options = {}) {
  return PromptCardView(
    {
      state,
      icons,
      escapeAttr,
      escapeHtml,
      formatNumber,
      canShowReportedState,
      isPromptSaved,
      isPromptPendingUnsave,
      getPromptRevisionRequest,
      getPromptCommentCount,
      getPromptCardPreviewTags,
      getPromptLikes,
      getPromptSaveCount,
      getPromptViewCount,
      renderAuthorSearchControl,
    },
    prompt,
    options,
  );
}

function BackendStatusBadge() {
  const status = state.backendStatus || "checking";
  const message = state.backendStatusMessage || "백엔드 연결 확인 중";
  const label = status === "connected" ? "Backend 연결됨" : status === "fallback" ? canUseDemoFallback() ? "데모 데이터 표시 중" : "Backend 오류" : "Backend 확인 중";
  return `
    <div class="backend-status backend-status-${status}" title="${escapeHtml(message)}" aria-label="${escapeHtml(message)}">
      <span class="backend-status-dot" aria-hidden="true"></span>
      <span>${label}</span>
    </div>
  `;
}

function canUseDemoFallback() {
  return DEMO_FALLBACK_ENABLED;
}

function getApiFailureMessage(areaLabel = "API") {
  return `${areaLabel} 호출에 실패했습니다. 통합 테스트/시연 모드에서는 데모 데이터를 표시하지 않습니다.`;
}

function getPromptCardPreviewTags(tags) {
  const normalizedTags = Array.isArray(tags) ? tags : [];
  return {
    visibleTags: normalizedTags.slice(0, 3),
    hiddenCount: Math.max(0, normalizedTags.length - 3),
  };
}










function MakePage() {
  if (!makeWorkflows) {
    return '<section class="route-module-status" role="status" aria-live="polite" data-route-runtime-loading="make">Make 기능을 불러오는 중입니다.</section>';
  }
  const hasMessages = state.messages.length > 0;

  return MakePageView(
    { icons, escapeAttr, escapeHtml },
    {
      composerHtml: MakeComposer(hasMessages),
      feedHtml: MakeFeed(hasMessages),
      sidePanelHtml: MakeSidePanel(),
    },
  );
}

function MakeFeed(hasMessages) {
  return MakeFeedView(
    { icons },
    {
      hasMessages,
      isThinking: isMakeThinking,
      messages: state.messages,
      renderMessageBubble: MessageBubble,
      templateBarHtml: MakeTemplateBar(),
    },
  );
}

function MakeTemplateBar() {
  return MakeTemplateBarView(
    { escapeAttr, escapeHtml },
    {
      promptTemplates,
      templateCollapsed: state.templateCollapsed,
    },
  );
}

function MakeComposer(hasMessages) {
  return MakeComposerView(
    { icons, escapeHtml },
    {
      composerDraft: state.composerDraft,
      hasMessages,
      isThinking: isMakeThinking || makeRequestState.inFlight,
    },
  );
}

function MakeSidePanel() {
  const uncategorizedCount = countThreadsInFolder("uncategorized");
  const visibleFolders = state.makeFolders.filter((folder) => folder.id !== "uncategorized" || uncategorizedCount > 0);
  const customFolderCount = getCustomMakeFolderCount();
  const canManageFolders = state.isLoggedIn;
  const canCreateFolder = canManageFolders && customFolderCount < MAX_CUSTOM_MAKE_FOLDERS;
  if (state.activeFolderId === "uncategorized" && uncategorizedCount === 0) {
    state.activeFolderId = "all";
  }
  const visibleThreads =
    state.activeFolderId === "all"
      ? state.recentThreads
      : state.recentThreads.filter((thread) => (thread.folderId || "uncategorized") === state.activeFolderId);
  const previewThreads = visibleThreads.map((thread) => ({
    ...thread,
    preview: makePreview(thread.preview || thread.messages?.at(-1)?.content || ""),
  }));

  return MakeSidePanelView(
    { icons, escapeAttr, escapeHtml, formatShortDate },
    {
      activeFolderName: getActiveFolderName(),
      activeThreadId: state.activeThreadId,
      canCreateFolder,
      canManageFolders,
      canStartThreadFolderCreate: canManageFolders && customFolderCount < MAX_CUSTOM_MAKE_FOLDERS,
      creatingFolder: state.creatingFolder,
      creatingThreadFolderId: state.creatingThreadFolderId,
      customFolderCount,
      folders: state.makeFolders,
      getThreadFolderId,
      makeBackendMessage: sanitizeMakeBackendMessage(state.makeBackendMessage),
      maxCustomFolders: MAX_CUSTOM_MAKE_FOLDERS,
      openThreadMenuId: state.openThreadMenuId,
      renderFolderButton: MakeFolderButton,
      threadCount: state.recentThreads.length,
      visibleFolders: visibleFolders.map((folder) => ({ ...folder, threadCount: countThreadsInFolder(folder.id) })),
      visibleThreads: previewThreads,
    },
  );
}

function MakeFolderButton(folderId, name, count) {
  const isUserFolder = folderId !== "all" && folderId !== "uncategorized";
  const canManage = state.isLoggedIn && isUserFolder;
  const isEditing = canManage && state.editingFolderId === folderId;
  const isMenuOpen = canManage && state.openFolderMenuId === folderId;

  return MakeFolderButtonView(
    { icons, escapeAttr, escapeHtml, formatNumber },
    {
      canManage,
      count,
      folderId,
      isActive: state.activeFolderId === folderId,
      isEditing,
      isMenuOpen,
      isUserFolder,
      name,
    },
  );
}

function MessageBubble(message) {
  const isAssistant = message.role === "assistant";

  return MessageBubbleView(
    { icons, escapeAttr, escapeHtml },
    {
      content: message.content,
      answer: message.answer || "",
      changes: message.changes || [],
      fields: message.fields || [],
      hasExecutablePrompt: isAssistant && isExecutableMakeMessage(message),
      id: message.id,
      improvedPrompt: message.improvedPrompt || message.executablePrompt || "",
      isCopied: state.copiedMessageId === message.id,
      isEditing: !isAssistant && state.editingMessageId === message.id,
      failureMessage: !isAssistant && makeRequestState.failedMessageId === message.id ? makeRequestState.failure?.message || "" : "",
      failureRetryable: !isAssistant && makeRequestState.failedMessageId === message.id && Boolean(makeRequestState.failure?.retryable),
      isSaved: isAssistant && isPromptSaved(message.id),
      isThinking: isMakeThinking || makeRequestState.inFlight,
      mode: message.mode || "improve",
      questions: message.questions || [],
      ragStatus: message.ragStatus || "",
      role: message.role,
      summary: message.summary || "",
      techniques: message.techniques || [],
    },
  );
}

function isExecutableMakeMessage(message) {
  return makeMessageModel.isExecutableMessage(message);
}

function isAskOnlyMakeResponse(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  return [
    /확인이\s*필요/i,
    /답변이\s*필요/i,
    /추가\s*정보가\s*필요/i,
    /정보를\s*보완해\s*주세요/i,
    /개선안(?:을)?\s*만들\s*수\s*없/i,
    /만들\s*수\s*없어요/i,
    /아래\s*정보를\s*알려주시면/i,
    /어떤\s*주제/i,
    /무엇에\s*대한\s*글/i,
  ].some((pattern) => pattern.test(value));
}

function SavedPage() {
  const tabs = [
    { id: "library", label: "내 보관함", count: getSavedPagePrompts().length },
    { id: "mine", label: "내가 만든 프롬프트", count: getMyPrompts().length },
    { id: "comments", label: "댓글 관리", count: getMyComments().length },
    { id: "reports", label: "신고 내역", count: getMyReports().length },
  ];

  return SavedPageView(
    { icons, state, formatNumber, DemoLibraryPrompt, MyPagePanel },
    { tabs },
  );
}

function DemoLibraryPrompt() {
  if (state.myBackendStatus === "connected") {
    return `
      <div class="demo-library-prompt">
        <div>
          <strong>현재: 서버 응답 우선 + 최근 활동 즉시 반영</strong>
          <p>백엔드 API 응답을 우선 반영하고, 방금 저장·댓글·신고한 활동은 즉시 함께 표시합니다.</p>
        </div>
      </div>
    `;
  }

  if (state.myBackendStatus === "fallback" && !canUseDemoFallback()) {
    return `
      <div class="demo-library-prompt">
        <div>
          <strong>현재: 서버 응답 실패</strong>
          <p>My page API 호출에 실패했습니다. 통합 테스트/시연 모드에서는 데모 보관함을 표시하지 않습니다.</p>
        </div>
      </div>
    `;
  }

  const isSeeded = state.libraryDemoSeeded;
  return `
    <div class="demo-library-prompt">
      <div>
        <strong>현재: ${isSeeded ? "데모 데이터 표시 중" : "실서비스 초기 상태"}</strong>
        <p>${isSeeded ? "기능 검수용 예시 보관함을 표시하고 있습니다. 실제 신규 계정 상태를 확인하려면 데모 데이터를 숨겨주세요." : "실서비스 기준으로 새 계정의 보관함은 비어 있습니다. 기능 검수용 예시가 필요하면 데모 데이터를 채워 확인할 수 있습니다."}</p>
      </div>
      ${canUseDemoFallback() ? `<button class="secondary-button" type="button" data-toggle-library-demo>${isSeeded ? "데모 데이터 숨기기" : "데모 데이터 채우기"}</button>` : ""}
    </div>
  `;
}

function MyPagePanel() {
  if (state.myPageTab === "mine") return MyPromptsPanel();
  if (state.myPageTab === "comments") return MyCommentsPanel();
  if (state.myPageTab === "reports") return MyReportsPanel();
  return SavedLibraryPanel();
}

function SavedLibraryPanel() {
  const savedPagePrompts = getSavedPagePrompts();
  const filtered = applyReportedVisibility(savedPagePrompts)
    .filter((prompt) => matchesSavedFilter(prompt))
    .sort(getSavedSorter());
  const pendingUnsaveCount = filtered.filter((prompt) => state.pendingUnsaveIds.has(prompt.id)).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / SAVED_PAGE_SIZE));
  if (state.savedPage > totalPages) state.savedPage = totalPages;
  const currentPage = state.savedPage;
  const pagePrompts = filtered.slice((currentPage - 1) * SAVED_PAGE_SIZE, currentPage * SAVED_PAGE_SIZE);

  return SavedLibraryPanelView(
    { icons, state, PromptCard, SavedPagination, SavedEmptyMessage },
    { filtered, pagePrompts, pendingUnsaveCount, totalPages, currentPage },
  );
}

function SavedPagination(totalPages, currentPage) {
  return BasePagination({ totalPages, currentPage, pageAttribute: "data-saved-page", ariaLabel: "저장한 프롬프트 페이지" });
}

function MyPromptsPanel() {
  const prompts = getMyPrompts().sort(getSavedSorter());

  return MyPromptsPanelView(
    { icons, PromptCard },
    { prompts },
  );
}

function MyCommentsPanel() {
  const comments = getMyComments().map((item) => ({
    item,
    isEditing: state.editingCommentId === item.comment.id,
    revisionRequest: state.adminPromptRevisionRequests[makeRevisionRequestKey("comment", item.comment.id)],
  }));

  return MyCommentsPanelView(
    { icons, escapeAttr, escapeHtml },
    { comments },
  );
}

function MyReportsPanel() {
  const reports = getMyReports();

  return MyReportsPanelView(
    { icons, escapeAttr, escapeHtml, formatShortDate, getReportStatusLabel },
    { reports },
  );
}








function SavedEmptyMessage() {
  if (state.savedFilter.liked) return "좋아요를 누른 프롬프트가 아직 없습니다.";
  if (!state.savedFilter.community && !state.savedFilter.mine) return "표시할 필터를 선택해주세요.";
  return "저장한 프롬프트나 내 프롬프트가 아직 없습니다.";
}

function SharePage() {
  if (!shareController) {
    return '<section class="route-module-status" role="status" aria-live="polite" data-route-runtime-loading="share">Share 기능을 불러오는 중입니다.</section>';
  }
  const draft = state.shareDraft || {};
  const draftTags = Array.isArray(draft.tags) ? draft.tags.join(", ") : "";
  const selectedTags = parseSharedTags(draftTags);
  const suggestedTags = getShareTagSuggestions(state.shareTagQuery, selectedTags);

  return SharePageView(
    { icons, escapeAttr, escapeHtml },
    {
      isLoggedIn: state.isLoggedIn,
      draft,
      draftTags,
      selectedTags,
      suggestedTags,
      shareTagQuery: state.shareTagQuery,
      shareError: state.shareError,
    },
  );
}


function getPromptMutationStateContext() {
  return {
    findPromptById,
    getSavedFilteredCount,
    makePreview,
    popularPrompts,
    savedPrompts,
    state,
    updatePromptField,
    upsertPrompt,
  };
}

function getCommentMutationStateContext() {
  return {
    commentsByPrompt,
    getSavedFilteredCount,
    popularPrompts,
    savedPrompts,
    state,
    upsertPrompt,
  };
}

function getSavedFilteredCount() {
  return getSavedPagePrompts().filter((prompt) => matchesSavedFilter(prompt)).length;
}

function getMakeMutationStateContext() {
  return {
    makePreview,
    makePromptTitle,
    savedPrompts,
    state,
    updateRecentThread,
  };
}

function bindEvents() {
  bindAppEvents({
    bindCoreEvents,
    bindMakeEvents,
  });
}

function bindCoreEvents() {
  bindGlobalNavigationEvents();
  bindDiscoveryEvents();
  bindAuthControls(document, authController);
  bindModalControlEvents();
  bindPromptInteractionEvents();
  bindPromptEditAndExecuteEvents();
  bindPromptEngagementEvents(document, promptEngagementController);
  bindHomeSearchEvents();
  bindAdminEvents?.(document, { state, actions: {
    togglePromptHidden: toggleAdminPromptHidden,
    cancelPromptSearch: () => discoveryController.cancelAdminPromptSearch(),
    schedulePromptSearch: scheduleAdminPromptSearchCommit,
    cancelTagSearch: () => discoveryController.cancelAdminTagSearch(),
    scheduleTagSearch: scheduleAdminTagSearchCommit,
    updateReportStatus: updateReportRecordStatus,
    updateTag: updateAdminTagDecision,
    updateUserBlock: updateAdminUserBlockState,
    confirm: openConfirmAction,
    render,
  } });
  bindFormSubmitEvents();
}

function bindGlobalNavigationEvents() {
  bindGlobalMenuDismissEvents();
  bindRouteNavigationEvents();
  bindGlobalActionEvents();
}

function bindGlobalMenuDismissEvents() {
  document.querySelector("#app")?.addEventListener("click", (event) => {
    const shouldClosePromptCardMenu = state.openPromptCardMenuId && !event.target.closest(".prompt-card-menu-wrap");
    if (!shouldClosePromptCardMenu) return;
    if (shouldClosePromptCardMenu) state.openPromptCardMenuId = null;
    render();
  });

  document.onkeydown = (event) => {
    if (event.key === "Escape") {
      closeTopModal();
    }
  };
}

function bindRouteNavigationEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.route);
    });
  });
}

function bindGlobalActionEvents() {
  document.querySelectorAll("[data-toggle-reported]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleReportedVisibilityState(state);
      render();
    });
  });

  document.querySelectorAll("[data-reset-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmAction({
        type: "reset-demo",
        title: "데모 초기화",
        message: "저장, 신고, 댓글, 로그인, 최근 대화 등 현재 브라우저에 쌓인 화면 상태를 모두 초기화할까요? 서버 DB 데이터는 삭제하지 않습니다.",
        confirmLabel: "초기화",
        danger: true,
      });
    });
  });

  document.querySelectorAll("[data-toggle-library-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleLibraryDemoData();
    });
  });

  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authView = button.dataset.openAuth;
      state.authUserIdWarning = "";
      state.authError = "";
      render();
    });
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmAction({
        type: "logout",
        title: "로그아웃",
        message: "정말 로그아웃할까요?",
        confirmLabel: "로그아웃",
      });
    });
  });

  document.querySelectorAll("[data-toggle-admin-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.isLoggedIn) {
        state.adminMode = false;
        state.route = state.route === "admin" ? "home" : state.route;
        showNotice("Admin 페이지는 로그인 후 사용할 수 있습니다.");
        return;
      }
      state.adminMode = !state.adminMode;
      state.route = state.adminMode ? "admin" : "home";
      if (state.adminMode) ensureAdminRuntime().then((loaded) => { if (loaded && state.adminMode) render(); });
      showNotice(state.adminMode ? "관리자 운영 화면으로 이동했습니다." : "사용자 화면을 읽기 전용으로 확인합니다.");
    });
  });
}

function bindDiscoveryEvents() {
  document.querySelectorAll("[data-popular-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      searchByTag(button.dataset.popularTag);
    });
  });

  document.querySelectorAll("[data-search-tag]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      searchByTag(button.dataset.searchTag);
    });
  });

  document.querySelectorAll("[data-search-author]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const author = button.dataset.searchAuthor;
      if (isWithdrawnAuthorName(author)) return;
      searchByAuthor(author);
    });
  });

  document.querySelectorAll("[data-admin-user-author]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const author = button.dataset.adminUserAuthor;
      if (isWithdrawnAuthorName(author)) return;
      openAdminUserActivity(author, { memberId: button.dataset.adminUserId });
    });
  });

  const adminUserSearchForm = document.querySelector("[data-admin-user-search-form]");
  const adminUserSearchInput = adminUserSearchForm?.querySelector('input[name="nickname"]');
  adminUserSearchInput?.addEventListener("input", () => {
    const nickname = String(adminUserSearchInput.value || "").trim();
    const previousSelectedNickname = state.adminUserActivityNickname;
    const hadSearchResults = state.adminUserSearchResults.length > 0;
    state.adminUserQuery = adminUserSearchInput.value;
    state.adminUserSearchMessage = "";
    if (hadSearchResults) {
      state.adminUserSearchResults = [];
    }
    if (!nickname || normalizeAdminSearchText(nickname) !== normalizeAdminSearchText(previousSelectedNickname)) {
      state.adminUserActivityNickname = "";
    }
    if (!nickname || previousSelectedNickname || hadSearchResults) {
      state.adminUserSearchResults = [];
      render();
    }
  });
  adminUserSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = String(new FormData(/** @type {HTMLFormElement} */ (adminUserSearchForm)).get("nickname") || "").trim();
    if (!nickname) {
      state.adminUserQuery = "";
      state.adminUserActivityNickname = "";
      state.adminUserSearchResults = [];
      state.adminUserSearchMessage = "";
      render();
      return;
    }
    searchAdminUserCandidates(nickname);
  });

  document.querySelectorAll("[data-admin-user-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = String(button.dataset.adminUserSelect || "").trim();
      const nickname = String(button.dataset.adminUserName || "").trim();
      if (!memberId) {
        showNotice("회원 ID를 확인할 수 없어 활동 조회를 열 수 없습니다.");
        return;
      }
      openAdminUserActivity(nickname, { memberId, keepQuery: true });
    });
  });
}

function bindModalControlEvents() {
  bindModalEvents(document, { ...modalController, render, renderPreservingScroll: renderPreservingMakeScroll, runConfirmedAction: () => modalController.runConfirmed(confirmActionHandlers) }, state);
}

function bindPromptInteractionEvents() {
  document.querySelectorAll("[data-prompt-card-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const promptId = button.dataset.promptCardMenu;
      state.openPromptCardMenuId = state.openPromptCardMenuId === promptId ? null : promptId;
      render();
    });
  });

  document.querySelectorAll("[data-open-prompt]").forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPromptDetail(card.dataset.openPrompt, { highlightCommentId: card.dataset.highlightComment || null });
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPromptDetail(card.dataset.openPrompt, { highlightCommentId: card.dataset.highlightComment || null });
    });
  });

  document.querySelectorAll("[data-filter]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.savedFilter[checkbox.dataset.filter] = checkbox.checked;
      state.savedPage = 1;
      render();
    });
  });

  document.querySelectorAll("[data-my-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = button.dataset.myTab || "library";
      commitPendingUnsaves(state.route, nextTab);
      state.myPageTab = nextTab;
      state.savedPage = 1;
      render();
    });
  });

  document.querySelectorAll("[data-saved-sort]").forEach((select) => {
    select.addEventListener("change", () => {
      state.savedSort = select.value;
      state.savedPage = 1;
      render();
    });
  });

  document.querySelectorAll("[data-report-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReportPrompt(button.dataset.reportPrompt);
    });
  });

  document.querySelectorAll("[data-share-saved]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openPromptCardMenuId = null;
      publishSavedPrompt(button.dataset.shareSaved);
    });
  });

  document.querySelectorAll("[data-unshare-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openPromptCardMenuId = null;
      unshareOwnPrompt(button.dataset.unsharePrompt);
    });
  });

  document.querySelectorAll("[data-open-make-history]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSavedMakePrompt(button.dataset.openMakeHistory);
    });
  });

  document.querySelectorAll("[data-delete-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openPromptCardMenuId = null;
      deleteOwnPrompt(button.dataset.deletePrompt);
    });
  });
}

function bindHomeSearchEvents() {
  bindHomeEvents(document, homeController, state);

  document.querySelectorAll("[data-saved-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.savedPage = Number(button.dataset.savedPage);
      render();
    });
  });
}


function bindPromptEditAndExecuteEvents() {
  document.querySelectorAll("[data-edit-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openPromptCardMenuId = null;
      const prompt = findPromptById(button.dataset.editPrompt);
      if (!state.isLoggedIn || prompt?.source !== "mine") {
        state.authView = "login";
        showNotice("로그인 후 본인 프롬프트만 수정할 수 있습니다.");
        return;
      }
      state.editingPromptId = prompt.id;
      render();
    });
  });

  document.querySelectorAll("[data-execute-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      openPromptExecuteModal(button.dataset.executePrompt);
    });
  });

  document.querySelectorAll("[data-execute-target]").forEach((button) => {
    button.addEventListener("click", () => {
      executeMakeMessage(state.executeMessageId, button.dataset.executeTarget);
    });
  });
}

function bindFormSubmitEvents() {
  bindAuthForm(document, authController, state);
  bindShareFormEvents();
  bindReportAndCommentFormEvents();
}

function bindShareFormEvents() {
  if (shareController) bindShareEvents?.(document, shareController, state);
}

function bindReportAndCommentFormEvents() {
  const reportForm = document.querySelector("[data-report-form]");
  if (reportForm) {
    reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitReport(reportForm.dataset.reportType, reportForm.dataset.reportForm, new FormData(/** @type {HTMLFormElement} */ (reportForm)).get("reason"));
    });
  }

  const adminUserBlockForm = document.querySelector("[data-admin-user-block-form]");
  if (adminUserBlockForm) {
    adminUserBlockForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(/** @type {HTMLFormElement} */ (adminUserBlockForm));
      updateAdminUserBlockState(
        adminUserBlockForm.dataset.adminUserBlockForm,
        true,
        adminUserBlockForm.dataset.adminUserName,
        formData.get("reason")
      );
    });
  }

  const promptEditForm = document.querySelector("[data-prompt-edit-form]");
  if (promptEditForm) {
    promptEditForm.addEventListener("submit", (event) => {
      event.preventDefault();
      updateOwnPrompt(promptEditForm.dataset.promptEditForm, new FormData(/** @type {HTMLFormElement} */ (promptEditForm)));
    });
  }

  const adminRevisionRequestForm = document.querySelector("[data-admin-revision-request-form]");
  if (adminRevisionRequestForm) {
    adminRevisionRequestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      requestPromptRevision(adminRevisionRequestForm.dataset.adminRevisionRequestForm, new FormData(/** @type {HTMLFormElement} */ (adminRevisionRequestForm)).get("reason"));
    });
  }

  document.querySelectorAll("[data-toggle-comments]").forEach((button) => {
    button.addEventListener("click", () => {
      const promptId = button.dataset.toggleComments;
      state.expandedComments[promptId] = !state.expandedComments[promptId];
      render();
    });
  });

  document.querySelectorAll("[data-show-comments]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const promptId = button.dataset.showComments;
      state.expandedComments[promptId] = true;
      render();
    });
  });

  document.querySelectorAll("[data-admin-toggle-comment-hidden]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const value = String(button.dataset.adminToggleCommentHidden || "");
      const separatorIndex = value.lastIndexOf(":");
      const commentId = value.slice(0, separatorIndex);
      const mode = value.slice(separatorIndex + 1);
      updateAdminCommentHiddenState(commentId, mode !== "unhide");
    });
  });

  document.querySelectorAll("[data-report-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      openReportComment(button.dataset.reportComment);
    });
  });
}




function getShareTagSuggestions(query, selectedTags = []) {
  return getShareTagSuggestionsModel?.(query, selectedTags, getKnownTags(), normalizeTag) || [];
}

function updatePromptField(promptId, field, delta) {
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    const currentValue = field === "likes" ? getPromptLikes(prompt) : prompt[field] || 0;
    prompt[field] = Math.max(0, currentValue + delta);
    updated.add(prompt);
  }
}

function openPromptDetail(promptId, options = {}) {
  incrementPromptViews(promptId);
  state.detailPromptId = promptId;
  state.detailHighlightCommentId = options.highlightCommentId || null;
  if (state.detailHighlightCommentId || shouldOpenCommentsByDefault()) {
    state.expandedComments[promptId] = true;
  }
  hydratePromptComments(promptId);
  render();
}

function shouldOpenCommentsByDefault() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(min-width: 900px)").matches;
}

function incrementPromptViews(promptId) {
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    prompt.views = getPromptViewCount(prompt) + 1;
    updated.add(prompt);
  }
}

function normalizeAuthorName(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value.nickname || value.name || value.userId || value.username || "").trim();
  }
  return String(value).trim();
}

function getDisplayPromptAuthor(prompt) {
  const author = normalizeAuthorName(prompt?.author || prompt?.authorNickname || prompt?.nickname || prompt?.raw?.author);
  const owner = normalizeAuthorName(prompt?.owner || prompt?.ownerNickname || prompt?.raw?.owner);
  const currentUser = String(state.currentUser || "").trim();

  if (state.isLoggedIn && currentUser && (owner === currentUser || author === currentUser || author === "나")) {
    return "나";
  }

  if (author && author !== "나") return author;
  if (owner && owner !== "나") return owner;
  return "익명 사용자";
}

function isWithdrawnAuthorName(value) {
  return String(value || "").trim() === WITHDRAWN_AUTHOR_LABEL;
}

function renderAuthorSearchControl(prompt, options = {}) {
  const author = getDisplayPromptAuthor(prompt);
  const safeAuthor = escapeHtml(author);
  const safeAuthorAttr = escapeAttr(author);
  const safeAuthorId = escapeAttr(getPromptAuthorId(prompt));
  if (isWithdrawnAuthorName(author)) {
    return `<span class="author-search-button disabled-author" aria-disabled="true">${safeAuthor}</span>`;
  }

  if (options.admin) {
    return `<button class="author-search-button admin-author-lookup-button" type="button" data-admin-user-author="${safeAuthorAttr}" data-admin-user-id="${safeAuthorId}">${safeAuthor}</button>`;
  }

  return `<button class="author-search-button" type="button" data-search-author="${safeAuthorAttr}">${safeAuthor}</button>`;
}

function renderAdminInlineAuthorControl(prompt) {
  const author = getDisplayPromptAuthor(prompt);
  const safeAuthor = escapeHtml(author);
  const safeAuthorAttr = escapeAttr(author);
  const safeAuthorId = escapeAttr(getPromptAuthorId(prompt));
  if (isWithdrawnAuthorName(author)) {
    return `<span class="admin-inline-author-button disabled-author" aria-disabled="true">${safeAuthor}</span>`;
  }
  return `<button class="admin-inline-author-button" type="button" data-admin-user-author="${safeAuthorAttr}" data-admin-user-id="${safeAuthorId}">${safeAuthor}</button>`;
}

function getPromptAuthorId(prompt) {
  return String(prompt?.authorId || prompt?.author?.id || prompt?.raw?.author?.id || prompt?.raw?.authorId || prompt?.raw?.memberId || "");
}

function stampCurrentUserOwnedPrompts() {
  const currentUser = String(state.currentUser || "").trim();
  if (!currentUser) return;

  [popularPrompts, savedPrompts].forEach((list) => {
    list.forEach((prompt) => {
      if (prompt.source !== "mine") return;
      if (!prompt.owner || prompt.owner === "나") prompt.owner = currentUser;
      if (!prompt.author || prompt.author === "나") prompt.author = currentUser;
    });
  });
}





















function resetDemoState() {
  try {
    clearPersistedPayload();
    removeStorageItem(AUTH_TOKEN_KEY);
  } catch (_error) {
    // Ignore storage failures in preview mode.
  }
  window.location.reload();
}

function toggleLibraryDemoData() {
  if (!canUseDemoFallback()) {
    showNotice("현재 환경에서는 데모 데이터 fallback이 비활성화되어 있습니다.");
    return;
  }
  state.libraryDemoSeeded = !state.libraryDemoSeeded;
  state.savedPage = 1;
  showNotice(state.libraryDemoSeeded ? "보관함 데모 데이터를 표시합니다." : "보관함 데모 데이터를 숨겼습니다.");
  render();
}

function bindMakeEvents() {
  if (!makeEventsModule) return;
  bindDelegatedMakeEvents();
  bindMakeFeedScrollEvents({ state });
  document.querySelectorAll("[data-autosize-textarea]").forEach(autosizeTextarea);
  document.querySelectorAll("[data-ask-answer-input]").forEach((input) => makeEventsModule.updateAskProgress(input));
}

function bindDelegatedMakeEvents() {
  const handlers = makeEventsModule.createDelegatedMakeHandlers({
    state,
    maxFolders: MAX_CUSTOM_MAKE_FOLDERS,
    actions: {
      guard: guardAdminUserAction, notice: showNotice, render,
      setDraft: (value) => makeStateModule.setMakeComposerDraft(state, value),
      setEditing: (id) => makeStateModule.setMakeEditingMessage(state, id),
      setPendingScroll: (id) => { pendingMessageScrollId = id; },
      autosize: autosizeTextarea, submitComposer: submitMakeComposer, submitPrompt: submitMakePrompt,
      cancelRequest: cancelActiveMakeRequest,
      submitAnswers: submitAskAnswerForm, resend: resendEditedMessage,
      createFolder: createMakeFolder, createFolderAndMove: createMakeFolderAndMoveThread,
      renameFolder: renameMakeFolder, moveThread: moveThreadToFolder,
      applyTemplate, toggleTemplates: toggleTemplateBar, copy: copyMakeMessage, save: saveMakeMessage,
      share: openShareFromMakeMessage, execute: openExecuteModal, newChat: startNewChat,
      openThread: openRecentThread, confirm: openConfirmAction, folderCount: getCustomMakeFolderCount,
      focusLater: (selector) => window.setTimeout(() => document.querySelector(selector)?.focus(), 0),
    },
  });
  makeEventsModule.bindDelegatedMakeEvents(document.getElementById("app"), handlers);
}

function submitMakeComposer(composer) {
  if (typeof composer.requestSubmit === "function") {
    composer.requestSubmit();
    return;
  }
  composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

async function submitMakePrompt(composer) {
  return makeControllerModule.submitPrompt(getMakeControllerContext(), composer);
}

function cancelActiveMakeRequest() {
  if (!activeMakeRequestController) return false;
  activeMakeRequestController.abort();
  return true;
}

function getMakeControllerContext() {
  return {
    state,
    freeLimit: FREE_MAKE_LIMIT,
    guard: guardAdminUserAction,
    isBusy: () => isMakeThinking || makeRequestState.inFlight,
    notice: showNotice,
    bumpInteraction: () => { makeInteractionVersion += 1; },
    renderPreservingScroll: renderPreservingMakeScroll,
    buildHistory: buildMakeImproveHistory,
    startRequest: () => {
      activeMakeRequestController?.abort();
      activeMakeRequestController = new AbortController();
      makeStateModule.startMakeRequest(makeRequestState);
      return activeMakeRequestController.signal;
    },
    isCurrentRequest: (signal) => !signal || activeMakeRequestController?.signal === signal,
    completeRequest: (signal) => {
      if (signal && activeMakeRequestController?.signal !== signal) return false;
      activeMakeRequestController = null;
      makeStateModule.completeMakeRequest(makeRequestState);
      return true;
    },
    failRequest: (id, failure) => makeStateModule.failMakeRequest(makeRequestState, id, failure),
    stopInFlight: (signal) => {
      if (signal && activeMakeRequestController?.signal !== signal) return false;
      activeMakeRequestController = null;
      makeRequestState.inFlight = false;
      return true;
    },
    setDraft: (value) => makeStateModule.setMakeComposerDraft(state, value),
    appendUser: (threadId, message) => appendMakeUserMessageState(state, threadId, message),
    appendAssistant: (message) => appendMakeAssistantMessageState(state, message),
    setThinking: (value) => { isMakeThinking = value; },
    updateThread: updateRecentThread,
    render,
    scrollLatest: () => scheduleMakeLatestScroll({ behavior: "auto" }),
    waitForPaint: waitForThinkingIndicatorPaint,
    improve: improvePromptWithBackend,
    recover: (options) => recoverActiveMakeThreadAfterFailure(getMakeFailureRecoveryContext(), options),
    classifyError: makeMessageModel.classifyMakeError,
    setBackendFailure: () => makeStateModule.setMakeBackendFailure(state, getApiFailureMessage("Make 개선 API")),
    handleError: handleBackendAccessError,
    renderCancellation: () => {
      if (state.route !== "make") return;
      render();
      window.setTimeout(() => document.querySelector('[data-composer] textarea[name="prompt"]')?.focus(), 0);
    },
    applyPendingThread: applyPendingImproveThreadId,
    shouldSync: shouldUseImproveThreadSync,
    refreshThread: (threadId) => refreshActiveMakeThreadFromBackend(threadId, { quiet: true, scrollToLatest: true }),
    syncThread: syncMakeThreadWithBackend,
    focusAsk: focusLatestAskAnswer,
    findEditableMessage: (messageId) => state.messages.findIndex((message) => message.id === messageId && message.role === "user"),
    getMessages: () => state.messages,
    getActiveThreadId: () => state.activeThreadId,
    getBackendThreadId: getMakeBackendThreadId,
    clearEditing: () => makeStateModule.setMakeEditingMessage(state),
    refreshThreads: () => refreshMakeThreadsFromBackend({ shouldRender: false }).catch(() => {}),
    applyEdit: (index, value, now) => applyEditedMakeMessageState(state, index, value, now),
    finishEdit: finishEditedMakeMessageState,
    queueScroll: (messageId) => queueLatestMakeScroll(messageId, { mode: "immediate" }),
    messages: {
      busy: "이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요.",
      missingThread: "서버 대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.",
      edited: "수정한 메시지로 다시 개선했습니다.",
      editFailed: "수정 실패: 잠시 후 다시 시도해주세요.",
      improveFailed: "프롬프트 개선 요청에 실패했습니다.",
    },
  };
}














async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    return fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function makePromptTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Make에서 저장한 프롬프트";
  return clean.length > 26 ? `${clean.slice(0, 26)}...` : clean;
}

function truncateText(text, maxLength = 80) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function autosizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}








function normalizeSavedPage() {
  normalizeSavedPageState(state, getSavedFilteredCount(), SAVED_PAGE_SIZE);
}


function restoreSearchFocus() {
  homeController.restoreSearchFocus();
}

function getSavedPagePrompts() {
  return savedLibraryController.getPagePrompts();
}

function getLocalSavedPagePrompts() {
  return savedLibraryController.getLocalPrompts();
}

function hasUserLibraryContent() {
  return getSavedPagePrompts().length > 0;
}

function matchesSavedFilter(prompt) {
  return savedLibraryController.matchesFilter(prompt);
}

function getSavedSorter() {
  return savedLibraryController.getSorter();
}

function scheduleAdminPromptSearchCommit(value) {
  discoveryController.scheduleAdminPromptSearch(value);
}

function commitAdminPromptSearchQuery(value) {
  discoveryController.commitAdminPromptSearch(value);
}

function restoreAdminPromptSearchFocus() {
  discoveryController.restoreAdminPromptFocus();
}

function scheduleAdminTagSearchCommit(value) {
  discoveryController.scheduleAdminTagSearch(value);
}

function commitAdminTagSearchQuery(value) {
  discoveryController.commitAdminTagSearch(value);
}

function restoreAdminTagSearchFocus() {
  discoveryController.restoreAdminTagFocus();
}

function searchByTag(tag) {
  discoveryController.searchByTag(tag);
}

function searchByAuthor(author) {
  discoveryController.searchByAuthor(author);
}


function findPromptById(promptId) {
  return getUniquePrompts([
    ...state.backendMyPrompts,
    ...state.backendLibraryPrompts,
    ...state.backendLikedPrompts,
    ...state.backendAdminPrompts,
    ...savedPrompts,
    ...popularPrompts,
  ]).find((item) => item.id === promptId);
}

function upsertPrompt(list, prompt) {
  const index = list.findIndex((item) => item.id === prompt.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...prompt };
    return;
  }
  list.unshift(prompt);
}

function parseSharedTags(value) {
  return value
    .split(/[,\s]+/)
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter(Boolean);
}

function getVisiblePopularPrompts() {
  return selectVisiblePrompts({
    prompts: popularPrompts,
    query: state.searchQuery,
    scope: state.searchScope,
    sort: state.popularSort,
    normalizeTag,
    normalizeText: normalizeSearchText,
    getAuthor: getDisplayPromptAuthor,
    metrics: getHomeSortMetrics(),
  });
}

function getPopularTags(prompts) {
  return collectPopularTags(prompts, {
    normalizeTag,
    getCreatedAt: getPromptCreatedAt,
    isApproved: (tag) => getAdminTagStatus(tag) === "approved",
    limit: 8,
  });
}

function getKnownTags() {
  const tags = new Map();
  fallbackPopularTags.forEach((tag) => {
    const key = normalizeTag(tag);
    if (key && !tags.has(key)) tags.set(key, tag);
  });
  [...popularPrompts, ...savedPrompts].forEach((prompt) => {
    (prompt.tags || []).forEach((tag) => {
      const key = normalizeTag(tag);
      if (key && !tags.has(key)) tags.set(key, tag);
    });
  });
  return [...tags.values()].sort((a, b) => a.localeCompare(b, "ko-KR"));
}




function getMyPrompts() {
  if (state.myBackendStatus === "fallback" && !canUseDemoFallback()) return [];
  if (state.myBackendStatus === "connected") {
    const localMinePrompts = savedPrompts.filter((prompt) => prompt.source === "mine" && !isHiddenDemoLibraryPrompt(prompt));
    return getUniquePrompts([...state.backendMyPrompts, ...localMinePrompts]);
  }
  return getUniquePrompts(savedPrompts.filter((prompt) => prompt.source === "mine" && !isHiddenDemoLibraryPrompt(prompt)));
}

function getMyComments() {
  if (state.myBackendStatus === "fallback" && !canUseDemoFallback()) return [];
  const localComments = getLocalMyCommentItems();
  if (state.myBackendStatus === "connected") {
    const backendComments = state.backendMyComments.map((comment) => ({
      promptId: String(comment.promptId || ""),
      prompt: comment.prompt || findPromptById(String(comment.promptId || "")) || {
        id: String(comment.promptId || ""),
        title: comment.promptTitle || "삭제된 프롬프트",
        text: "",
        author: "",
      },
      comment,
    }));
    return getUniqueMyCommentItems([...backendComments, ...localComments]);
  }

  return localComments;
}

function getLocalMyCommentItems() {
  const owner = state.currentUser || "나";
  const items = [];

  Object.entries(commentsByPrompt).forEach(([promptId, comments]) => {
    collectOwnedComments(items, promptId, comments, owner);
  });

  return items;
}

function getUniqueMyCommentItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const comment = item.comment || {};
    const key = String(comment.id || `${item.promptId}:${comment.text || ""}:${comment.createdAt || ""}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectOwnedComments(items, promptId, comments, owner) {
  (comments || []).forEach((comment) => {
    if (!comment.deleted && (comment.owner === owner || comment.author === owner || comment.owner === "나" || comment.author === "나")) {
      items.push({ promptId, prompt: findPromptById(promptId), comment });
    }
    collectOwnedComments(items, promptId, comment.replies || [], owner);
  });
}

function getMyReports() {
  if (state.myBackendStatus === "fallback" && !canUseDemoFallback()) return [];
  const backendReports = state.backendMyReports.map((report) => ({
    type: report.type,
    title: report.type === "comment" ? "댓글 신고" : "프롬프트 신고",
    id: report.targetId,
    label: report.reason || report.raw?.targetPreview || report.raw?.promptTitle || "신고 내역",
    reason: report.reason,
    memo: report.memo || "",
    reviewedAt: report.reviewedAt || 0,
    status: mapBackendReportStatus(report.status),
    requestedAt: report.createdAt,
  }));
  const localReports = getLocalMyReportItems();
  const reports = state.myBackendStatus === "connected"
    ? getUniqueMyReports([...backendReports, ...localReports])
    : getUniqueMyReports([...localReports, ...backendReports]);
  return reports.sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
}

function getLocalMyReportItems() {
  const promptReports = [...state.reportedPromptIds].map((promptId) => {
    const prompt = findPromptById(promptId);
    const record = getReportRecord(`prompt:${promptId}`);
    return {
      type: "prompt",
      title: "프롬프트 신고",
      id: promptId,
      label: prompt?.title || "삭제된 프롬프트",
      reason: record.reason || "",
      memo: record.memo || "",
      reviewedAt: record.reviewedAt || 0,
      status: record.status,
      requestedAt: record.createdAt,
    };
  });
  const commentReports = [...state.reportedCommentIds].map((commentId) => {
    const comment = findCommentById(commentId);
    const record = getReportRecord(`comment:${commentId}`);
    return {
      type: "comment",
      title: "댓글 신고",
      id: commentId,
      label: comment?.text || "삭제된 댓글",
      reason: record.reason || "",
      memo: record.memo || "",
      reviewedAt: record.reviewedAt || 0,
      status: record.status,
      requestedAt: record.createdAt,
    };
  });

  const revisionRequests = Object.entries(state.adminPromptRevisionRequests)
    .map(([key, request]) => {
      const target = getRevisionRequestTarget(key);
      if (!target || !isRevisionTargetOwnedByCurrentUser(target)) return null;
      return {
        type: target.type,
        title: `${target.type === "prompt" ? "프롬프트" : "댓글"} 수정 요청`,
        id: target.id,
        editPromptId: target.type === "prompt" ? target.id : "",
        label: target.type === "comment" ? target.text : target.title,
        reason: request.reason,
        status: "revision-requested",
        requestedAt: request.requestedAt,
      };
    })
    .filter(Boolean);

  return [...revisionRequests, ...promptReports, ...commentReports].sort(
    (a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0),
  );
}

function getUniqueMyReports(reports) {
  const seen = new Set();
  return reports.filter((report) => {
    const key = `${report.title || report.status || "report"}:${report.type}:${report.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

















function sortPopularPrompts(prompts) {
  return sortPrompts(prompts, state.popularSort, getHomeSortMetrics());
}

function getHomeSortMetrics() {
  return {
    views: getPromptViewCount,
    saves: getPromptSaveCount,
    comments: getPromptCommentCount,
    likes: getPromptLikes,
    createdAt: getPromptCreatedAt,
  };
}

function getPromptLikes(prompt) {
  const likes = Number(prompt?.likes);
  return Number.isFinite(likes) ? likes : Math.round(getPromptSaveCount(prompt) / 3);
}

function getPromptViewCount(prompt) {
  const views = Number(prompt?.views);
  return Number.isFinite(views) ? views : 0;
}

function getPromptCreatedAt(prompt) {
  const createdAt = parseTimestamp(prompt?.createdAt || prompt?.updatedAt || prompt?.publishedAt);
  if (createdAt) return createdAt;
  const sharedTimestamp = String(prompt.id || "").match(/^shared-(\d+)$/)?.[1];
  if (sharedTimestamp) return Number(sharedTimestamp);
  const demoIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
  return demoIndex >= 0 ? popularPrompts.length - demoIndex : 0;
}

function applyReportedVisibility(prompts) {
  return prompts.filter((prompt) => {
    if (state.adminHiddenPromptIds.has(prompt.id)) return false;
    if (canShowReportedState() && state.hideReportedPrompts && state.reportedPromptIds.has(prompt.id)) return false;
    return true;
  });
}

function canShowReportedState() {
  return state.isLoggedIn || state.adminMode;
}


function getPopularTotalPages(count) {
  return Math.max(1, Math.ceil(count / HOME_PAGE_SIZE));
}

function getBackendHomeTotalPages() {
  const totalPages = Number(state.backendHomePage?.totalPages);
  return Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;
}

function updateBackendHomePageMeta(payload = {}, fallbackPage = state.popularPage) {
  const rawPage = Number(payload.page ?? payload.currentPage ?? payload.pageNumber ?? fallbackPage);
  const rawSize = Number(payload.size ?? payload.pageSize ?? HOME_PAGE_SIZE);
  const rawTotalPages = Number(payload.totalPages ?? payload.total_pages ?? payload.page?.totalPages ?? payload.page?.total_pages);
  const rawTotalElements = Number(
    payload.totalElements ??
      payload.total_elements ??
      payload.total ??
      payload.totalCount ??
      payload.page?.totalElements ??
      payload.page?.total_elements,
  );

  const totalPages = Number.isFinite(rawTotalPages) && rawTotalPages > 0 ? Math.floor(rawTotalPages) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : fallbackPage;

  state.backendHomePage = {
    page: Math.min(page, totalPages),
    size: Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : HOME_PAGE_SIZE,
    totalPages,
    totalElements: Number.isFinite(rawTotalElements) && rawTotalElements >= 0 ? Math.floor(rawTotalElements) : popularPrompts.length,
  };
  state.popularPage = state.backendHomePage.page;
}

function polishPrompt(prompt) {
  return `역할: 당신은 해당 분야의 전문 어시스턴트입니다.\n\n목표: ${prompt}\n\n요구사항:\n- 요청의 목적을 먼저 파악하고 필요한 경우 합리적인 가정을 명시하세요.\n- 구체적인 단계, 출력 형식, 확인 기준을 포함해 답변하세요.\n- 모호한 표현은 명확한 기준과 예시로 바꿔 설명하세요.\n- 바로 사용할 수 있는 형태로 결과물을 작성하세요.\n\n출력 형식:\n1. 최종 답변\n2. 핵심 근거\n3. 필요 시 다음 액션`;
}

let noticeTimer = 0;

function showNotice(message) {
  state.notice = message;
  window.clearTimeout(noticeTimer);
  if (state.route === "make") {
    renderPreservingMakeScroll();
  } else {
    render();
  }
  noticeTimer = window.setTimeout(() => {
    state.notice = "";
    if (state.route === "make") {
      renderPreservingMakeScroll();
    } else {
      render();
    }
  }, 1700);
}

function getAuthToken() {
  const storedToken = readStorageItem(AUTH_TOKEN_KEY);
  return String(state.authToken || state.token || storedToken || "").trim();
}

function isDemoAuthToken(token = getAuthToken()) {
  return String(token || "").trim() === DEMO_AUTH_TOKEN;
}

function hasBackendAuthToken() {
  const token = getAuthToken();
  return Boolean(token) && !isDemoAuthToken(token);
}

function handleBackendAccessError(error, fallbackMessage = "요청을 처리하지 못했습니다.", options = {}) {
  return handleBackendAccessErrorEffect(getBackendAccessErrorContext(), error, fallbackMessage, options);
}

function getBackendAccessErrorContext() {
  return {
    clearAuthenticatedSession,
    getAuthToken,
    getBackendErrorCode,
    getBackendErrorMessage,
    isDemoAuthToken,
    showNotice,
    state,
  };
}
function isAdminAccount() {
  return state.isLoggedIn && String(state.currentUserRole || "").toLowerCase() === "admin";
}

function guardAdminUserAction() {
  if (!isAdminAccount() || state.adminMode) return false;

  showNotice("관리자 계정은 운영 기능만 사용할 수 있습니다.");
  return true;
}

function callBackendApi(action, ...args) {
  const api = apiClient;
  const handler = api?.[action];
  if (typeof handler !== "function") return Promise.resolve(null);

  const token = getAuthToken();
  if (PROTECTED_BACKEND_ACTIONS.has(action) && (!token || isDemoAuthToken(token))) {
    console.info(`[TTALKAK] ${action} API 호출은 실제 인증 토큰이 없어 건너뜁니다.`);
    return Promise.resolve(null);
  }

  return Promise.resolve(handler(...args, token || undefined)).catch((error) => {
    handleBackendAccessError(
      error,
      canUseDemoFallback()
        ? "백엔드 요청에 실패해 화면의 임시 상태만 유지합니다."
        : "백엔드 요청에 실패했습니다.",
    );
    reportWarning("backend-api", action, error);
    return null;
  });
}

async function runPromptStateMutation(action, promptId, fallbackMessage) {
  if (!isBackendNumericId(promptId) || state.backendStatus !== "connected") return true;

  const api = apiClient;
  const handler = api?.[action];
  if (typeof handler !== "function") return true;

  const token = getAuthToken();
  if (PROTECTED_BACKEND_ACTIONS.has(action) && (!token || isDemoAuthToken(token))) {
    openAuth("login");
    showNotice("실제 로그인 토큰이 있어야 처리할 수 있습니다.");
    return false;
  }

  try {
    await handler(promptId, token || undefined);
    return true;
  } catch (error) {
    handleBackendAccessError(error, fallbackMessage);
    await Promise.allSettled([refreshBackendHomePrompts(), refreshMyPageDataAfterMutation()]);
    render();
    return false;
  }
}

function getMakeApi() {
  return apiClient || {};
}

function getMakeApiToken() {
  return getAuthToken() || undefined;
}

function handleMakeBackendSyncError(error, demoMessage, strictMessage, logMessage, options) {
  handleBackendAccessError(error, canUseDemoFallback() ? demoMessage : strictMessage, options);
  if (logMessage) reportWarning("make-sync", "backend-sync-failure", error);
}







function isBackendNumericId(value) {
  return value !== null && value !== undefined && /^\d+$/.test(String(value));
}

function buildMakeImproveHistory(messages = state.messages) {
  return makeMessageModel.buildImproveHistory(messages);
}

function submitAskAnswerForm(form) {
  return makeControllerModule.submitAskAnswers({ model: makeMessageModel, root: document, setDraft: (value) => makeStateModule.setMakeComposerDraft(state, value), submit: submitMakeComposer }, form);
}

function focusLatestAskAnswer() {
  makeFocusModule.focusLatestAskAnswer(document);
}

function getMakeThreadById(threadId = state.activeThreadId) {
  return getMakeServerSyncEffects().getMakeThreadById(threadId);
}

function getMakeBackendThreadId(threadId = state.activeThreadId) {
  return getMakeServerSyncEffects().getMakeBackendThreadId(threadId);
}

function applyPendingImproveThreadId(threadId) {
  return getMakeServerSyncEffects().applyPendingImproveThreadId(threadId);
}

function shouldUseImproveThreadSync() {
  return getMakeServerSyncEffects().shouldUseImproveThreadSync();
}

/** @param {*} prompt @param {{ history?: Array<*>, threadId?: *, messageId?: string, category?: string, signal?: AbortSignal }} [options] */
async function improvePromptWithBackend(prompt, {
  history = buildMakeImproveHistory(),
  threadId = state.activeThreadId,
  messageId = "",
  category = "",
  signal,
} = {}) {
  return getMakeServerSyncEffects().improvePromptWithBackend(prompt, { history, threadId, messageId, category, signal });
}




function queueLatestMakeThreadScroll(thread) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : state.messages;
  const latestMessage = [...messages].reverse().find((message) => message?.id);
  if (latestMessage?.id) {
    queueLatestMakeScroll(latestMessage.id, { mode: "final" });
  }
}

function getMakeFailureRecoveryContext() {
  return {
    getMakeBackendThreadId,
    refreshActiveMakeThreadFromBackend,
    shouldUseImproveThreadSync,
    state,
  };
}

function getMakeServerSyncEffects() {
  if (!makeServerSyncEffects) {
    makeServerSyncEffects = createMakeServerSyncEffects(getMakeServerSyncContext());
  }
  return makeServerSyncEffects;
}

function getMakeServerSyncContext() {
  return {
    applyMakeThreadsResult,
    buildMakeImproveHistory,
    canUseDemoFallback,
    getApiFailureMessage,
    getBackendDataEffectContext,
    getBackendFolderId,
    getMakeApi,
    getMakeApiToken,
    handleBackendAccessError,
    handleMakeBackendSyncError,
    hasBackendAuthToken,
    isBackendNumericId,
    makePreview,
    makePromptTitle,
    normalizeRecentThreads,
    openRecentMakeThreadState,
    polishPrompt,
    queueLatestMakeThreadScroll,
    render,
    renderPreservingMakeScroll,
    scrollToMakeLatestMessage,
    state,
    reportWarning,
  };
}







function persistState() {
  try {
    persistAppState({
      commentsByPrompt,
      popularPrompts,
      saveCurrentAccountScope,
      savedPrompts,
      state,
    });
  } catch (_error) {
    // Local preview can still run if browser storage is blocked.
  }
}

function loadPersistedState() {
  try {
    loadPersistedAppState({
      commentsByPrompt,
      getCurrentAccountScopeKey,
      getValidSearchScope,
      normalizeMakeFolders,
      normalizePersistedLikeCounts,
      normalizeSavedPromptOwnership,
      popularPrompts,
      restoreCurrentAccountScope,
      savedPrompts,
      state,
    });
  } catch (_error) {
    clearPersistedPayload();
  }
}

function normalizeMakeFolders(folders) {
  const base = [{ id: "uncategorized", name: "미분류" }];
  const extra = Array.isArray(folders)
    ? folders.filter((folder) => folder?.id && folder?.name && folder.id !== "uncategorized" && folder.id !== "all")
    : [];
  return [...base, ...extra];
}

function normalizePersistedLikeCounts() {
  const normalized = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    list.forEach((prompt) => {
      if (!prompt || normalized.has(prompt.id)) return;
      const baseLikes = Math.round((prompt.saves || 0) / 3);
      const minimumLikes = baseLikes + (state.likedPromptIds.has(prompt.id) ? 1 : 0);
      if (prompt.likes == null || prompt.likes < minimumLikes) {
        prompt.likes = minimumLikes;
      }
      normalized.add(prompt.id);
    });
  }
}

function normalizeRecentThreads() {
  makePersistenceModule.normalizeAndPersistMakeState(
    state,
    makeMessageModel,
    makeStateModule,
    persistState,
  );
}

function normalizeAssistantPromptOutputs() {
  state.messages.forEach((message) => {
    if (message.role === "assistant") {
      message.content = getFinalPromptText(message);
    }
  });

  state.recentThreads.forEach((thread) => {
    thread.messages?.forEach((message) => {
      if (message.role === "assistant") {
        message.content = getFinalPromptText(message);
      }
    });
  });
}

function ensureDemoComments() {
  Object.entries(demoCommentBackfill).forEach(([promptId, comments]) => {
    const currentComments = commentsByPrompt[promptId] || [];
    const existingIds = new Set(currentComments.map((comment) => comment.id));
    const missingComments = comments.filter((comment) => !existingIds.has(comment.id));

    if (currentComments.length === 0 || missingComments.length > 0) {
      commentsByPrompt[promptId] = [...currentComments, ...missingComments];
    }
  });
}

function normalizeDemoCopy() {
  const promptOverrides = window.TTALKAK_DEMO_COPY?.promptOverrides || demoPromptTextOverrides;
  const commentOverrides = window.TTALKAK_DEMO_COPY?.commentOverrides || demoCommentTextOverrides;

  for (const list of [popularPrompts, savedPrompts]) {
    list.forEach((prompt) => {
      const override = promptOverrides[prompt.id];
      if (!override) return;
      Object.assign(prompt, override);
    });
  }

  Object.entries(commentOverrides).forEach(([promptId, comments]) => {
    commentsByPrompt[promptId] = comments.map((comment) => ({ ...comment }));
  });
}


appBootstrap = createAppBootstrap({
  state, popularPrompts, savedPrompts, isBackendNumericId, makePreview, normalizeMakeFolders,
  normalizePersistedLikeCounts, normalizeRecentThreads, updateBackendHomePageMeta, upsertPrompt,
  canUseDemoFallback, clearAuthenticatedSession, getApiFailureMessage, getAuthToken,
  hasBackendAuthToken, getMakeApi, getMakeApiToken, getMakeInteractionVersion: () => makeInteractionVersion,
  getValidSearchScope, handleBackendAccessError, homePageSize: HOME_PAGE_SIZE, render,
  isMakeThinking: () => isMakeThinking, hydrateBackendMakeDataEffect, hydrateBackendMyPageDataEffect,
  formatShortDate, getReportRecord, mapBackendReportStatus, hydrateBackendAdminData,
  reportWarning,
  hydrateBackendHomeDataEffect, refreshBackendHomePromptsEffect, loadPersistedState, normalizeDemoCopy,
  normalizeAssistantPromptOutputs, ensureDemoComments,
});
const bootstrapResult = appBootstrap.bootstrap();
const needsAdminRuntime = state.adminMode || state.route === "admin";
const needsShareRuntime = state.route === "share";
const needsMakeRuntime = state.route === "make";
const routeRuntime = needsAdminRuntime
  ? ensureAdminRuntime()
  : needsShareRuntime
    ? ensureShareRuntime()
    : needsMakeRuntime
      ? ensureMakeRuntime()
      : Promise.resolve(true);
const routeReady = routeRuntime.then((loaded) => {
  if (loaded) render();
  return loaded;
});
const hydration = Promise.all([Promise.resolve(bootstrapResult), routeReady]).then(([result]) => result);
const markApplicationReady = () => {
  document.documentElement.dataset.ttalkakReady = "true";
  document.dispatchEvent(new CustomEvent("ttalkak:ready"));
};
if (needsAdminRuntime || needsShareRuntime || needsMakeRuntime) routeReady.finally(markApplicationReady);
else markApplicationReady();
return hydration;
}

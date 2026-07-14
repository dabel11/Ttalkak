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

normalizeSavedPromptOwnership();

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
    id: "coding",
    label: "코딩 질문",
    prompt: "목적: 코딩 문제를 해결하고 싶습니다.\n사용 언어/프레임워크:\n현재 상황:\n문제 증상:\n시도해본 방법:\n에러 메시지/로그:\n원하는 결과:",
  },
  {
    id: "email",
    label: "이메일",
    prompt: "목적: 이메일을 작성하고 싶습니다.\n받는 사람:\n상황:\n전달할 핵심 내용:\n원하는 톤:\n반드시 포함할 내용:\n원하는 결과:",
  },
  {
    id: "blog",
    label: "블로그",
    prompt: "목적: 블로그 글을 작성하고 싶습니다.\n주제:\n타겟 독자:\n핵심 키워드:\n글의 톤:\n포함할 소제목/구성:\n원하는 분량:",
  },
  {
    id: "summary",
    label: "요약",
    prompt: "목적: 내용을 요약하고 싶습니다.\n요약할 원문/자료:\n요약 대상 독자:\n원하는 요약 길이:\n반드시 남길 핵심:\n제외할 내용:\n출력 형식:",
  },
  {
    id: "marketing",
    label: "마케팅",
    prompt: "목적: 마케팅 문구를 만들고 싶습니다.\n제품/서비스:\n타겟 고객:\n핵심 장점:\n고객의 고민:\n원하는 톤:\nCTA:\n사용 채널:",
  },
];

const FREE_MAKE_LIMIT = 3;
const STORAGE_KEY = "prompt_hub_web_state_v2";
const AUTH_TOKEN_KEY = "ttalkak_access_token";
const DEMO_AUTH_TOKEN = "demo-token";
const PROTECTED_BACKEND_ACTIONS = new Set([
  "addComment",
  "addReply",
  "deleteComment",
  "deleteMakeFolder",
  "deletePrompt",
  "likeComment",
  "likePrompt",
  "reportComment",
  "reportPrompt",
  "savePrompt",
  "unlikeComment",
  "unlikePrompt",
  "unsavePrompt",
  "unsharePrompt",
  "updateComment",
  "updateMakeFolder",
]);
const SAVED_PAGE_SIZE = 16;
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

const state = {
  route: "home",
  authView: null,
  detailPromptId: null,
  detailHighlightCommentId: null,
  reportPromptId: null,
  reportCommentId: null,
  editingPromptId: null,
  adminRequestTargetKey: null,
  editingMessageId: null,
  executeMessageId: null,
  executePromptId: null,
  confirmAction: null,
  hideReportedPrompts: false,
  adminMode: false,
  adminHiddenPromptIds: new Set(),
  adminTagDecisions: {},
  adminTab: "reports",
  adminPromptQuery: "",
  adminPromptFilter: "all",
  adminTagQuery: "",
  adminTagFilter: "all",
  adminTagSort: "usage",
  adminUserQuery: "",
  adminUserActivityNickname: "",
  adminPromptRevisionRequests: {},
  reportRecords: {},
  isLoggedIn: false,
  currentUser: null,
  currentUserId: null,
  currentUserRole: "user",
  authToken: "",
  token: "",
  isComposingSearch: false,
  isComposingShareTag: false,
  isComposingAdminPromptSearch: false,
  isComposingAdminTagSearch: false,
  authDraft: {},
  authDuplicateChecks: {},
  authUserIdWarning: "",
  libraryDemoSeeded: false,
  userLibraryPromptIds: new Set(),
  searchTipShown: false,
  searchTipVisible: false,
  openFolderMenuId: null,
  openThreadMenuId: null,
  creatingThreadFolderId: null,
  openPromptCardMenuId: null,
  searchScope: "all",
  searchQuery: "",
  backendPopularTags: [],
  backendStatus: "checking",
  backendStatusMessage: "백엔드 연결 확인 중",
  myBackendStatus: "idle",
  adminBackendStatus: "idle",
  backendMyPrompts: [],
  backendMyComments: [],
  backendMyReports: [],
  backendLibraryPromptIds: new Set(),
  backendAdminReports: [],
  backendAdminTags: [],
  makeBackendStatus: "idle",
  makeBackendMessage: "",
  popularSort: "popular",
  popularPage: 1,
  savedPage: 1,
  savedSort: "recent",
  myPageTab: "library",
  shareError: "",
  shareTagQuery: "",
  notice: "",
  expandedComments: {},
  replyingCommentId: null,
  editingCommentId: null,
  likedPromptIds: new Set(),
  likedCommentIds: new Set(),
  reportedPromptIds: new Set(),
  reportedCommentIds: new Set(),
  pendingUnsaveIds: new Set(),
  composerDraft: "",
  templateCollapsed: false,
  guestImproveCount: 0,
  shareDraft: null,
  savedFilter: { community: true, mine: true, liked: false },
  messages: [],
  recentThreads: [],
  makeFolders: [{ id: "uncategorized", name: "미분류" }],
  activeFolderId: "all",
  creatingFolder: false,
  editingFolderId: null,
  activeThreadId: null,
  copiedMessageId: "",
};

let searchCommitTimer = null;
let adminPromptSearchCommitTimer = null;
let adminTagSearchCommitTimer = null;
let searchTipTimer = null;
let pendingMessageScrollId = null;
let pendingLatestMessageScrollId = null;

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
  persistState();
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      ${Sidebar()}
      <main class="main-area">
        ${Header()}
        <section class="content-area">${Page()}</section>
      </main>
      ${state.detailPromptId ? PromptDetailModal() : ""}
      ${state.editingPromptId ? PromptEditModal() : ""}
      ${state.adminRequestTargetKey ? AdminRevisionRequestModal() : ""}
      ${state.authView ? AuthModal() : ""}
      ${state.reportPromptId || state.reportCommentId ? ReportModal() : ""}
      ${state.executeMessageId || state.executePromptId ? ExecuteModal() : ""}
      ${state.confirmAction ? ConfirmModal() : ""}
      ${state.notice ? `<div class="toast" role="status">${state.notice}</div>` : ""}
    </div>
  `;
  bindEvents();
  focusActiveModal();
  restorePendingMessageScroll();
  scrollToPendingLatestMessage();
  scrollToHighlightedComment();
  hydrateBackendMakeDataIfNeeded();
  hydrateBackendMyPageDataIfNeeded();
  hydrateBackendAdminDataIfNeeded();
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
  if (pendingMessageScrollId || !pendingLatestMessageScrollId) return;
  const messageId = pendingLatestMessageScrollId;
  pendingLatestMessageScrollId = null;
  requestAnimationFrame(() => {
    const safeId = String(messageId).replace(/"/g, '\\"');
    const target = document.querySelector(`[data-message-id="${safeId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

function navigateTo(route) {
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
  window.clearTimeout(searchCommitTimer);
  state.searchScope = "all";
  state.searchQuery = "";
  state.popularPage = 1;
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
}

function closeTopModal() {
  if (state.confirmAction) {
    state.confirmAction = null;
  } else if (state.executeMessageId) {
    state.executeMessageId = null;
  } else if (state.executePromptId) {
    state.executePromptId = null;
  } else if (state.reportPromptId) {
    state.reportPromptId = null;
  } else if (state.reportCommentId) {
    state.reportCommentId = null;
  } else if (state.authView) {
    state.authView = null;
  } else if (state.adminRequestTargetKey) {
    state.adminRequestTargetKey = null;
  } else if (state.editingPromptId) {
    state.editingPromptId = null;
  } else if (state.detailPromptId) {
    state.detailPromptId = null;
    state.detailHighlightCommentId = null;
  } else {
    return;
  }

  render();
}

function focusActiveModal() {
  window.setTimeout(() => {
    const modals = document.querySelectorAll(".modal");
    const modal = modals[modals.length - 1];
    if (modal?.classList.contains("prompt-detail-modal")) return;

    const focusable = modal?.querySelector("input, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
  }, 0);
}

function Sidebar() {
  const item = (route, label, icon) => `
    <button class="nav-item ${state.route === route ? "active" : ""}" data-route="${route}">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
  const adminIcons = {
    reports: icons.siren,
    prompts: icons.edit,
    tags: icons.hash,
    users: icons.user,
  };
  const adminItem = (tab) => `
    <button class="nav-item admin-nav-item ${state.adminTab === tab.id ? "active" : ""}" type="button" data-admin-tab="${tab.id}">
      <span class="nav-icon">${adminIcons[tab.id] || icons.shield}</span>
      <span>${tab.label}</span>
      ${tab.hideCount ? "" : `<em>${formatNumber(tab.count)}</em>`}
    </button>
  `;
  const showAdminShell = state.adminMode;
  const adminTabs = showAdminShell ? getAdminTabs() : [];

  return `
    <aside class="sidebar" aria-label="주요 메뉴">
      <nav class="nav-list">
        ${
          showAdminShell
            ? adminTabs.map(adminItem).join("")
            : `
              ${item("home", "Home", icons.home)}
              ${!isAdminAccount() ? item("make", "Make", icons.make) : ""}
              ${state.isLoggedIn && !isAdminAccount() ? item("saved", "My page", icons.user) : ""}
              ${!isAdminAccount() ? item("share", "Share", icons.share) : ""}
            `
        }
      </nav>
    </aside>
  `;
}

function getAdminTabs() {
  const reportRecords = getAdminReportRecords();
  const allPrompts = getUniquePrompts([...popularPrompts, ...savedPrompts]);
  const adminPromptQuery = state.adminPromptQuery || "";
  const adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(state.adminPromptFilter)
    ? state.adminPromptFilter
    : "all";
  const filteredAdminPrompts = allPrompts
    .filter((prompt) => matchesAdminPromptFilter(prompt, adminPromptFilter))
    .filter((prompt) => matchesAdminPromptQuery(prompt, adminPromptQuery));
  const adminTags = getAdminManagedTags();

  return [
    { id: "reports", label: "신고 관리", count: reportRecords.length },
    { id: "prompts", label: "프롬프트 관리", count: filteredAdminPrompts.length },
    { id: "tags", label: "태그 관리", count: adminTags.length },
    { id: "users", label: "사용자 활동", count: 0, hideCount: true },
  ];
}

function Header() {
  const remaining = Math.max(0, FREE_MAKE_LIMIT - state.guestImproveCount);
  const canUseReportTools = (state.isLoggedIn && !isAdminAccount()) || state.adminMode;
  const hasReportedPrompts = canUseReportTools && state.reportedPromptIds.size > 0;
  const showPromptTools = canUseReportTools && (state.route === "home" || state.route === "saved");
  const adminAccessButton = isAdminAccount()
    ? `<button class="topbar-tool ${state.adminMode ? "active" : ""}" type="button" data-toggle-admin-demo title="${state.adminMode ? "일반 화면을 읽기 전용으로 확인합니다." : "관리자 운영 화면으로 이동합니다."}" aria-label="관리자 화면 전환">${state.adminMode ? "사용자 화면 보기" : "관리자 화면"}</button>`
    : "";
  const authButton = state.isLoggedIn
    ? `<div class="account-actions">${adminAccessButton}<button class="topbar-tool" type="button" data-open-auth="withdraw">회원탈퇴</button><button class="login-button logged-in" type="button" data-logout>${escapeHtml(state.currentUser || "사용자")}님 · 로그아웃</button></div>`
    : `<button class="login-button" type="button" data-open-auth="login">로그인</button>`;

  return `
    <header class="topbar">
      <button class="brand" data-route="home" aria-label="TTALKAK 홈">
        <span class="brand-mark">T</span>
        <span>TTALKAK</span>
      </button>
      <div class="topbar-auth">
        ${authButton}
        ${BackendStatusBadge()}
        ${
          showPromptTools
            ? `<div class="topbar-tools">
                <button class="topbar-tool ${state.hideReportedPrompts ? "active" : ""}" type="button" data-toggle-reported ${hasReportedPrompts ? "" : "disabled"}>${state.hideReportedPrompts ? "신고 숨김 해제" : "신고 숨김"}</button>
                <button class="topbar-tool" type="button" data-reset-demo>데모 초기화</button>
              </div>`
            : ""
        }
        ${state.route === "make" && !state.isLoggedIn ? `<p class="make-auth-hint">비로그인 체험 ${remaining}/${FREE_MAKE_LIMIT}회 남음<br />로그인하면 제한 없이 저장하고 이어서 사용할 수 있습니다.</p>` : ""}
      </div>
    </header>
  `;
}

function Page() {
  if (state.adminMode) return AdminPage();
  if (isAdminAccount() && !["home", "admin"].includes(state.route)) {
    state.route = "home";
    return HomePage();
  }
  if (state.route === "make") return MakePage();
  if (state.route === "saved") {
    if (isAdminAccount()) {
      state.route = "home";
      return HomePage();
    }
    if (state.isLoggedIn) return SavedPage();
    state.route = "home";
    state.authView = "login";
    return HomePage();
  }
  if (state.route === "share") return SharePage();
  if (state.route === "admin") return AdminPage();
  return HomePage();
}

function HomePage() {
  const prompts = applyReportedVisibility(getVisiblePopularPrompts());
  const popularTags = getPopularTags(applyReportedVisibility(sortPopularPrompts(getUniquePrompts(popularPrompts))));
  const displayTags = state.backendPopularTags.length ? state.backendPopularTags : popularTags.length ? popularTags : fallbackPopularTags;
  const searchCriteria = parsePromptSearchQuery(state.searchQuery, state.searchScope);
  const totalPages = getPopularTotalPages(prompts.length);
  const currentPage = Math.min(state.popularPage, totalPages);
  const pagePrompts = prompts.slice((currentPage - 1) * 16, currentPage * 16);
  const isSearching = state.searchQuery.trim().length > 0;
  const searchPlaceholder = getSearchPlaceholder(state.searchScope);

  return `
    <section class="home-page" aria-labelledby="popular-heading">
      <label class="search-field">
        <span>${icons.search}</span>
        <span class="search-scope-select">
          <select data-search-scope aria-label="검색 대상">
            ${SearchScopeOption("all", "전체")}
            ${SearchScopeOption("tag", "해시태그")}
            ${SearchScopeOption("keyword", "키워드")}
            ${SearchScopeOption("author", "작성자")}
          </select>
        </span>
        <input type="search" data-tag-search value="${escapeHtml(state.searchQuery)}" placeholder="${searchPlaceholder}" aria-label="프롬프트 검색" />
        <button class="search-help ${state.searchTipVisible ? "show-tip" : ""}" type="button" data-search-help aria-label="검색 도움말">
          <span>${icons.bulb}</span>
          <small role="tooltip">검색어는 쉼표로 구분해 여러 개를 함께 검색할 수 있습니다. 전체 검색에서는 태그, 키워드, 작성자를 함께 찾습니다.</small>
        </button>
      </label>
      <div class="popular-tags" aria-label="인기 태그">
        ${displayTags.map((tag) => `<button class="${searchCriteria.tagTokens.includes(normalizeTag(tag)) ? "active" : ""}" type="button" data-popular-tag="${tag}">#${tag}</button>`).join("")}
      </div>
      <div class="section-title">
        <div class="section-title-main">
          <span class="section-icon">↗</span>
          <h1 id="popular-heading">${isSearching ? "검색 결과" : "인기 프롬프트"}</h1>
        </div>
        <label class="sort-select">
          <span class="sr-only">정렬</span>
          <select data-popular-sort aria-label="프롬프트 정렬 기준">
            ${SortOption("popular", "인기")}
            ${SortOption("saves", "저장")}
            ${SortOption("comments", "댓글")}
            ${SortOption("likes", "좋아요")}
            ${SortOption("latest", "최신")}
          </select>
        </label>
      </div>
      ${
        pagePrompts.length
          ? `<div class="prompt-grid" aria-label="인기 프롬프트 목록">${pagePrompts.map((prompt) => PromptCard(prompt, { showStatus: false })).join("")}</div>
             ${Pagination(totalPages, currentPage)}`
          : `<div class="empty-state search-empty">
              <span>${icons.search}</span>
              <p>일치하는 프롬프트가 없습니다.</p>
            </div>`
      }
    </section>
  `;
}

function SortOption(value, label) {
  return `<option value="${value}" ${state.popularSort === value ? "selected" : ""}>${label}</option>`;
}

function SearchScopeOption(value, label) {
  return `<option value="${value}" ${state.searchScope === value ? "selected" : ""}>${label}</option>`;
}

function getSearchPlaceholder(scope) {
  if (scope === "tag") return "해시태그를 입력하세요...";
  if (scope === "keyword") return "프롬프트 제목이나 내용을 검색하세요...";
  if (scope === "author") return "작성자 닉네임을 입력하세요...";
  return "프롬프트를 검색하세요...";
}

function Pagination(totalPages, currentPage) {
  if (totalPages <= 1) return "";

  return `
    <nav class="pagination" aria-label="인기 프롬프트 페이지">
      ${Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        return `<button class="page-button ${page === currentPage ? "active" : ""}" type="button" data-page="${page}" aria-label="${page}페이지">${page}</button>`;
      }).join("")}
    </nav>
  `;
}

function normalizeSavedPromptOwnership() {
  savedPrompts.forEach((prompt) => {
    if (prompt.savedByMe != null) return;
    prompt.savedByMe = prompt.source === "community" || (!prompt.isShared && prompt.saves > 0);
  });
  normalizeSavedCounts();
}

function isPromptSaved(promptId) {
  if (!state.isLoggedIn) return false;
  const prompt = savedPrompts.find((item) => item.id === promptId);
  if (isHiddenDemoLibraryPrompt(prompt)) return false;
  return Boolean(prompt?.savedByMe) && !state.pendingUnsaveIds.has(promptId);
}

function isHiddenDemoLibraryPrompt(prompt) {
  return Boolean(prompt && DEMO_LIBRARY_PROMPT_IDS.has(prompt.id) && !state.libraryDemoSeeded && !state.userLibraryPromptIds.has(prompt.id));
}

function getPromptSaveCount(prompt) {
  const saves = Number(prompt?.saves || 0);
  return isPromptSaved(prompt?.id) ? Math.max(1, saves) : saves;
}

function normalizeSavedCounts() {
  savedPrompts.forEach((prompt) => {
    if (prompt.savedByMe && Number(prompt.saves || 0) < 1) {
      prompt.saves = 1;
    }
  });
}

function isPromptPendingUnsave(promptId) {
  return state.pendingUnsaveIds.has(promptId);
}

function commitPendingUnsaves(nextRoute = state.route, nextMyPageTab = state.myPageTab) {
  const staysInLibrary = state.route === "saved" && nextRoute === "saved" && state.myPageTab === "library" && nextMyPageTab === "library";
  if (state.route !== "saved" || staysInLibrary || state.pendingUnsaveIds.size === 0) return;

  state.pendingUnsaveIds.forEach((promptId) => {
    if (isBackendNumericId(promptId)) callBackendApi("unsavePrompt", promptId).then(refreshMyPageDataAfterMutation);
    const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);
    if (savedIndex >= 0) {
      if (savedPrompts[savedIndex].source === "mine") {
        savedPrompts[savedIndex].savedByMe = false;
      } else {
        savedPrompts.splice(savedIndex, 1);
      }
      state.userLibraryPromptIds.delete(promptId);
    }
    if (state.detailPromptId === promptId && !findPromptById(promptId)) {
      state.detailPromptId = null;
    }
  });

  state.pendingUnsaveIds.clear();
  normalizeSavedPage();
}

function PromptCard(prompt, options = {}) {
  const isSaved = isPromptSaved(prompt.id);
  const isPendingUnsave = isPromptPendingUnsave(prompt.id);
  const isMine = state.isLoggedIn && prompt.source === "mine";
  const canDelete = isMine;
  const isLiked = state.likedPromptIds.has(prompt.id);
  const isReported = canShowReportedState() && state.reportedPromptIds.has(prompt.id);
  const isShared = prompt.isShared === true || prompt.source === "community";
  const revisionRequest = canDelete ? getPromptRevisionRequest(prompt.id) : null;
  const hasMakeHistory = isMine && Array.isArray(prompt.messages) && prompt.messages.length > 0;
  const commentCount = getPromptCommentCount(prompt);
  const showStatus = options.showStatus !== false;
  const isCardMenuOpen = state.openPromptCardMenuId === prompt.id;
  const previewTags = getPromptCardPreviewTags(prompt.tags || []);
  const statusBadges = [
    isMine
      ? `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`
      : "",
    isMine && getPromptRevisionRequest(prompt.id) ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : "",
    isPendingUnsave ? `<span class="status-badge pending-unsave">저장 취소 예정</span>` : "",
  ].join("");

  return `
    <article class="prompt-card ${isMine ? "mine-card" : ""} ${isReported ? "reported-card" : ""} ${isPendingUnsave ? "pending-unsave-card" : ""}" data-open-prompt="${prompt.id}" tabindex="0" role="button" aria-label="${prompt.title} 전체 보기">
      <div class="card-head">
        <h2>${prompt.title}</h2>
        <div class="card-actions">
          ${
            isMine
              ? `<div class="prompt-card-menu-wrap">
                  <button class="icon-button prompt-card-more" type="button" data-prompt-card-menu="${prompt.id}" aria-label="프롬프트 더보기" aria-expanded="${isCardMenuOpen ? "true" : "false"}">${icons.more}</button>
                  ${
                    isCardMenuOpen
                      ? `<div class="prompt-card-menu" role="menu">
                          <button type="button" data-edit-prompt="${prompt.id}" role="menuitem">${icons.edit}<span>수정</span></button>
                          ${!isShared ? `<button type="button" data-share-saved="${prompt.id}" role="menuitem">${icons.share}<span>공유하기</span></button>` : ""}
                          ${isShared ? `<button type="button" data-unshare-prompt="${prompt.id}" role="menuitem">${icons.share}<span>공유 취소</span></button>` : ""}
                          <button type="button" data-delete-prompt="${prompt.id}" role="menuitem">${icons.trash}<span>삭제</span></button>
                        </div>`
                      : ""
                  }
                </div>`
              : ""
          }
          ${hasMakeHistory ? `<button class="history-card-button" data-open-make-history="${prompt.id}" aria-label="Make 대화 보기">${icons.make}<span>대화 보기</span></button>` : ""}
          <button class="icon-button metric-action like-card-button ${isLiked ? "liked" : ""}" data-like-prompt="${prompt.id}" aria-label="좋아요">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
          <button class="icon-button metric-action comment-card-button" data-open-comments="${prompt.id}" aria-label="댓글 보기">${icons.comment}<span>${formatNumber(commentCount)}</span></button>
          <button class="icon-button metric-action save-card-button ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
        </div>
      </div>
      ${showStatus && statusBadges ? `<div class="status-row">${statusBadges}</div>` : ""}
      <p>${prompt.text}</p>
      <div class="tag-row card-tag-row">
        ${previewTags.visibleTags.map((tag) => `<button type="button" data-search-tag="${escapeHtml(tag)}">#${tag}</button>`).join("")}
        ${previewTags.hiddenCount > 0 ? `<span class="tag-more">+${previewTags.hiddenCount}</span>` : ""}
      </div>
      <footer class="card-meta">
        <span>${icons.eye}${formatNumber(prompt.views)}</span>
        <button class="author-search-button" type="button" data-search-author="${escapeHtml(getDisplayPromptAuthor(prompt))}">${escapeHtml(getDisplayPromptAuthor(prompt))}</button>
      </footer>
    </article>
  `;
}

function BackendStatusBadge() {
  const status = state.backendStatus || "checking";
  const message = state.backendStatusMessage || "백엔드 연결 확인 중";
  const label = status === "connected" ? "Backend 연결됨" : status === "fallback" ? "Demo data 표시 중" : "Backend 확인 중";
  return `
    <div class="backend-status backend-status-${status}" title="${escapeHtml(message)}" aria-label="${escapeHtml(message)}">
      <span class="backend-status-dot" aria-hidden="true"></span>
      <span>${label}</span>
    </div>
  `;
}

function getPromptCardPreviewTags(tags) {
  const normalizedTags = Array.isArray(tags) ? tags : [];
  return {
    visibleTags: normalizedTags.slice(0, 3),
    hiddenCount: Math.max(0, normalizedTags.length - 3),
  };
}

function PromptDetailModal() {
  const prompt = findPromptById(state.detailPromptId);
  if (!prompt) return "";

  const isSaved = isPromptSaved(prompt.id);
  const isPendingUnsave = isPromptPendingUnsave(prompt.id);
  const canDelete = state.isLoggedIn && prompt.source === "mine";
  const comments = getSortedPromptComments(prompt.id);
  const commentCount = getPromptCommentCount(prompt);
  const isCommentsExpanded = Boolean(state.expandedComments[prompt.id]);
  const visibleComments = isCommentsExpanded ? comments : comments.slice(0, 3);
  const isLiked = state.likedPromptIds.has(prompt.id);
  const isReported = canShowReportedState() && state.reportedPromptIds.has(prompt.id);
  const isShared = prompt.isShared === true || prompt.source === "community";
  const isAdminReview = Boolean(state.adminMode);
  const isHiddenByAdmin = state.adminHiddenPromptIds.has(prompt.id);
  const revisionRequest = canDelete || isAdminReview ? getPromptRevisionRequest(prompt.id) : null;
  const adminStatusBadges = isAdminReview
    ? [
        `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`,
        isHiddenByAdmin ? `<span class="status-badge private">숨김</span>` : "",
        isReported ? `<span class="status-badge pending-unsave">신고됨</span>` : "",
        revisionRequest ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : "",
      ].join("")
    : "";

  return `
    <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="prompt-detail-title">
      <article class="modal prompt-detail-modal ${isAdminReview ? "admin-review-modal" : ""}">
        <div class="modal-head">
          <h2 id="prompt-detail-title">${prompt.title}</h2>
        </div>
        <div class="prompt-detail-layout">
          <section class="prompt-detail-main" aria-label="프롬프트 내용">
            ${isAdminReview && adminStatusBadges ? `<div class="status-row admin-detail-status">${adminStatusBadges}</div>` : ""}
            <p class="prompt-detail-text">${prompt.text}</p>
            ${
              revisionRequest
                ? `<div class="revision-request-notice">
                    <strong>수정 요청됨</strong>
                    <p>${escapeHtml(revisionRequest.reason)}</p>
                  </div>`
                : ""
            }
            <div class="tag-row detail-tags">${prompt.tags.map((tag) => `<button type="button" data-search-tag="${escapeHtml(tag)}">#${tag}</button>`).join("")}</div>
            <footer class="card-meta detail-meta">
              <span>${icons.eye}${formatNumber(prompt.views)}</span>
              ${
                isAdminReview
                  ? `<button class="author-search-button admin-author-lookup-button" type="button" data-admin-user-author="${escapeHtml(getDisplayPromptAuthor(prompt))}">${escapeHtml(getDisplayPromptAuthor(prompt))}</button>`
                  : `<button class="author-search-button" type="button" data-search-author="${escapeHtml(getDisplayPromptAuthor(prompt))}">${escapeHtml(getDisplayPromptAuthor(prompt))}</button>`
              }
              <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
            </footer>
          </section>
          <section class="comments-panel" aria-label="댓글">
            <div class="comments-head">
              <h3>댓글</h3>
              <div class="comments-head-actions">
                <span>${formatNumber(commentCount)}개</span>
                <button class="comment-panel-toggle" type="button" data-toggle-comments="${prompt.id}">${isCommentsExpanded ? "접기" : "펼치기"}</button>
              </div>
            </div>
            ${
              isCommentsExpanded
                ? `<div class="comment-list">
                    ${
                      visibleComments.length
                        ? visibleComments.map(CommentItem).join("")
                        : `<p class="comment-empty">아직 표시할 댓글이 없습니다.</p>`
                    }
                  </div>
                  ${
                    isAdminReview
                      ? `<p class="comment-empty">관리자 검토 모드에서는 댓글을 읽기 전용으로 확인합니다.</p>`
                      : state.isLoggedIn
                      ? `<form class="comment-form" data-comment-form="${prompt.id}">
                          <input name="comment" type="text" placeholder="댓글을 입력하세요." autocomplete="off" />
                          <button class="primary-button" type="submit">등록</button>
                        </form>`
                      : `<div class="comment-login">
                          <span>댓글을 작성하려면 로그인이 필요합니다.</span>
                          <button class="secondary-button" type="button" data-open-auth="login">로그인</button>
                        </div>`
                  }`
                : ""
            }
          </section>
        </div>
        <div class="modal-actions detail-actions">
          ${
            isAdminReview
              ? `<div class="detail-action-group manage-actions">
                   <button class="secondary-button" type="button" data-admin-request-revision="prompt:${prompt.id}">수정 요청</button>
                   <button class="secondary-button" type="button" data-admin-hide-prompt="${prompt.id}">${isHiddenByAdmin ? "게시물 숨김 해제" : "게시물 숨김"}</button>
                   <button class="secondary-button danger-button" type="button" data-admin-delete-prompt="${prompt.id}">삭제</button>
                 </div>
                 <div class="detail-action-group use-actions">
                   <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
                 </div>`
              : `<div class="detail-action-group manage-actions">
                   ${canDelete ? `<button class="secondary-button" type="button" data-edit-prompt="${prompt.id}">${icons.edit}<span>수정</span></button>` : ""}
                   ${canDelete && !isShared ? `<button class="secondary-button" type="button" data-share-saved="${prompt.id}">${icons.share}<span>공유하기</span></button>` : ""}
                   ${canDelete && isShared ? `<button class="secondary-button" type="button" data-unshare-prompt="${prompt.id}">${icons.share}<span>공유 취소</span></button>` : ""}
                   ${canDelete ? `<button class="secondary-button danger-button" type="button" data-delete-prompt="${prompt.id}">${icons.trash}<span>삭제</span></button>` : ""}
                 </div>
                 <div class="detail-action-group use-actions">
                   <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
                   <button class="detail-action-button execute-action" type="button" data-execute-prompt="${prompt.id}" aria-label="AI 적용">${icons.play}<span>Execute</span></button>
                   <button class="detail-action-button like-action ${isLiked ? "liked" : ""}" type="button" data-like-prompt="${prompt.id}" aria-label="${isLiked ? "좋아요 취소" : "좋아요"}">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
                   <button class="detail-action-button save-action ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" type="button" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : isSaved ? "저장 취소" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
                   <button class="detail-action-button report-action report-state-button ${isReported ? "reported" : ""}" type="button" data-report-prompt="${prompt.id}" aria-label="${isReported ? "신고됨" : "신고"}">${icons.flag}</button>
                 </div>`
          }
        </div>
      </article>
    </div>
  `;
}

function PromptEditModal() {
  const prompt = findPromptById(state.editingPromptId);
  if (!prompt || prompt.source !== "mine") return "";

  return `
    <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="prompt-edit-title">
      <form class="modal prompt-edit-modal" data-prompt-edit-form="${prompt.id}">
        <div class="modal-head">
          <h2 id="prompt-edit-title">프롬프트 수정</h2>
          <button class="ghost-icon" type="button" data-close-prompt-edit aria-label="닫기">${icons.close}</button>
        </div>
        <label>
          <span>제목</span>
          <input name="title" type="text" value="${escapeHtml(prompt.title)}" />
        </label>
        <label>
          <span>프롬프트</span>
          <textarea name="text" rows="8">${escapeHtml(prompt.text)}</textarea>
        </label>
        <label>
          <span>해시태그</span>
          <input name="tags" type="text" value="${escapeHtml((prompt.tags || []).join(", "))}" />
        </label>
        <div class="form-actions">
          <button class="secondary-button" type="button" data-close-prompt-edit>취소</button>
          <button class="primary-button" type="submit">저장</button>
        </div>
      </form>
    </div>
  `;
}

function AdminRevisionRequestModal() {
  const target = getRevisionRequestTarget(state.adminRequestTargetKey);
  if (!target || !state.adminMode) return "";

  const existingRequest = state.adminPromptRevisionRequests[target.key];

  return `
    <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="revision-request-title">
      <form class="modal prompt-edit-modal revision-request-modal" data-admin-revision-request-form="${target.key}">
        <div class="modal-head">
          <h2 id="revision-request-title">수정 요청</h2>
          <button class="ghost-icon" type="button" data-close-revision-request aria-label="닫기">${icons.close}</button>
        </div>
        <div class="revision-request-target">
          <strong>${escapeHtml(target.title)}</strong>
          <p>${escapeHtml(truncateText(target.text, 120))}</p>
        </div>
        <label>
          <span>작성자에게 전달할 요청 사유</span>
          <textarea name="reason" rows="6" placeholder="예: 과장된 표현을 줄이고 출처나 조건을 명확히 적어주세요.">${escapeHtml(existingRequest?.reason || "")}</textarea>
        </label>
        <div class="form-actions">
          <button class="secondary-button" type="button" data-close-revision-request>취소</button>
          <button class="primary-button" type="submit">요청 보내기</button>
        </div>
      </form>
    </div>
  `;
}

function CommentItem(comment) {
  const isDeleted = Boolean(comment.deleted);
  const canDelete = !isDeleted && canDeleteComment(comment);
  const isReported = canShowReportedState() && state.reportedCommentIds.has(comment.id);
  const isLiked = state.likedCommentIds.has(comment.id);
  const isAdminReview = Boolean(state.adminMode);
  const isHighlighted = isAdminReview && state.detailHighlightCommentId === comment.id;
  const replies = getSortedCommentReplies(comment);
  const isReplying = !isDeleted && state.replyingCommentId === comment.id;
  const isEditing = !isDeleted && !isAdminReview && state.editingCommentId === comment.id;

  return `
    <article class="comment-item ${isDeleted ? "deleted-comment" : ""} ${isReported ? "reported-comment" : ""} ${isHighlighted ? "admin-highlighted-comment" : ""}" data-comment-id="${escapeHtml(comment.id)}">
      <div class="comment-item-head">
        <strong>${isDeleted ? "삭제된 댓글" : comment.author}</strong>
        ${
          isAdminReview || isDeleted
            ? ""
            : `<div class="comment-actions">
                ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${comment.id}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "댓글 좋아요 취소" : "댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(comment))}</span></button>`}
                <button class="comment-reply-button" type="button" data-reply-comment="${comment.id}" title="답글" aria-label="답글">${icons.comment}</button>
                ${
                  canDelete
                    ? `<button class="comment-edit-button" type="button" data-edit-comment="${comment.id}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                       <button class="comment-delete-button" type="button" data-delete-comment="${comment.id}" title="삭제" aria-label="댓글 삭제">${icons.trash}</button>`
                    : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${comment.id}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "댓글 신고"}">${icons.flag}</button>`
                }
              </div>`
        }
      </div>
      ${
        isEditing
          ? `<form class="comment-edit-form" data-edit-comment-form="${comment.id}">
              <input name="comment" type="text" value="${escapeHtml(comment.text)}" autocomplete="off" />
              <button class="primary-button" type="submit">저장</button>
            </form>`
          : `<p>${isDeleted ? "삭제된 댓글입니다." : comment.text}${!isDeleted && comment.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
      }
      ${
        replies.length || (!isAdminReview && isReplying)
          ? `<div class="reply-thread">
              ${replies.map(ReplyItem).join("")}
              ${
                !isAdminReview && isReplying
                  ? `<form class="reply-form" data-reply-form="${comment.id}">
                      <input name="reply" type="text" placeholder="답글을 입력하세요." autocomplete="off" />
                      <button class="primary-button" type="submit">등록</button>
                    </form>`
                  : ""
              }
            </div>`
          : ""
      }
    </article>
  `;
}

function ReplyItem(reply) {
  const isDeleted = Boolean(reply.deleted);
  const canDelete = !isDeleted && canDeleteComment(reply);
  const isReported = canShowReportedState() && state.reportedCommentIds.has(reply.id);
  const isLiked = state.likedCommentIds.has(reply.id);
  const isAdminReview = Boolean(state.adminMode);
  const isHighlighted = isAdminReview && state.detailHighlightCommentId === reply.id;
  const isEditing = !isDeleted && !isAdminReview && state.editingCommentId === reply.id;

  return `
    <article class="reply-item ${isDeleted ? "deleted-comment" : ""} ${isReported ? "reported-reply" : ""} ${isHighlighted ? "admin-highlighted-comment" : ""}" data-comment-id="${escapeHtml(reply.id)}">
      <div class="reply-item-head">
        <strong>${isDeleted ? "삭제된 댓글" : reply.author}</strong>
        ${
          isAdminReview || isDeleted
            ? ""
            : `<div class="reply-actions">
                ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${reply.id}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "대댓글 좋아요 취소" : "대댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(reply))}</span></button>`}
                ${
                  canDelete
                    ? `<button class="comment-edit-button" type="button" data-edit-comment="${reply.id}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                       <button class="comment-delete-button" type="button" data-delete-comment="${reply.id}" title="삭제" aria-label="답글 삭제">${icons.trash}</button>`
                    : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${reply.id}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "대댓글 신고"}">${icons.flag}</button>`
                }
              </div>`
        }
      </div>
      ${
        isEditing
          ? `<form class="comment-edit-form" data-edit-comment-form="${reply.id}">
              <input name="comment" type="text" value="${escapeHtml(reply.text)}" autocomplete="off" />
              <button class="primary-button" type="submit">저장</button>
            </form>`
          : `<p>${isDeleted ? "삭제된 댓글입니다." : reply.text}${!isDeleted && reply.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
      }
    </article>
  `;
}

function ReportModal() {
  const prompt = findPromptById(state.reportPromptId);
  const comment = findCommentById(state.reportCommentId);
  const target = prompt || comment;
  if (!target) return "";
  const reportType = prompt ? "prompt" : "comment";
  const title = prompt ? "프롬프트 신고" : "댓글 신고";
  const helper = prompt
    ? "정말 이 프롬프트를 신고할까요? 신고 이유를 적어주시면 검토에 도움이 됩니다."
    : "정말 이 댓글을 신고할까요? 신고 이유를 적어주시면 검토에 도움이 됩니다.";

  return `
    <div class="modal-backdrop visible report-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <form class="modal report-modal" data-report-form="${target.id}" data-report-type="${reportType}">
        <div class="modal-head">
          <h2 id="report-title">${title}</h2>
          <button class="ghost-icon" type="button" data-close-report aria-label="닫기">${icons.close}</button>
        </div>
        <p class="auth-helper">${helper}</p>
        <label>
          <span>신고 이유</span>
          <textarea name="reason" rows="5" placeholder="신고 이유를 입력해주세요."></textarea>
        </label>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-close-report>취소</button>
          <button class="primary-button" type="submit">신고하기</button>
        </div>
      </form>
    </div>
  `;
}

function ConfirmModal() {
  const action = state.confirmAction;
  if (!action) return "";

  return `
    <div class="modal-backdrop visible confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <article class="modal confirm-modal">
        <div class="modal-head">
          <h2 id="confirm-title">${escapeHtml(action.title)}</h2>
        </div>
        <p class="confirm-message">${escapeHtml(action.message)}</p>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-cancel-confirm>취소</button>
          <button class="primary-button ${action.danger ? "danger-primary" : ""}" type="button" data-confirm-action>${escapeHtml(action.confirmLabel || "확인")}</button>
        </div>
      </article>
    </div>
  `;
}

function ExecuteModal() {
  const message = state.messages.find((item) => item.id === state.executeMessageId);
  const prompt = findPromptById(state.executePromptId);
  const executableText = message ? getFinalPromptText(message) : String(prompt?.text || "").trim();
  if (!executableText) return "";

  const targets = [
    { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "gemini", name: "Google Gemini", url: "https://gemini.google.com/" },
    { id: "claude", name: "Claude", url: "https://claude.ai/" },
  ];

  return `
    <div class="modal-backdrop visible execute-backdrop" role="dialog" aria-modal="true" aria-labelledby="execute-title">
      <article class="modal execute-modal">
        <div class="modal-head">
          <h2 id="execute-title">AI 도구 선택</h2>
          <button class="ghost-icon" type="button" data-close-execute aria-label="닫기">${icons.close}</button>
        </div>
        <p class="confirm-message">AI 사이트를 선택하면 개선된 최종 프롬프트가 복사되고 선택한 사이트가 열립니다. 열린 사이트의 입력창을 클릭한 뒤 붙여넣기(Ctrl+V)해서 실행해주세요.</p>
        <div class="execute-targets">
          ${targets.map((target) => `<button type="button" data-execute-target="${target.id}">${target.name}</button>`).join("")}
        </div>
      </article>
    </div>
  `;
}

function MakePage() {
  const hasMessages = state.messages.length > 0;

  return `
    <section class="make-page" aria-label="프롬프트 첨삭">
      ${MakeSidePanel()}
      <div class="chat-feed">
        <div class="make-template-bar ${state.templateCollapsed ? "collapsed" : ""}" aria-label="분야 선택">
          <button class="template-toggle" type="button" data-toggle-templates aria-label="${state.templateCollapsed ? "분야 버튼 펼치기" : "분야 버튼 숨기기"}">${state.templateCollapsed ? "&gt;" : "&lt;"}</button>
          ${
            state.templateCollapsed
              ? ""
              : `<div class="template-list">
                  ${promptTemplates.map((template) => `<button type="button" data-template="${template.id}">${template.label}</button>`).join("")}
                </div>`
          }
        </div>
        ${
          hasMessages
            ? state.messages.map(MessageBubble).join("")
            : `<div class="empty-state make-empty">
                <div class="spark-badge">${icons.make}</div>
                <h1>프롬프트 첨삭 도우미</h1>
                <p>AI 도구에서 최적의 결과를 얻기 위한 프롬프트를 작성해보세요.<br />더 명확하고 효과적인 프롬프트로 개선해드립니다.</p>
              </div>`
        }
      </div>
      <form class="composer ${hasMessages ? "has-newchat" : ""}" data-composer>
        <textarea name="prompt" rows="1" data-autosize-textarea placeholder="개선하고 싶은 프롬프트를 입력하세요...">${escapeHtml(state.composerDraft)}</textarea>
        <button class="send-button" type="submit" aria-label="보내기">${icons.send}</button>
      </form>
    </section>
  `;
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

  return `
    <aside class="make-side-panel" aria-label="Make 최근 대화">
      <section class="make-folder-section">
        <div class="make-side-head">
          <strong>폴더</strong>
          <button type="button" data-show-folder-form ${canCreateFolder ? "" : "disabled"} title="${canManageFolders ? (canCreateFolder ? "새 폴더 만들기" : `폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`) : "로그인하면 대화를 폴더로 정리할 수 있습니다."}">새 폴더</button>
        </div>
        ${!canManageFolders ? `<p class="make-folder-limit">로그인하면 대화를 폴더로 정리할 수 있습니다.</p>` : ""}
        ${canManageFolders && !canCreateFolder ? `<p class="make-folder-limit">폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.</p>` : ""}
        ${state.makeBackendMessage ? `<p class="make-backend-note">${escapeHtml(state.makeBackendMessage)}</p>` : ""}
        ${
          state.creatingFolder
            ? `<form class="make-folder-form" data-folder-create-form>
                <input name="folderName" type="text" placeholder="폴더 이름" autocomplete="off" />
                <button type="submit">추가</button>
                <button type="button" data-cancel-folder-create>취소</button>
              </form>`
            : ""
        }
        <div class="make-folder-list">
          ${MakeFolderButton("all", "전체", state.recentThreads.length)}
          ${visibleFolders.map((folder) => MakeFolderButton(folder.id, folder.name, countThreadsInFolder(folder.id))).join("")}
        </div>
      </section>
      <div class="make-side-head">
        <strong>${escapeHtml(getActiveFolderName())}</strong>
        <button type="button" data-new-chat>새 대화</button>
      </div>
      ${
        visibleThreads.length
          ? `<div class="recent-thread-list">
              ${visibleThreads.map((thread) => `
                <article class="recent-thread ${state.activeThreadId === thread.id ? "active" : ""} ${state.openThreadMenuId === thread.id ? "menu-open" : ""}" data-thread-item="${thread.id}">
                  <button class="recent-thread-main" type="button" data-open-thread="${thread.id}">
                    <strong>${escapeHtml(thread.title)}</strong>
                    <span>${escapeHtml(thread.preview)}</span>
                    <small>${formatShortDate(thread.createdAt)}</small>
                  </button>
                  <div class="recent-thread-menu-wrap">
                    <button class="recent-thread-more" type="button" data-thread-menu="${thread.id}" aria-label="대화 더보기" aria-expanded="${state.openThreadMenuId === thread.id ? "true" : "false"}">${icons.more}</button>
                    ${
                      state.openThreadMenuId === thread.id
                        ? `<div class="recent-thread-menu" role="menu">
                            <label class="recent-thread-folder-field">
                              <span>폴더 이동</span>
                              <select class="thread-folder-select" data-thread-folder="${thread.id}" aria-label="대화 폴더" ${canManageFolders ? "" : "disabled"} title="${canManageFolders ? "대화 폴더 이동" : "로그인하면 대화를 폴더로 정리할 수 있습니다."}">
                                ${state.makeFolders.map((folder) => `<option value="${folder.id}" ${getThreadFolderId(thread) === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
                              </select>
                            </label>
                            ${
                              state.creatingThreadFolderId === thread.id
                                ? `<form class="thread-folder-create-form" data-thread-folder-create-form="${thread.id}">
                                    <input name="folderName" type="text" placeholder="새 폴더 이름" autocomplete="off" ${canManageFolders ? "" : "disabled"} />
                                    <div>
                                      <button type="submit" ${canManageFolders ? "" : "disabled"}>이동</button>
                                      <button type="button" data-cancel-thread-folder-create>취소</button>
                                    </div>
                                  </form>`
                                : `<button type="button" data-start-thread-folder-create="${thread.id}" ${canManageFolders && customFolderCount < MAX_CUSTOM_MAKE_FOLDERS ? "" : "disabled"} role="menuitem"><span>+</span><span>새 폴더로 이동...</span></button>`
                            }
                            <button type="button" data-delete-thread="${thread.id}" role="menuitem">${icons.trash}<span>삭제</span></button>
                          </div>`
                        : ""
                    }
                  </div>
                </article>
              `).join("")}
            </div>`
          : `<p class="recent-empty">아직 저장된 대화가 없습니다.</p>`
      }
    </aside>
  `;
}

function MakeFolderButton(folderId, name, count) {
  const isUserFolder = folderId !== "all" && folderId !== "uncategorized";
  const canManage = state.isLoggedIn && isUserFolder;
  const isEditing = canManage && state.editingFolderId === folderId;
  const isMenuOpen = canManage && state.openFolderMenuId === folderId;
  if (isEditing) {
    return `
      <form class="make-folder-edit-form" data-folder-edit-form="${folderId}">
        <input name="folderName" value="${escapeHtml(name)}" />
        <button type="submit">저장</button>
        <button type="button" data-cancel-folder-edit>취소</button>
      </form>
    `;
  }

  return `
    <div class="make-folder-item ${isUserFolder ? "user-folder" : "system-folder"} ${state.activeFolderId === folderId ? "active" : ""} ${isMenuOpen ? "menu-open" : ""}" data-folder-item="${folderId}">
      <button type="button" data-open-folder="${folderId}">${icons.bookmark}<span>${escapeHtml(name)}</span><em>${formatNumber(count)}</em></button>
      ${
        canManage
          ? `<div class="make-folder-menu-wrap">
              <button class="make-folder-more" type="button" data-folder-menu="${folderId}" aria-label="폴더 더보기" aria-expanded="${isMenuOpen ? "true" : "false"}">${icons.more}</button>
              ${
                isMenuOpen
                  ? `<div class="make-folder-menu" role="menu">
                      <button type="button" data-edit-folder="${folderId}" role="menuitem">${icons.edit}<span>이름 변경</span></button>
                      <button type="button" data-delete-folder="${folderId}" role="menuitem">${icons.trash}<span>삭제</span></button>
                    </div>`
                  : ""
              }
            </div>`
          : ""
      }
    </div>
  `;
}

function MessageBubble(message) {
  const isAssistant = message.role === "assistant";
  const isSaved = isAssistant && isPromptSaved(message.id);

  if (isAssistant) {
    return `
      <div class="message-group assistant-group" data-message-id="${escapeHtml(message.id)}">
        <article class="message assistant">
          <p>${message.content}</p>
        </article>
        <footer class="message-actions">
          <button type="button" data-copy-message="${message.id}">${state.copiedMessageId === message.id ? icons.check : icons.copy}<span>${state.copiedMessageId === message.id ? "Copied" : "Copy"}</span></button>
          <button class="${isSaved ? "saved" : ""}" type="button" data-save-message="${message.id}">${icons.bookmark}<span>${isSaved ? "Saved" : "Save"}</span></button>
          <button type="button" data-share-message="${message.id}">${icons.share}<span>Share</span></button>
          <button type="button" data-execute-message="${message.id}">${icons.play}<span>Execute</span></button>
        </footer>
      </div>
    `;
  }

  return `
    <div class="message-group user-group" data-message-id="${escapeHtml(message.id)}">
      ${
        state.editingMessageId === message.id
          ? `<form class="message-edit-form" data-edit-message-form="${message.id}">
              <textarea name="message" rows="3">${escapeHtml(message.content)}</textarea>
              <div class="message-edit-actions">
                <button type="button" data-cancel-message-edit>취소</button>
                <button type="submit">다시 전송</button>
              </div>
            </form>`
          : `<article class="message ${message.role}">
              <p>${message.content}</p>
              <div class="user-message-actions">
                <button class="user-message-edit-button" type="button" data-edit-message="${message.id}" aria-label="메시지 수정" title="수정">${icons.edit}</button>
              </div>
            </article>`
      }
    </div>
  `;
}

function SavedPage() {
  const tabs = [
    { id: "library", label: "내 보관함", count: getSavedPagePrompts().length },
    { id: "mine", label: "내가 만든 프롬프트", count: getMyPrompts().length },
    { id: "comments", label: "댓글 관리", count: getMyComments().length },
    { id: "reports", label: "신고 내역", count: getMyReports().length },
  ];

  return `
    <section class="saved-page my-page" aria-labelledby="my-page-heading">
      <div class="page-head my-page-head">
        <div class="page-title">
          <span>${icons.user}</span>
          <h1 id="my-page-heading">My page</h1>
        </div>
      </div>
      <nav class="my-page-tabs" aria-label="My page tabs">
        ${tabs
          .map(
            (tab) => `
              <button class="${state.myPageTab === tab.id ? "active" : ""}" type="button" data-my-tab="${tab.id}">
                ${tab.label}<span>${formatNumber(tab.count)}</span>
              </button>
            `,
          )
          .join("")}
      </nav>
      ${DemoLibraryPrompt()}
      ${MyPagePanel()}
    </section>
  `;
}

function DemoLibraryPrompt() {
  if (state.myBackendStatus === "connected") {
    return `
      <div class="demo-library-prompt">
        <div>
          <strong>현재: 서버 보관함 기준</strong>
          <p>내 보관함, 내가 만든 프롬프트, 댓글 관리, 신고 내역은 백엔드 API 응답을 우선 반영합니다.</p>
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
      <button class="secondary-button" type="button" data-toggle-library-demo>${isSeeded ? "데모 데이터 숨기기" : "데모 데이터 채우기"}</button>
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

  return `
    <div class="my-page-panel" aria-labelledby="saved-heading">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.bookmark}</span>
          <h1 id="saved-heading">내 보관함</h1>
        </div>
        <div class="filter-groups" aria-label="저장 목록 필터">
          <label class="sort-select saved-sort-select" aria-label="내 보관함 정렬">
            <select data-saved-sort>
              <option value="recent" ${state.savedSort === "recent" ? "selected" : ""}>최신</option>
              <option value="saves" ${state.savedSort === "saves" ? "selected" : ""}>저장</option>
              <option value="comments" ${state.savedSort === "comments" ? "selected" : ""}>댓글</option>
              <option value="likes" ${state.savedSort === "likes" ? "selected" : ""}>좋아요</option>
              <option value="views" ${state.savedSort === "views" ? "selected" : ""}>조회</option>
            </select>
          </label>
          <div class="filter-group" role="group" aria-label="소유자 필터">
            <label><input type="checkbox" data-filter="community" ${state.savedFilter.community ? "checked" : ""} /> 다른 사용자</label>
            <label><input type="checkbox" data-filter="mine" ${state.savedFilter.mine ? "checked" : ""} /> 내 프롬프트</label>
          </div>
          <div class="filter-group" role="group" aria-label="상태 필터">
            <label class="toggle-filter">
              <input type="checkbox" data-filter="liked" ${state.savedFilter.liked ? "checked" : ""} />
              <span class="toggle-track" aria-hidden="true"><span></span></span>
              <span>좋아요만 보기</span>
            </label>
          </div>
        </div>
      </div>
      ${
        pendingUnsaveCount
          ? `<p class="saved-pending-hint">저장 취소 예정 ${pendingUnsaveCount}개가 있습니다. 같은 저장 아이콘을 다시 누르면 되돌릴 수 있고, Home, Make, Share로 이동하면 목록에서 제거됩니다.</p>`
          : ""
      }
      ${
        filtered.length
          ? `<div class="prompt-grid saved-grid">${pagePrompts.map(PromptCard).join("")}</div>
             ${SavedPagination(totalPages, currentPage)}`
          : `<div class="empty-state saved-empty">
              <span>${state.savedFilter.liked ? icons.heart : icons.bookmark}</span>
              <p>${SavedEmptyMessage()}</p>
            </div>`
      }
    </div>
  `;
}

function SavedPagination(totalPages, currentPage) {
  if (totalPages <= 1) return "";

  return `
    <nav class="pagination" aria-label="저장한 프롬프트 페이지">
      ${Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        return `<button class="page-button ${page === currentPage ? "active" : ""}" type="button" data-saved-page="${page}" aria-label="저장 목록 ${page}페이지">${page}</button>`;
      }).join("")}
    </nav>
  `;
}

function MyPromptsPanel() {
  const prompts = getMyPrompts().sort(getSavedSorter());

  return `
    <div class="my-page-panel">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.edit}</span>
          <h1>내가 만든 프롬프트</h1>
        </div>
      </div>
      ${
        prompts.length
          ? `<div class="prompt-grid saved-grid">${prompts.map(PromptCard).join("")}</div>`
          : `<div class="empty-state saved-empty"><span>${icons.edit}</span><p>아직 직접 만든 프롬프트가 없습니다.</p></div>`
      }
    </div>
  `;
}

function MyCommentsPanel() {
  const comments = getMyComments();

  return `
    <div class="my-page-panel">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.comment}</span>
          <h1>댓글 관리</h1>
        </div>
      </div>
      ${
        comments.length
          ? `<div class="activity-list">
              ${comments
                .map(
                  (item) => {
                    const isEditing = state.editingCommentId === item.comment.id;
                    const revisionRequest = state.adminPromptRevisionRequests[makeRevisionRequestKey("comment", item.comment.id)];
                    return `
                    <article class="activity-item">
                      <div>
                        <strong>${escapeHtml(item.prompt?.title || "삭제된 프롬프트")}</strong>
                        ${
                          isEditing
                            ? `<form class="comment-edit-form my-comment-edit-form" data-edit-comment-form="${item.comment.id}">
                                <textarea name="comment" rows="3">${escapeHtml(item.comment.text)}</textarea>
                                <button class="primary-button" type="submit">저장</button>
                              </form>`
                            : `<p>${escapeHtml(item.comment.text)}${item.comment.edited ? `<span class="activity-edited-mark">수정됨</span>` : ""}</p>`
                        }
                        ${
                          revisionRequest
                            ? `<div class="revision-request-notice activity-revision-notice">
                                <strong>수정 요청됨</strong>
                                <p>${escapeHtml(revisionRequest.reason)}</p>
                              </div>`
                            : ""
                        }
                      </div>
                      <div class="activity-actions">
                        <button type="button" data-open-prompt="${item.promptId}">원문 보기</button>
                        <button type="button" data-edit-comment="${item.comment.id}">${isEditing ? "취소" : "수정"}</button>
                        <button type="button" data-delete-comment="${item.comment.id}">삭제</button>
                      </div>
                    </article>
                  `;
                  },
                )
                .join("")}
            </div>`
          : `<div class="empty-state saved-empty"><span>${icons.comment}</span><p>작성한 댓글이 아직 없습니다.</p></div>`
      }
    </div>
  `;
}

function MyReportsPanel() {
  const reports = getMyReports();

  return `
    <div class="my-page-panel">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.flag}</span>
          <h1>신고 내역</h1>
        </div>
      </div>
      ${
        reports.length
          ? `<div class="activity-list">
              ${reports
                .map(
                  (report) => `
                    <article class="activity-item reported-activity">
                      <div>
                        <strong>${escapeHtml(report.title)}</strong>
                        <p>${escapeHtml(report.label)}</p>
                        ${report.reason ? `<p class="activity-reason">${escapeHtml(report.reason)}</p>` : ""}
                        ${report.memo ? `<p class="activity-reason">처리 메모: ${escapeHtml(report.memo)}</p>` : ""}
                        ${report.reviewedAt ? `<small class="activity-meta">처리 일시 ${formatShortDate(report.reviewedAt)}</small>` : ""}
                      </div>
                      <span class="status-badge ${report.status === "resolved" ? "public" : report.status === "dismissed" ? "private" : "pending-unsave"}">${getReportStatusLabel(report.status)}</span>
                    </article>
                  `,
                )
                .join("")}
            </div>`
          : `<div class="empty-state saved-empty"><span>${icons.flag}</span><p>신고 내역이 아직 없습니다.</p></div>`
      }
    </div>
  `;
}

function AdminPage() {
  if (!state.adminMode) {
    return `
      <section class="admin-page">
        <div class="empty-state saved-empty">
          <span>${icons.shield}</span>
          <p>${state.isLoggedIn ? "관리자 데모를 켜야 Admin 페이지를 볼 수 있습니다." : "관리자 데모는 로그인 후 사용할 수 있습니다."}</p>
        </div>
      </section>
    `;
  }

  const reportedPrompts = [...state.reportedPromptIds].map((id) => findPromptById(id)).filter(Boolean);
  const reportRecords = getAdminReportRecords();
  const allPrompts = getUniquePrompts([...popularPrompts, ...savedPrompts]);
  const adminPromptQuery = state.adminPromptQuery || "";
  const adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(state.adminPromptFilter)
    ? state.adminPromptFilter
    : "all";
  const filteredAdminPrompts = allPrompts
    .filter((prompt) => matchesAdminPromptFilter(prompt, adminPromptFilter))
    .filter((prompt) => matchesAdminPromptQuery(prompt, adminPromptQuery));
  const adminPromptFilters = [
    { id: "all", label: "전체" },
    { id: "shared", label: "공개" },
    { id: "private", label: "비공개" },
    { id: "hidden", label: "숨김" },
    { id: "reported", label: "신고됨" },
  ];
  const adminUserNickname = String(state.adminUserActivityNickname || "").trim();
  const adminUserActivity = adminUserNickname ? getAdminUserActivity(adminUserNickname) : null;
  const adminUserPanel = `
    <section class="admin-user-activity-panel" aria-label="사용자 활동 조회">
      <div class="admin-user-activity-head">
        <div>
          <h3>사용자 활동 조회</h3>
        </div>
      </div>
      <form class="admin-user-search-form" data-admin-user-search-form>
        <input name="nickname" type="search" value="${escapeHtml(state.adminUserQuery || adminUserNickname)}" placeholder="닉네임을 입력하세요" autocomplete="off" />
        <button type="submit">조회</button>
      </form>
      ${
        adminUserActivity
          ? AdminUserActivitySummary(adminUserActivity)
          : `<p class="admin-panel-note">원문 보기에서 작성자 닉네임을 클릭하거나 닉네임을 검색하면 활동 내역이 표시됩니다.</p>`
      }
    </section>
  `;
  const adminTags = getAdminManagedTags();
  const adminTagFilter = ["all", "pending", "approved", "rejected"].includes(state.adminTagFilter) ? state.adminTagFilter : "all";
  const adminTagSort = ["usage", "recent"].includes(state.adminTagSort) ? state.adminTagSort : "usage";
  const adminTagFilters = [
    { id: "all", label: "전체" },
    { id: "pending", label: "검토 중" },
    { id: "approved", label: "검토 완료" },
    { id: "rejected", label: "추천 제외" },
  ];
  const adminTabs = getAdminTabs();
  const activeAdminTab = adminTabs.some((tab) => tab.id === state.adminTab) ? state.adminTab : "reports";
  const reportsPanel = `
    <section class="admin-panel">
      <h2>신고 관리</h2>
      <p class="admin-panel-note">접수된 신고는 검토 완료 또는 기각할 수 있고, 완료/기각 후에도 다시 접수 상태로 재처리할 수 있습니다.</p>
      ${
        reportRecords.length
          ? reportRecords
              .map(
                (record) => `
                  <article class="admin-row admin-report-row report-status-${record.status}">
                    <div>
                      <strong>${escapeHtml(record.title)}</strong>
                      ${record.contextTitle ? `<p class="admin-report-context">게시물: ${escapeHtml(record.contextTitle)}</p>` : ""}
                      ${record.targetPreview ? `<p class="admin-report-target">${escapeHtml(record.targetPreview)}</p>` : ""}
                      <p>${escapeHtml(record.summary)}</p>
                      <span class="status-badge ${record.status === "dismissed" ? "private" : record.status === "resolved" ? "public" : "pending-unsave"}">${getReportStatusLabel(record.status)}</span>
                      ${record.promptAuthor ? `<span class="status-badge private">게시물 작성자 ${escapeHtml(record.promptAuthor)}</span>` : ""}
                      ${record.commentAuthor ? `<span class="status-badge private">댓글 작성자 ${escapeHtml(record.commentAuthor)}</span>` : ""}
                      ${state.adminPromptRevisionRequests[record.key] ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : ""}
                    </div>
                    <div class="admin-actions">
                      ${
                        record.promptId
                          ? `<button type="button" data-open-prompt="${record.promptId}" ${record.type === "comment" ? `data-highlight-comment="${record.targetId}"` : ""}>원문 보기</button>`
                          : ""
                      }
                      <button type="button" data-admin-request-revision="${record.key}">수정 요청</button>
                      ${record.promptId ? `<button type="button" data-admin-hide-prompt="${record.promptId}">${state.adminHiddenPromptIds.has(record.promptId) ? "게시물 숨김 해제" : "게시물 숨김"}</button>` : ""}
                      ${record.status !== "resolved" ? `<button type="button" data-admin-report-status="${record.key}:resolved">검토 완료</button>` : ""}
                      ${record.status !== "dismissed" ? `<button type="button" data-admin-report-status="${record.key}:dismissed">기각</button>` : ""}
                      ${record.status === "resolved" ? `<button type="button" data-admin-report-status="${record.key}:pending">재처리</button>` : ""}
                      ${record.status === "dismissed" ? `<button type="button" data-admin-report-status="${record.key}:pending">기각 취소</button>` : ""}
                      ${
                        record.type === "comment"
                          ? `<button type="button" data-delete-comment="${record.targetId}">댓글 삭제</button>`
                          : record.promptId
                            ? `<button type="button" data-admin-delete-prompt="${record.promptId}">대상 삭제</button>`
                            : ""
                      }
                    </div>
                  </article>
                `,
              )
              .join("")
          : `<p class="admin-empty">접수된 신고가 없습니다.</p>`
      }
    </section>
  `;
  const promptsPanel = `
    <section class="admin-panel">
      <h2>프롬프트 관리</h2>
      <p class="admin-panel-note">관리자는 사용자 프롬프트를 직접 수정하지 않고, 수정 요청, 게시물 숨김, 삭제 같은 운영 조치만 수행합니다.</p>
      <div class="admin-filter-list" aria-label="프롬프트 분류">
        ${adminPromptFilters
          .map(
            (filter) =>
              `<button class="${adminPromptFilter === filter.id ? "active" : ""}" type="button" data-admin-prompt-filter="${filter.id}">${filter.label}</button>`,
          )
          .join("")}
      </div>
      <label class="admin-search-field">
        <span>${icons.search}</span>
        <input type="search" data-admin-prompt-search value="${escapeHtml(adminPromptQuery)}" placeholder="제목, 본문, 해시태그, 작성자, 상태로 검색" autocomplete="off" />
      </label>
      ${filteredAdminPrompts.length ? filteredAdminPrompts
        .slice(0, 8)
        .map(
          (prompt) => {
            const isShared = prompt.isShared || prompt.source === "community";
            const isHidden = state.adminHiddenPromptIds.has(prompt.id);
            const isReported = state.reportedPromptIds.has(prompt.id);
            const revisionRequest = getPromptRevisionRequest(prompt.id);
            return `
              <article class="admin-row admin-prompt-row">
                <div>
                  <strong>${escapeHtml(prompt.title)}</strong>
                  <p class="admin-prompt-preview">${escapeHtml(makePreview(prompt.text))}</p>
                  <div class="admin-prompt-meta">
                    <span>${icons.eye}${formatNumber(prompt.views || 0)}</span>
                    <span>${icons.heart}${formatNumber(getPromptLikes(prompt))}</span>
                    <span>${icons.comment}${formatNumber(getPromptCommentCount(prompt))}</span>
                    <span>${icons.bookmark}${formatNumber(getPromptSaveCount(prompt))}</span>
                    <span>작성자 <button class="admin-inline-author-button" type="button" data-admin-user-author="${escapeHtml(getDisplayPromptAuthor(prompt))}">${escapeHtml(getDisplayPromptAuthor(prompt))}</button></span>
                    <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
                  </div>
                  <div class="tag-row admin-prompt-tags">${(prompt.tags || []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
                  <div class="status-row">
                    <span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>
                    ${isHidden ? `<span class="status-badge private">숨김</span>` : ""}
                    ${isReported ? `<span class="status-badge pending-unsave">신고됨</span>` : ""}
                    ${revisionRequest ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : ""}
                  </div>
                  ${
                    revisionRequest
                      ? `<div class="revision-request-notice admin-revision-summary">
                          <strong>수정 요청 사유</strong>
                          <p>${escapeHtml(revisionRequest.reason)}</p>
                        </div>`
                      : ""
                  }
                </div>
                <div class="admin-actions">
                  <button type="button" data-open-prompt="${prompt.id}">원문 보기</button>
                  <button type="button" data-admin-request-revision="prompt:${prompt.id}">수정 요청</button>
                  <button type="button" data-admin-hide-prompt="${prompt.id}">${isHidden ? "게시물 숨김 해제" : "게시물 숨김"}</button>
                  <button type="button" data-admin-delete-prompt="${prompt.id}">삭제</button>
                </div>
              </article>
            `;
          },
        )
        .join("") : `<p class="admin-empty">검색 결과가 없습니다.</p>`}
    </section>
  `;
  const tagsPanel = `
    <section class="admin-panel">
      <h2>태그 관리</h2>
      <p class="admin-panel-note">태그는 검토 중, 검토 완료, 추천 제외 상태로 관리하며 승인/제외 후에도 재검토할 수 있습니다.</p>
      <div class="admin-filter-list" aria-label="태그 상태 분류">
        ${adminTagFilters
          .map(
            (filter) =>
              `<button class="${adminTagFilter === filter.id ? "active" : ""}" type="button" data-admin-tag-filter="${filter.id}">${filter.label}</button>`,
          )
          .join("")}
      </div>
      <div class="admin-search-toolbar">
        <label class="admin-search-field">
          <span>${icons.search}</span>
          <input type="search" data-admin-tag-search value="${escapeHtml(state.adminTagQuery || "")}" placeholder="태그명을 검색" autocomplete="off" />
        </label>
        <select class="admin-sort-select" data-admin-tag-sort aria-label="태그 정렬">
          <option value="usage" ${adminTagSort === "usage" ? "selected" : ""}>사용량</option>
          <option value="recent" ${adminTagSort === "recent" ? "selected" : ""}>최신</option>
        </select>
      </div>
      ${
        adminTags.length
          ? adminTags
              .map(
                (tag) => `
                  <article class="admin-row tag-status-${tag.status}">
                    <div>
                      <strong>#${escapeHtml(tag.label)}</strong>
                      <span class="status-badge ${getAdminTagStatusClass(tag.status)}">${getAdminTagStatusLabel(tag.status)}</span>
                      <span class="admin-tag-usage">사용 ${formatNumber(tag.count)}회</span>
                    </div>
                    <div class="admin-actions">
                      ${tag.status !== "approved" ? `<button type="button" data-admin-tag-action="approved:${escapeHtml(tag.key)}">검토 완료</button>` : ""}
                      ${tag.status !== "rejected" ? `<button type="button" data-admin-tag-action="rejected:${escapeHtml(tag.key)}">추천 제외</button>` : ""}
                      ${tag.status === "approved" ? `<button type="button" data-admin-tag-action="pending:${escapeHtml(tag.key)}">검토 완료 취소</button>` : ""}
                      ${tag.status === "rejected" ? `<button type="button" data-admin-tag-action="pending:${escapeHtml(tag.key)}">재검토</button>` : ""}
                    </div>
                  </article>
                `,
              )
              .join("")
          : `<p class="admin-empty">관리할 태그가 없습니다.</p>`
      }
    </section>
  `;
  const usersPanel = `
    <section class="admin-panel">
      <h2>사용자 활동</h2>
      <p class="admin-panel-note">닉네임 기준으로 작성한 프롬프트, 댓글, 답글, 신고 맥락을 확인합니다.</p>
      ${adminUserPanel}
    </section>
  `;
  const activePanel =
    activeAdminTab === "prompts" ? promptsPanel : activeAdminTab === "tags" ? tagsPanel : activeAdminTab === "users" ? usersPanel : reportsPanel;

  return `
    <section class="admin-page" aria-labelledby="admin-heading">
      <div class="page-head admin-head">
        <div class="page-title">
          <span>${icons.shield}</span>
          <h1 id="admin-heading">Admin</h1>
        </div>
        <p class="admin-demo-note">프론트엔드 검수용 관리자 화면입니다. 관리자 모드에서는 사용자 상호작용 없이 수정 요청, 숨김, 삭제, 검토 상태 변경만 수행합니다.</p>
      </div>
      <div class="admin-workspace">
        <div class="admin-content-panel">
          ${activePanel}
        </div>
      </div>
    </section>
  `;
}

function AdminUserActivitySummary(activity) {
  const groups = [
    { id: "prompts", title: "작성한 프롬프트", items: activity.prompts, empty: "작성한 프롬프트가 없습니다." },
    { id: "comments", title: "작성한 댓글", items: activity.comments, empty: "작성한 댓글이 없습니다." },
    { id: "replies", title: "작성한 답글", items: activity.replies, empty: "작성한 답글이 없습니다." },
    { id: "reports-made", title: "신고한 내역", items: activity.reportsMade, empty: "신고한 내역은 아직 확인할 수 없습니다." },
    { id: "reports-received", title: "신고당한 내역", items: activity.reportsReceived, empty: "신고당한 내역이 없습니다." },
  ];

  return `
    <div class="admin-user-activity-result">
      <div class="admin-user-activity-title">
        <strong>${escapeHtml(activity.nickname)}</strong>
        <span>프롬프트 ${formatNumber(activity.prompts.length)}개 · 댓글 ${formatNumber(activity.comments.length)}개 · 답글 ${formatNumber(activity.replies.length)}개</span>
      </div>
      <div class="admin-user-activity-grid">
        ${groups
          .map(
            (group) => `
              <section class="admin-user-activity-card">
                <h4>${group.title}<small>${formatNumber(group.items.length)}</small></h4>
                ${
                  group.items.length
                    ? group.items
                        .slice(0, 4)
                        .map(
                          (item) => `
                            <article>
                              <strong>${escapeHtml(item.title)}</strong>
                              <p>${escapeHtml(item.preview)}</p>
                              ${
                                item.promptId
                                  ? `<button type="button" data-open-prompt="${escapeHtml(item.promptId)}" ${item.commentId ? `data-highlight-comment="${escapeHtml(item.commentId)}"` : ""}>원문 보기</button>`
                                  : ""
                              }
                            </article>
                          `,
                        )
                        .join("")
                    : `<p class="admin-user-activity-empty">${group.empty}</p>`
                }
              </section>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function SavedEmptyMessage() {
  if (state.savedFilter.liked) return "좋아요를 누른 프롬프트가 아직 없습니다.";
  if (!state.savedFilter.community && !state.savedFilter.mine) return "표시할 필터를 선택해주세요.";
  return "저장한 프롬프트나 내 프롬프트가 아직 없습니다.";
}

function SharePage() {
  if (!state.isLoggedIn) {
    return `
      <section class="share-page login-required" aria-labelledby="share-required-title">
        <div class="empty-state share-required-card">
          <span>${icons.share}</span>
          <h1 id="share-required-title">로그인이 필요합니다</h1>
          <p>프롬프트를 공유하려면 먼저 로그인해주세요.</p>
          <button class="primary-button" type="button" data-open-auth="login">로그인</button>
        </div>
      </section>
    `;
  }
  const draft = state.shareDraft || {};
  const draftTags = Array.isArray(draft.tags) ? draft.tags.join(", ") : "";
  const selectedTags = parseSharedTags(draftTags);
  const suggestedTags = getShareTagSuggestions(state.shareTagQuery, selectedTags);

  return `
    <section class="share-page" aria-labelledby="share-title">
      <div class="share-shell">
        <div class="page-title share-title">
          <span>${icons.share}</span>
          <h1 id="share-title">프롬프트 공유하기</h1>
        </div>
        <p class="share-policy">공유되는 내용은 제목, 최종 프롬프트, 해시태그입니다. Make에서 작성한 개인 대화 기록은 공유되지 않습니다.</p>
        <form class="share-form">
          <label>
            <span>제목</span>
            <input name="title" type="text" value="${escapeHtml(draft.title || "")}" placeholder="예: SEO 블로그 포스팅 프롬프트" />
          </label>
          <label>
          <span>프롬프트</span>
          <textarea name="prompt" rows="8" placeholder="다른 사용자들과 공유하고 싶은 프롬프트를 입력하세요...">${escapeHtml(draft.text || "")}</textarea>
          </label>
          <label>
            <span>해시태그</span>
            <input name="tagSearch" type="text" value="${escapeHtml(state.shareTagQuery)}" placeholder="기존 태그를 검색해 선택하거나 새 태그를 입력하세요" autocomplete="off" />
            <input name="tags" type="hidden" value="${escapeHtml(draftTags)}" />
            <div class="share-tag-suggestions" aria-label="해시태그 검색 결과">
              ${
                suggestedTags.length
                  ? suggestedTags.map((tag) => `<button type="button" data-add-share-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join("")
                  : state.shareTagQuery.trim()
                    ? `<button type="button" data-add-share-tag="${escapeHtml(state.shareTagQuery.trim())}">새 태그로 추가: #${escapeHtml(state.shareTagQuery.trim())}</button>`
                    : `<span>기존 해시태그를 검색해 선택할 수 있습니다.</span>`
              }
            </div>
            <div class="tag-chip-list" data-share-tag-chips>
              ${
                selectedTags.length
                  ? selectedTags
                      .map((tag) => `<button class="tag-chip" type="button" data-remove-share-tag="${escapeHtml(tag)}">#${escapeHtml(tag)} <span aria-hidden="true">×</span></button>`)
                      .join("")
                  : `<span class="tag-chip-empty">선택한 해시태그가 없습니다.</span>`
              }
            </div>
            <p class="field-hint">검색 결과가 없으면 입력한 값을 새 태그로 추가할 수 있습니다.</p>
          </label>
          <div class="share-helper">
            <span>${state.shareError || "공유 후 Home으로 이동하며, 최신 정렬에서 방금 공유한 프롬프트를 확인할 수 있습니다."}</span>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="submit">공유하기</button>
          </div>
        </form>
        ${SharePreview(draft, draftTags)}
      </div>
    </section>
  `;
}

function SharePreview(draft, draftTags) {
  const tags = parseSharedTags(draftTags || "").slice(0, 4);
  const previewTags = tags.length ? tags : ["미리보기", "공유", "프롬프트"];

  return `
    <aside class="share-preview" aria-label="공유 미리보기">
      <div class="share-preview-head">
        <strong>Home 카드 미리보기</strong>
        <span>공유 후 노출되는 모습</span>
      </div>
      <article class="prompt-card share-preview-card">
        <div class="card-head">
          <h2 data-share-preview-title>${escapeHtml(draft.title || "프롬프트 제목 미리보기")}</h2>
        </div>
        <p data-share-preview-text>${escapeHtml(draft.text || "공유할 프롬프트 내용을 입력하면 이곳에서 Home 카드 형태로 미리 확인할 수 있습니다.")}</p>
        <div class="tag-row" data-share-preview-tags>
          ${previewTags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
        </div>
      </article>
    </aside>
  `;
}

function AuthModal() {
  const isSignup = state.authView === "signup";
  const isFindId = state.authView === "find-id";
  const isFindPassword = state.authView === "find-password";
  const isWithdraw = state.authView === "withdraw";
  const title = isFindId ? "아이디 찾기" : isFindPassword ? "비밀번호 찾기" : isWithdraw ? "회원탈퇴" : isSignup ? "회원가입" : "로그인";
  const nicknameChecked = state.authDuplicateChecks.nickname && state.authDuplicateChecks.nickname === String(state.authDraft.nickname || "").trim();
  const userIdChecked = state.authDuplicateChecks.userId && state.authDuplicateChecks.userId === String(state.authDraft.userId || "").trim();

  if (isWithdraw && !state.isLoggedIn) {
    state.authView = "login";
    return AuthModal();
  }

  if (isWithdraw) {
    return `
      <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="modal auth-modal" data-auth-form>
          <div class="modal-head">
            <h2 id="auth-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
          </div>
          <p class="auth-helper">회원탈퇴를 진행하면 계정이 비활성화되고 기존 토큰으로 다시 사용할 수 없습니다. 본인 확인을 위해 비밀번호를 입력해주세요.</p>
          <label class="password-field">
            <input name="password" type="password" placeholder="비밀번호 확인" autocomplete="current-password" />
            <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
          </label>
          <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
          <button class="primary-button danger-primary full" type="submit">회원탈퇴</button>
          <button class="text-button" type="button" data-close-auth>취소</button>
        </form>
      </div>
    `;
  }

  if (isFindId || isFindPassword) {
    return `
      <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="modal auth-modal" data-auth-form>
          <div class="modal-head">
            <h2 id="auth-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
          </div>
          <p class="auth-helper">${isFindId ? "이름과 이메일로 아이디 찾기 데모를 진행합니다. 전화번호는 선택 보조 정보입니다." : "아이디와 이메일로 비밀번호 재설정 데모를 진행합니다. 전화번호는 선택 보조 정보입니다."}</p>
          ${
            isFindId
              ? `<input name="name" placeholder="이름" autocomplete="name" />`
              : `<input name="userId" placeholder="아이디" autocomplete="username" />
                 <p class="auth-field-warning" data-user-id-warning>${escapeHtml(state.authUserIdWarning || "")}</p>`
          }
          <input name="email" type="email" placeholder="이메일" autocomplete="email" />
          <input name="phone" placeholder="전화번호 (선택)" autocomplete="tel" />
          <button class="primary-button full" type="submit">${isFindId ? "아이디 찾기" : "비밀번호 재설정 요청"}</button>
          <div class="auth-link-row">
            <button class="text-button inline" type="button" data-open-auth="login">로그인으로 돌아가기</button>
            <button class="text-button inline" type="button" data-open-auth="${isFindId ? "find-password" : "find-id"}">${isFindId ? "비밀번호 찾기" : "아이디 찾기"}</button>
          </div>
        </form>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <form class="modal auth-modal" data-auth-form>
        <div class="modal-head">
          <h2 id="auth-title">${title}</h2>
          <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
        </div>
        <button class="google-auth-button" type="button" data-google-auth><span>G</span>${isSignup ? "Google로 회원가입" : "Google로 로그인"}</button>
        <div class="auth-divider"><span>또는</span></div>
        ${
          isSignup
            ? `<div class="auth-check-row">
                <input name="nickname" placeholder="닉네임" value="${escapeHtml(state.authDraft.nickname || "")}" />
                <button type="button" data-check-duplicate="nickname" ${nicknameChecked ? "disabled" : ""}>${nicknameChecked ? "확인 완료" : "중복 확인"}</button>
              </div>
              <input name="name" placeholder="이름" value="${escapeHtml(state.authDraft.name || "")}" />
              <div class="auth-check-row">
                <input name="userId" placeholder="아이디" autocomplete="username" value="${escapeHtml(state.authDraft.userId || "")}" />
                <button type="button" data-check-duplicate="userId" ${userIdChecked ? "disabled" : ""}>${userIdChecked ? "확인 완료" : "중복 확인"}</button>
              </div>
              <p class="auth-field-warning" data-user-id-warning>${escapeHtml(state.authUserIdWarning || "")}</p>
              <input name="email" type="email" placeholder="이메일" autocomplete="email" value="${escapeHtml(state.authDraft.email || "")}" />
              <input name="phone" placeholder="전화번호 (선택)" autocomplete="tel" value="${escapeHtml(state.authDraft.phone || "")}" />
              <label class="date-field ${state.authDraft.birth ? "has-value" : ""}">
                <input name="birth" type="date" aria-label="생년월일 선택" value="${escapeHtml(state.authDraft.birth || "")}" />
                <span>생년월일</span>
              </label>`
            : `<input name="userId" placeholder="아이디" autocomplete="username" />
               <p class="auth-field-warning" data-user-id-warning>${escapeHtml(state.authUserIdWarning || "")}</p>`
        }
        <label class="password-field">
          <input name="password" type="password" placeholder="비밀번호" autocomplete="${isSignup ? "new-password" : "current-password"}" value="${isSignup ? escapeHtml(state.authDraft.password || "") : ""}" />
          <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
        </label>
        <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
        ${
          isSignup
            ? `<label class="password-field">
                <input name="passwordConfirm" type="password" placeholder="비밀번호 확인" autocomplete="new-password" value="${escapeHtml(state.authDraft.passwordConfirm || "")}" />
                <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
              </label>
              <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
              <label class="agreement-row"><input type="checkbox" name="terms" ${state.authDraft.terms ? "checked" : ""} /> 사이트 이용 약관에 동의합니다</label>
              <label class="agreement-row"><input type="checkbox" name="privacy" ${state.authDraft.privacy ? "checked" : ""} /> 개인정보 수집 및 이용에 동의합니다</label>`
            : ""
        }
        <button class="primary-button full" type="submit">${isSignup ? "가입하기" : "로그인"}</button>
        ${
          isSignup
            ? ""
            : `<div class="auth-link-row">
                <button class="text-button inline" type="button" data-open-auth="find-id">아이디 찾기</button>
                <button class="text-button inline" type="button" data-open-auth="find-password">비밀번호 찾기</button>
                <button class="text-button inline" type="button" data-open-auth="signup">회원가입</button>
              </div>`
        }
        ${isSignup ? `<button class="text-button" type="button" data-open-auth="login">이미 계정이 있어요</button>` : state.isLoggedIn ? `<button class="text-button" type="button" data-open-auth="withdraw">회원탈퇴</button>` : ""}
      </form>
    </div>
  `;
}

function saveAuthDraftFromForm() {
  if (state.authView !== "signup") return;
  const form = document.querySelector("[data-auth-form]");
  if (!form) return;
  const formData = new FormData(form);
  state.authDraft = {
    nickname: String(formData.get("nickname") || ""),
    name: String(formData.get("name") || ""),
    userId: String(formData.get("userId") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    birth: String(formData.get("birth") || ""),
    password: String(formData.get("password") || ""),
    passwordConfirm: String(formData.get("passwordConfirm") || ""),
    terms: formData.has("terms"),
    privacy: formData.has("privacy"),
  };
}

function isDuplicateAuthValue(field, value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return false;
  const source = field === "nickname" ? DEMO_EXISTING_NICKNAMES : DEMO_EXISTING_USER_IDS;
  return source.some((item) => normalizeSearchText(item) === normalized);
}

function getUserIdValidationMessage(value) {
  const userId = String(value || "").trim();
  if (!userId) return "";
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(userId)) return "아이디에는 한글을 사용할 수 없습니다.";
  if (!/^[a-z0-9_-]+$/.test(userId)) return "아이디는 영문 소문자, 숫자, _, -만 사용할 수 있습니다.";
  return "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeAuthResult(payload, fallbackUserId = "") {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const user = data.user || data.member || data.account || {};
  const token = String(data.accessToken || data.token || data.authToken || data.jwt || "").trim();
  const nickname = String(user.nickname || user.name || data.nickname || fallbackUserId || "사용자").trim() || "사용자";
  const role = String(user.role || data.role || "user").toLowerCase().replace(/^role_/, "");

  return {
    token,
    user: {
      id: user.id || user.memberId || data.memberId || null,
      userId: user.userId || user.username || data.userId || fallbackUserId || "",
      nickname,
      role,
    },
    raw: payload,
  };
}

function applyAuthenticatedUser(authResult) {
  state.isLoggedIn = true;
  state.currentUser = authResult.user.nickname;
  state.currentUserId = authResult.user.id;
  state.currentUserRole = authResult.user.role || "user";
  state.authToken = authResult.token;
  state.token = authResult.token;
  state.adminMode = state.currentUserRole === "admin";
  if (state.adminMode) state.route = "admin";
  state.myBackendStatus = "idle";
  state.adminBackendStatus = "idle";
  state.makeBackendStatus = "idle";
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, authResult.token);
  } catch (_error) {
    // Local preview can still run if browser storage is blocked.
  }
}

function isAdminDemoCredential(userId, password) {
  return String(userId || "").trim().toLowerCase() === "admin" && String(password || "") === "Admin1234!";
}

function isBackendConnectionError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "REQUEST_TIMEOUT" ||
    error?.name === "AbortError" ||
    error instanceof TypeError ||
    /aborted|timeout|시간이 초과|failed to fetch|network/i.test(message)
  );
}

function applyAdminDemoFallback() {
  applyAuthenticatedUser({
    token: DEMO_AUTH_TOKEN,
    user: {
      id: "demo-admin-user",
      userId: "admin",
      nickname: "관리자",
      role: "admin",
    },
  });
  state.authView = null;
  state.authDraft = {};
  state.authDuplicateChecks = {};
  state.authUserIdWarning = "";
  showNotice("백엔드 로그인 연결 실패로 관리자 데모 세션을 사용합니다.");
  render();
}

function clearAuthenticatedSession({ keepRoute = false } = {}) {
  state.isLoggedIn = false;
  state.currentUser = null;
  state.currentUserId = null;
  state.currentUserRole = "user";
  state.authToken = "";
  state.token = "";
  state.adminMode = false;
  state.authView = null;
  state.myBackendStatus = "idle";
  state.adminBackendStatus = "idle";
  state.makeBackendStatus = "idle";
  state.backendMyPrompts = [];
  state.backendMyComments = [];
  state.backendMyReports = [];
  state.backendLibraryPromptIds = new Set();
  state.backendAdminReports = [];
  state.backendAdminTags = [];
  state.creatingFolder = false;
  state.editingFolderId = null;
  state.openFolderMenuId = null;
  state.creatingThreadFolderId = null;
  state.openThreadMenuId = null;
  state.openPromptCardMenuId = null;
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
  state.reportPromptId = null;
  state.reportCommentId = null;
  state.editingPromptId = null;
  state.adminRequestTargetKey = null;
  state.editingMessageId = null;
  state.executeMessageId = null;
  state.executePromptId = null;
  if (!keepRoute || state.route === "admin" || state.route === "saved") state.route = "home";
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_error) {
    // Local preview can continue if browser storage is unavailable.
  }
}

function normalizeUserIdInput(input) {
  if (!input) return "";
  const lowered = input.value.toLowerCase();
  if (input.value !== lowered) input.value = lowered;
  return lowered.trim();
}

function updateUserIdWarning(input) {
  const warning = getUserIdValidationMessage(input?.value);
  state.authUserIdWarning = warning;
  const warningElement = document.querySelector("[data-user-id-warning]");
  if (warningElement) warningElement.textContent = warning;
  return warning;
}

function updateCapsLockWarning(input, event) {
  const warningElement = input.closest(".password-field")?.nextElementSibling;
  if (!warningElement?.matches("[data-caps-warning]")) return;
  const isOn = Boolean(event?.getModifierState?.("CapsLock"));
  warningElement.hidden = !isOn;
}

function bindEvents() {
  document.querySelector("#app")?.addEventListener("click", (event) => {
    const shouldCloseFolderMenu = state.openFolderMenuId && !event.target.closest("[data-folder-item]");
    const shouldCloseThreadMenu = state.openThreadMenuId && !event.target.closest("[data-thread-item]");
    const shouldClosePromptCardMenu = state.openPromptCardMenuId && !event.target.closest(".prompt-card-menu-wrap");
    if (!shouldCloseFolderMenu && !shouldCloseThreadMenu && !shouldClosePromptCardMenu) return;
    if (shouldCloseFolderMenu) state.openFolderMenuId = null;
    if (shouldCloseThreadMenu) {
      state.openThreadMenuId = null;
      state.creatingThreadFolderId = null;
    }
    if (shouldClosePromptCardMenu) state.openPromptCardMenuId = null;
    render();
  });

  document.onkeydown = (event) => {
    if (event.key === "Escape") {
      closeTopModal();
    }
  };

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.route);
    });
  });

  document.querySelectorAll("[data-toggle-reported]").forEach((button) => {
    button.addEventListener("click", () => {
      state.hideReportedPrompts = !state.hideReportedPrompts;
      state.popularPage = 1;
      state.savedPage = 1;
      render();
    });
  });

  document.querySelectorAll("[data-reset-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmAction({
        type: "reset-demo",
        title: "데모 초기화",
        message: "저장, 신고, 댓글, 로그인, 최근 대화 등 현재 브라우저에 쌓인 데모 상태를 모두 초기화할까요?",
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

  document.querySelectorAll("[data-toggle-admin-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.isLoggedIn) {
        state.adminMode = false;
        state.route = state.route === "admin" ? "home" : state.route;
        showNotice("관리자 데모는 로그인 후 사용할 수 있습니다.");
        return;
      }
      state.adminMode = !state.adminMode;
      state.route = state.adminMode ? "admin" : "home";
      showNotice(state.adminMode ? "관리자 운영 화면으로 이동했습니다." : "사용자 화면을 읽기 전용으로 확인합니다.");
    });
  });

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
      searchByAuthor(button.dataset.searchAuthor);
    });
  });

  document.querySelectorAll("[data-admin-user-author]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAdminUserActivity(button.dataset.adminUserAuthor);
    });
  });

  const adminUserSearchForm = document.querySelector("[data-admin-user-search-form]");
  const adminUserSearchInput = adminUserSearchForm?.querySelector('input[name="nickname"]');
  adminUserSearchInput?.addEventListener("input", () => {
    const nickname = String(adminUserSearchInput.value || "").trim();
    state.adminUserQuery = adminUserSearchInput.value;
    if (!nickname && state.adminUserActivityNickname) {
      state.adminUserActivityNickname = "";
      render();
    }
  });
  adminUserSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = String(new FormData(adminUserSearchForm).get("nickname") || "").trim();
    if (!nickname) {
      state.adminUserQuery = "";
      state.adminUserActivityNickname = "";
      render();
      return;
    }
    openAdminUserActivity(nickname, { keepQuery: true });
  });

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      togglePasswordVisibility(button);
    });
  });

  document.querySelectorAll("[data-google-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      applyAuthenticatedUser({
        token: DEMO_AUTH_TOKEN,
        user: {
          id: "demo-google-user",
          userId: "google",
          nickname: "Google닉네임",
          role: "user",
        },
      });
      state.authView = null;
      showNotice("Google 계정으로 로그인했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-check-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest(".auth-check-row");
      const input = row?.querySelector("input");
      const field = button.dataset.checkDuplicate;
      if (field === "userId") normalizeUserIdInput(input);
      const value = String(input?.value || "").trim();
      saveAuthDraftFromForm();
      if (!value) {
        window.alert("중복 확인할 값을 입력해주세요.");
        return;
      }
      if (field === "userId") {
        const warning = updateUserIdWarning(input);
        if (warning) {
          window.alert(warning);
          return;
        }
      }
      let isDuplicate = isDuplicateAuthValue(field, value);
      const api = window.TTALKAK_API;
      const checkHandler = field === "nickname" ? api?.checkNickname : api?.checkUserId;
      if (checkHandler) {
        try {
          const result = await checkHandler(value);
          if (typeof result?.available === "boolean") {
            isDuplicate = !result.available;
          }
        } catch (error) {
          console.warn("[TTALKAK] 중복 확인 API 호출에 실패해 데모 중복 목록으로 확인합니다.", error);
        }
      }
      if (isDuplicate) {
        delete state.authDuplicateChecks[field];
        window.alert(field === "nickname" ? "이미 사용 중인 닉네임입니다." : "이미 사용 중인 아이디입니다.");
        render();
        return;
      }
      state.authDuplicateChecks[field] = value;
      showNotice("사용 가능한 값입니다.");
    });
  });

  document.querySelectorAll("[data-close-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authView = null;
      render();
    });
  });

  document.querySelectorAll(".modal-backdrop.visible").forEach((backdrop) => {
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target !== backdrop) return;
      closeTopModal();
    });
  });

  document.querySelectorAll("[data-close-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailPromptId = null;
      state.detailHighlightCommentId = null;
      render();
    });
  });

  document.querySelectorAll("[data-close-prompt-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingPromptId = null;
      render();
    });
  });

  document.querySelectorAll("[data-close-revision-request]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminRequestTargetKey = null;
      render();
    });
  });

  document.querySelectorAll("[data-close-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportPromptId = null;
      state.reportCommentId = null;
      render();
    });
  });

  document.querySelectorAll("[data-close-execute]").forEach((button) => {
    button.addEventListener("click", () => {
      state.executeMessageId = null;
      state.executePromptId = null;
      render();
    });
  });

  document.querySelectorAll("[data-cancel-confirm]").forEach((button) => {
    button.addEventListener("click", () => {
      state.confirmAction = null;
      render();
    });
  });

  document.querySelectorAll("[data-confirm-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runConfirmedAction();
    });
  });

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

  document.querySelectorAll("[data-save-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSavedPrompt(button.dataset.savePrompt);
    });
  });

  document.querySelectorAll("[data-like-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleLikePrompt(button.dataset.likePrompt);
    });
  });

  document.querySelectorAll("[data-open-comments]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPromptComments(button.dataset.openComments);
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

  const searchInput = document.querySelector("[data-tag-search]");
  const searchScopeSelect = document.querySelector("[data-search-scope]");
  if (searchScopeSelect) {
    searchScopeSelect.addEventListener("change", () => {
      state.searchScope = getValidSearchScope(searchScopeSelect.value);
      state.popularPage = 1;
      refreshBackendHomePrompts();
      render();
      restoreSearchFocus();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("focus", () => {
      showSearchTipOnce();
    });
    searchInput.addEventListener("compositionstart", () => {
      state.isComposingSearch = true;
      window.clearTimeout(searchCommitTimer);
    });
    searchInput.addEventListener("compositionend", () => {
      state.isComposingSearch = false;
      scheduleSearchCommit(searchInput.value);
    });
    searchInput.addEventListener("input", (event) => {
      if (state.isComposingSearch || event.isComposing) return;
      scheduleSearchCommit(searchInput.value);
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || state.isComposingSearch || event.isComposing) return;
      event.preventDefault();
      commitSearchQuery(searchInput.value);
    });
  }

  const searchHelp = document.querySelector("[data-search-help]");
  if (searchHelp) {
    searchHelp.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      searchInput?.focus();
    });
  }

  const popularSortSelect = document.querySelector("[data-popular-sort]");
  if (popularSortSelect) {
    popularSortSelect.addEventListener("change", () => {
      state.popularSort = popularSortSelect.value;
      state.popularPage = 1;
      refreshBackendHomePrompts();
      render();
    });
  }

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.popularPage = Number(button.dataset.page);
      render();
    });
  });

  document.querySelectorAll("[data-saved-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.savedPage = Number(button.dataset.savedPage);
      render();
    });
  });

  const composer = document.querySelector("[data-composer]");
  if (composer) {
    const composerTextarea = composer.querySelector("[data-autosize-textarea]");
    if (composerTextarea) {
      autosizeTextarea(composerTextarea);
      composerTextarea.addEventListener("input", () => {
        state.composerDraft = composerTextarea.value;
        autosizeTextarea(composerTextarea);
      });
      composerTextarea.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        if (typeof composer.requestSubmit === "function") {
          composer.requestSubmit();
        } else {
          composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });
    }

    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (guardAdminUserAction()) return;
      const value = new FormData(composer).get("prompt").trim();
      if (!value) return;
      if (!state.isLoggedIn && state.guestImproveCount >= FREE_MAKE_LIMIT) {
        state.authView = "login";
        render();
        return;
      }
      if (!state.isLoggedIn) {
        state.guestImproveCount += 1;
      }
      const now = Date.now();
      const threadId = state.activeThreadId || `thread-${now}`;
      const assistantMessageId = `make-${now}`;
      state.activeThreadId = threadId;
      state.messages.push({ id: `user-${now}`, role: "user", content: value });
      const improvedPrompt = await improvePromptWithBackend(value);
      state.messages.push({
        id: assistantMessageId,
        role: "assistant",
        content: improvedPrompt,
        sourcePrompt: value,
      });
      state.composerDraft = "";
      pendingLatestMessageScrollId = assistantMessageId;
      updateRecentThread(threadId);
      syncMakeThreadWithBackend(threadId);
      render();
    });
  }

  document.querySelectorAll("[data-template]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTemplate(button.dataset.template);
    });
  });

  document.querySelectorAll("[data-toggle-templates]").forEach((button) => {
    button.addEventListener("click", () => {
      state.templateCollapsed = !state.templateCollapsed;
      render();
    });
  });

  document.querySelectorAll("[data-copy-message]").forEach((button) => {
    button.addEventListener("click", () => {
      copyMakeMessage(button.dataset.copyMessage);
    });
  });

  document.querySelectorAll("[data-edit-message]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingMessageId = button.dataset.editMessage;
      pendingMessageScrollId = button.dataset.editMessage;
      render();
    });
  });

  document.querySelectorAll("[data-cancel-message-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("[data-edit-message-form]");
      pendingMessageScrollId = form?.dataset.editMessageForm || state.editingMessageId;
      state.editingMessageId = null;
      render();
    });
  });

  document.querySelectorAll("[data-edit-message-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      resendEditedMessage(form.dataset.editMessageForm, new FormData(form).get("message"));
    });
  });

  document.querySelectorAll("[data-save-message]").forEach((button) => {
    button.addEventListener("click", () => {
      saveMakeMessage(button.dataset.saveMessage);
    });
  });

  document.querySelectorAll("[data-admin-hide-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleAdminPromptHidden(button.dataset.adminHidePrompt);
    });
  });

  document.querySelectorAll("[data-admin-delete-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmAction({
        type: "delete-prompt",
        targetId: button.dataset.adminDeletePrompt,
        title: "관리자 삭제",
        message: "관리자 권한으로 이 프롬프트를 삭제할까요?",
        confirmLabel: "삭제",
        danger: true,
      });
    });
  });

  document.querySelectorAll("[data-admin-prompt-search]").forEach((input) => {
    input.addEventListener("compositionstart", () => {
      state.isComposingAdminPromptSearch = true;
      window.clearTimeout(adminPromptSearchCommitTimer);
    });
    input.addEventListener("compositionend", () => {
      state.isComposingAdminPromptSearch = false;
      scheduleAdminPromptSearchCommit(input.value);
    });
    input.addEventListener("input", (event) => {
      if (state.isComposingAdminPromptSearch || event.isComposing) return;
      scheduleAdminPromptSearchCommit(input.value);
    });
  });

  document.querySelectorAll("[data-admin-prompt-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminPromptFilter = button.dataset.adminPromptFilter || "all";
      render();
    });
  });

  document.querySelectorAll("[data-admin-tag-search]").forEach((input) => {
    input.addEventListener("compositionstart", () => {
      state.isComposingAdminTagSearch = true;
      window.clearTimeout(adminTagSearchCommitTimer);
    });
    input.addEventListener("compositionend", () => {
      state.isComposingAdminTagSearch = false;
      scheduleAdminTagSearchCommit(input.value);
    });
    input.addEventListener("input", (event) => {
      if (state.isComposingAdminTagSearch || event.isComposing) return;
      scheduleAdminTagSearchCommit(input.value);
    });
  });

  document.querySelectorAll("[data-admin-tag-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTagFilter = button.dataset.adminTagFilter || "all";
      render();
    });
  });

  document.querySelectorAll("[data-admin-tag-sort]").forEach((select) => {
    select.addEventListener("change", () => {
      state.adminTagSort = select.value || "usage";
      render();
    });
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab || "reports";
      render();
    });
  });

  document.querySelectorAll("[data-admin-tag-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const [decision, tag] = String(button.dataset.adminTagAction || "").split(":");
      if (!tag) return;
      if (decision === "rejected") {
        openConfirmAction({
          type: "admin-tag-status",
          targetId: tag,
          value: decision,
          title: "태그 추천 제외",
          message: "이 태그를 추천 태그 목록에서 제외할까요? 제외 후에도 태그 관리에서 재검토할 수 있습니다.",
          confirmLabel: "추천 제외",
          danger: true,
        });
        return;
      }
      updateAdminTagDecision(tag, decision);
      render();
    });
  });

  document.querySelectorAll("[data-admin-report-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = String(button.dataset.adminReportStatus || "");
      const separatorIndex = value.lastIndexOf(":");
      const key = value.slice(0, separatorIndex);
      const status = value.slice(separatorIndex + 1);
      updateReportRecordStatus(key, status);
    });
  });

  document.querySelectorAll("[data-admin-request-revision]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.adminRequestTargetKey = button.dataset.adminRequestRevision;
      render();
    });
  });

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

  document.querySelectorAll("[data-share-message]").forEach((button) => {
    button.addEventListener("click", () => {
      openShareFromMakeMessage(button.dataset.shareMessage);
    });
  });

  document.querySelectorAll("[data-execute-message]").forEach((button) => {
    button.addEventListener("click", () => {
      openExecuteModal(button.dataset.executeMessage);
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

  document.querySelectorAll("[data-new-chat]").forEach((button) => {
    button.addEventListener("click", startNewChat);
  });

  document.querySelectorAll("[data-thread-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const threadId = button.dataset.threadMenu;
      state.openThreadMenuId = state.openThreadMenuId === threadId ? null : threadId;
      if (state.openThreadMenuId !== threadId) state.creatingThreadFolderId = null;
      render();
    });
  });

  document.querySelectorAll("[data-show-folder-form]").forEach((button) => {
    button.addEventListener("click", () => {
      if (guardAdminUserAction()) return;
      if (!state.isLoggedIn) {
        showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
        return;
      }
      state.creatingFolder = true;
      render();
      window.setTimeout(() => document.querySelector("[data-folder-create-form] input")?.focus(), 0);
    });
  });

  document.querySelectorAll("[data-cancel-folder-create]").forEach((button) => {
    button.addEventListener("click", () => {
      state.creatingFolder = false;
      render();
    });
  });

  document.querySelectorAll("[data-folder-create-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      createMakeFolder(new FormData(form).get("folderName"));
    });
  });

  document.querySelectorAll("[data-open-folder]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFolderId = button.dataset.openFolder;
      state.openFolderMenuId = null;
      render();
    });
  });

  document.querySelectorAll("[data-folder-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (guardAdminUserAction()) return;
      if (!state.isLoggedIn) {
        showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
        return;
      }
      const folderId = button.dataset.folderMenu;
      state.openFolderMenuId = state.openFolderMenuId === folderId ? null : folderId;
      render();
    });
  });

  document.querySelectorAll("[data-edit-folder]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.editingFolderId = button.dataset.editFolder;
      state.openFolderMenuId = null;
      render();
    });
  });

  document.querySelectorAll("[data-cancel-folder-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingFolderId = null;
      render();
    });
  });

  document.querySelectorAll("[data-delete-folder]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openFolderMenuId = null;
      openConfirmAction({
        type: "delete-folder",
        targetId: button.dataset.deleteFolder,
        title: "폴더 삭제",
        message: "폴더를 삭제해도 대화는 미분류로 이동합니다. 삭제할까요?",
        confirmLabel: "삭제",
        danger: true,
      });
    });
  });

  document.querySelectorAll("[data-thread-folder]").forEach((select) => {
    select.addEventListener("change", () => {
      if (guardAdminUserAction()) {
        render();
        return;
      }
      if (!state.isLoggedIn) {
        showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
        render();
        return;
      }
      state.openThreadMenuId = null;
      moveThreadToFolder(select.dataset.threadFolder, select.value);
    });
  });

  document.querySelectorAll("[data-start-thread-folder-create]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (guardAdminUserAction()) return;
      if (!state.isLoggedIn) {
        showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
        return;
      }
      if (getCustomMakeFolderCount() >= MAX_CUSTOM_MAKE_FOLDERS) {
        showNotice(`폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`);
        return;
      }
      state.creatingThreadFolderId = button.dataset.startThreadFolderCreate;
      render();
      window.setTimeout(() => document.querySelector("[data-thread-folder-create-form] input")?.focus(), 0);
    });
  });

  document.querySelectorAll("[data-cancel-thread-folder-create]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.creatingThreadFolderId = null;
      render();
    });
  });

  document.querySelectorAll("[data-thread-folder-create-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      createMakeFolderAndMoveThread(form.dataset.threadFolderCreateForm, new FormData(form).get("folderName"));
    });
  });

  document.querySelectorAll("[data-folder-edit-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      renameMakeFolder(form.dataset.folderEditForm, new FormData(form).get("folderName"));
    });
  });

  document.querySelectorAll("[data-open-thread]").forEach((button) => {
    button.addEventListener("click", () => {
      state.openThreadMenuId = null;
      openRecentThread(button.dataset.openThread);
    });
  });

  document.querySelectorAll("[data-delete-thread]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openThreadMenuId = null;
      openConfirmAction({
        type: "delete-thread",
        targetId: button.dataset.deleteThread,
        title: "대화 삭제",
        message: "이 대화를 최근 대화 목록에서 삭제할까요?",
        confirmLabel: "삭제",
        danger: true,
      });
    });
  });

  const authForm = document.querySelector("[data-auth-form]");
  if (authForm) {
    authForm.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.name === "userId") {
        normalizeUserIdInput(target);
        updateUserIdWarning(target);
      }

      if (state.authView === "signup") {
        saveAuthDraftFromForm();
        if ((target.name === "nickname" || target.name === "userId") && state.authDuplicateChecks[target.name] !== target.value.trim()) {
          delete state.authDuplicateChecks[target.name];
          const checkButton = target.closest(".auth-check-row")?.querySelector("[data-check-duplicate]");
          if (checkButton) {
            checkButton.textContent = "중복 확인";
            checkButton.disabled = false;
          }
        }
      }
    });

    authForm.querySelectorAll("input[type='password']").forEach((input) => {
      input.addEventListener("keydown", (event) => updateCapsLockWarning(input, event));
      input.addEventListener("keyup", (event) => updateCapsLockWarning(input, event));
      input.addEventListener("blur", () => updateCapsLockWarning(input, null));
    });

    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      saveAuthDraftFromForm();
      const formData = new FormData(authForm);
      const isSignup = state.authView === "signup";
      const isFindId = state.authView === "find-id";
      const isFindPassword = state.authView === "find-password";
      const isWithdraw = state.authView === "withdraw";
      const userId = String(formData.get("userId") || "").trim();
      const password = String(formData.get("password") || "").trim();
      const userIdWarning = getUserIdValidationMessage(userId);

      if (isWithdraw) {
        if (!password) {
          window.alert("회원탈퇴를 위해 비밀번호를 입력해주세요.");
          return;
        }
        openConfirmAction({
          type: "withdraw",
          title: "회원탈퇴",
          message: "정말 회원탈퇴를 진행할까요? 탈퇴 후에는 이 계정으로 다시 로그인할 수 없습니다.",
          confirmLabel: "회원탈퇴",
          danger: true,
          password,
        });
        return;
      }

      if (isFindId) {
        const name = String(formData.get("name") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        const email = String(formData.get("email") || "").trim();
        if (!name || !email) {
          window.alert("이름과 이메일을 입력해주세요.");
          return;
        }
        if (!isValidEmail(email)) {
          window.alert("이메일 형식을 확인해주세요.");
          return;
        }
        if (phone && !isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        try {
          const api = window.TTALKAK_API;
          const result = api?.findId ? await api.findId({ method: "email", name, email, phone }) : null;
          const maskedUserId = result?.maskedUserId || "";
          showNotice(maskedUserId ? `찾은 아이디: ${maskedUserId}` : "일치하는 아이디가 없습니다.");
        } catch (error) {
          const backendMessage = error?.payload?.message || error?.message || "";
          window.alert(backendMessage || "아이디 찾기 요청에 실패했습니다.");
          return;
        }
        state.authView = "login";
        return;
      }

      if (isFindPassword) {
        const phone = String(formData.get("phone") || "").trim();
        const email = String(formData.get("email") || "").trim();
        if (!userId || !email) {
          window.alert("아이디와 이메일을 입력해주세요.");
          return;
        }
        if (userIdWarning) {
          window.alert(userIdWarning);
          return;
        }
        if (!isValidEmail(email)) {
          window.alert("이메일 형식을 확인해주세요.");
          return;
        }
        if (phone && !isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        try {
          const api = window.TTALKAK_API;
          if (api?.requestPasswordReset) await api.requestPasswordReset({ userId, email, phone });
          showNotice("비밀번호 재설정 요청을 보냈습니다.");
        } catch (error) {
          const backendMessage = error?.payload?.message || error?.message || "";
          window.alert(backendMessage || "비밀번호 재설정 요청에 실패했습니다.");
          return;
        }
        state.authView = "login";
        return;
      }

      if (isSignup) {
        const nickname = String(formData.get("nickname") || "").trim();
        const requiredFields = [
          ["nickname", "닉네임"],
          ["name", "이름"],
          ["userId", "아이디"],
          ["email", "이메일"],
          ["password", "비밀번호"],
          ["passwordConfirm", "비밀번호 확인"],
        ];
        const missingFields = requiredFields
          .filter(([name]) => !String(formData.get(name) || "").trim())
          .map(([, label]) => label);

        if (missingFields.length > 0) {
          window.alert(`다음 정보를 입력해주세요: ${missingFields.join(", ")}`);
          return;
        }
        if (userIdWarning) {
          window.alert(userIdWarning);
          return;
        }
        const email = String(formData.get("email") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        if (!isValidEmail(email)) {
          window.alert("이메일 형식을 확인해주세요.");
          return;
        }
        if (phone && !isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }

        if (isDuplicateAuthValue("nickname", nickname)) {
          window.alert("이미 사용 중인 닉네임입니다.");
          return;
        }
        if (isDuplicateAuthValue("userId", userId)) {
          window.alert("이미 사용 중인 아이디입니다.");
          return;
        }
        if (state.authDuplicateChecks.nickname !== nickname || state.authDuplicateChecks.userId !== userId) {
          window.alert("닉네임과 아이디 중복 확인을 완료해주세요.");
          return;
        }

        const birth = String(formData.get("birth") || "").trim();
        if (isFutureDate(birth)) {
          window.alert("생년월일은 오늘 이후 날짜로 입력할 수 없습니다.");
          return;
        }
        if (password.length < 8) {
          window.alert("비밀번호는 8자 이상 입력해주세요.");
          return;
        }
        if (formData.get("terms") !== "on" || formData.get("privacy") !== "on") {
          window.alert("사이트 이용 약관과 개인정보 수집 및 이용에 동의해주세요.");
          return;
        }
      } else if (!userId || !password) {
        window.alert("아이디와 비밀번호를 모두 입력해주세요.");
        return;
      } else if (userIdWarning) {
        window.alert(userIdWarning);
        return;
      }

      if (isSignup && formData.get("password") !== formData.get("passwordConfirm")) {
        window.alert("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        return;
      }

      const api = window.TTALKAK_API;
      if (!api?.login) {
        window.alert("백엔드 로그인 API를 찾을 수 없습니다. api.js 로드 순서를 확인해주세요.");
        return;
      }

      try {
        const authPayload = isSignup
          ? {
              nickname: String(formData.get("nickname") || "").trim(),
              name: String(formData.get("name") || "").trim(),
              userId,
              email: String(formData.get("email") || "").trim(),
              phone: String(formData.get("phone") || "").trim(),
              birth: String(formData.get("birth") || "").trim(),
              password,
              passwordConfirm: String(formData.get("passwordConfirm") || "").trim(),
              agreeTerms: formData.get("terms") === "on",
              agreePrivacy: formData.get("privacy") === "on",
            }
          : { userId, password };
        const authResponse = isSignup && api.signup ? await api.signup(authPayload) : await api.login(authPayload);
        const authResult = normalizeAuthResult(authResponse, userId);

        if (!authResult.token) {
          window.alert("로그인 응답에 accessToken이 없습니다. 백엔드 응답 형식을 확인해주세요.");
          return;
        }

        applyAuthenticatedUser(authResult);
        state.authView = null;
        state.authDraft = {};
        state.authDuplicateChecks = {};
        state.authUserIdWarning = "";
        showNotice(isSignup ? "회원가입이 완료되었습니다." : "로그인했습니다.");
        await loadMakeBackendData({ shouldRender: false });
        render();
      } catch (error) {
        if (!isSignup && isAdminDemoCredential(userId, password) && isBackendConnectionError(error)) {
          applyAdminDemoFallback();
          return;
        }

        const backendMessage = error?.payload?.message || error?.message || "";
        window.alert(backendMessage || "로그인 요청에 실패했습니다.");
      }
    });
  }

  const shareForm = document.querySelector(".share-form");
  if (shareForm) {
    shareForm.addEventListener("input", () => {
      const formData = new FormData(shareForm);
      updateShareDraft(formData);
      updateSharePreview(formData);
    });

    const tagSearchInput = shareForm.querySelector("input[name='tagSearch']");
    if (tagSearchInput) {
      tagSearchInput.addEventListener("compositionstart", () => {
        state.isComposingShareTag = true;
      });
      tagSearchInput.addEventListener("compositionend", () => {
        state.isComposingShareTag = false;
        updateShareTagQuery(tagSearchInput.value);
      });
      tagSearchInput.addEventListener("input", (event) => {
        if (state.isComposingShareTag || event.isComposing) return;
        updateShareTagQuery(tagSearchInput.value);
      });
      tagSearchInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || state.isComposingShareTag || event.isComposing) return;
        event.preventDefault();
        addShareTag(tagSearchInput.value);
      });
    }

    shareForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sharePrompt(new FormData(shareForm));
    });
  }

  document.querySelectorAll("[data-remove-share-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      removeShareTag(button.dataset.removeShareTag);
    });
  });

  document.querySelectorAll("[data-add-share-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      addShareTag(button.dataset.addShareTag);
    });
  });

  const reportForm = document.querySelector("[data-report-form]");
  if (reportForm) {
    reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitReport(reportForm.dataset.reportType, reportForm.dataset.reportForm, new FormData(reportForm).get("reason"));
    });
  }

  const promptEditForm = document.querySelector("[data-prompt-edit-form]");
  if (promptEditForm) {
    promptEditForm.addEventListener("submit", (event) => {
      event.preventDefault();
      updateOwnPrompt(promptEditForm.dataset.promptEditForm, new FormData(promptEditForm));
    });
  }

  const adminRevisionRequestForm = document.querySelector("[data-admin-revision-request-form]");
  if (adminRevisionRequestForm) {
    adminRevisionRequestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      requestPromptRevision(adminRevisionRequestForm.dataset.adminRevisionRequestForm, new FormData(adminRevisionRequestForm).get("reason"));
    });
  }

  document.querySelectorAll("[data-comment-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      addPromptComment(form.dataset.commentForm, new FormData(form).get("comment"));
    });
  });

  document.querySelectorAll("[data-reply-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      addCommentReply(form.dataset.replyForm, new FormData(form).get("reply"));
    });
  });

  document.querySelectorAll("[data-edit-comment-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateOwnComment(form.dataset.editCommentForm, new FormData(form).get("comment"));
    });
  });

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

  document.querySelectorAll("[data-delete-comment]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteOwnComment(button.dataset.deleteComment);
    });
  });

  document.querySelectorAll("[data-edit-comment]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleEditComment(button.dataset.editComment);
    });
  });

  document.querySelectorAll("[data-like-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleLikeComment(button.dataset.likeComment);
    });
  });

  document.querySelectorAll("[data-reply-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleReplyForm(button.dataset.replyComment);
    });
  });

  document.querySelectorAll("[data-report-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      openReportComment(button.dataset.reportComment);
    });
  });
}

function toggleSavedPrompt(promptId) {
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 저장할 수 있습니다.");
    return;
  }

  const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);

  if (savedIndex >= 0) {
    const savedPrompt = savedPrompts[savedIndex];
    const isSavedByMe = Boolean(savedPrompt.savedByMe);
    const wasHiddenDemoPrompt = isHiddenDemoLibraryPrompt(savedPrompt);

    if (!isSavedByMe || wasHiddenDemoPrompt) {
      savedPrompt.savedByMe = true;
      state.userLibraryPromptIds.add(promptId);
      state.pendingUnsaveIds.delete(promptId);
      updatePromptField(promptId, "saves", 1);
      if (isBackendNumericId(promptId)) callBackendApi("savePrompt", promptId).then(refreshMyPageDataAfterMutation);
      showNotice("저장했습니다.");
      return;
    }

    if (state.route === "saved" && state.myBackendStatus === "connected" && isBackendNumericId(promptId)) {
      savedPrompt.savedByMe = false;
      state.pendingUnsaveIds.delete(promptId);
      state.userLibraryPromptIds.delete(promptId);
      state.backendLibraryPromptIds.delete(promptId);
      updatePromptField(promptId, "saves", -1);
      callBackendApi("unsavePrompt", promptId).then(refreshMyPageDataAfterMutation);
      showNotice("저장을 취소했습니다.");
      return;
    }

    if (state.route === "saved") {
      const wasPending = state.pendingUnsaveIds.has(promptId);

      if (wasPending) {
        state.pendingUnsaveIds.delete(promptId);
        updatePromptField(promptId, "saves", 1);
        showNotice("저장 취소를 되돌렸습니다.");
      } else {
        state.pendingUnsaveIds.add(promptId);
        updatePromptField(promptId, "saves", -1);
        showNotice("다른 화면으로 이동하면 저장 목록에서 사라집니다.");
      }

      return;
    }

    if (savedPrompt.source === "mine") {
      savedPrompt.savedByMe = false;
    } else {
      savedPrompts.splice(savedIndex, 1);
    }
    state.userLibraryPromptIds.delete(promptId);
    updatePromptField(promptId, "saves", -1);
    if (isBackendNumericId(promptId)) callBackendApi("unsavePrompt", promptId).then(refreshMyPageDataAfterMutation);
    if (state.detailPromptId === promptId && !findPromptById(promptId)) {
      state.detailPromptId = null;
    }
    showNotice("저장을 취소했습니다.");
    return;
  }

  const prompt = findPromptById(promptId);
  if (!prompt) return;

  if (state.pendingUnsaveIds.has(promptId)) {
    state.pendingUnsaveIds.delete(promptId);
    updatePromptField(promptId, "saves", 1);
    showNotice("저장 취소를 되돌렸습니다.");
    return;
  }

  updatePromptField(promptId, "saves", 1);
  const updatedPrompt = findPromptById(promptId) || prompt;

  savedPrompts.unshift({
    ...updatedPrompt,
    source: prompt.source === "mine" ? "mine" : "community",
    savedByMe: true,
  });
  state.userLibraryPromptIds.add(promptId);
  if (isBackendNumericId(promptId)) callBackendApi("savePrompt", promptId).then(refreshMyPageDataAfterMutation);

  showNotice("저장했습니다.");
}

function toggleLikePrompt(promptId) {
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 좋아요를 누를 수 있습니다.");
    return;
  }

  const isLiked = state.likedPromptIds.has(promptId);
  if (isLiked) {
    state.likedPromptIds.delete(promptId);
    updatePromptField(promptId, "likes", -1);
    if (isBackendNumericId(promptId)) callBackendApi("unlikePrompt", promptId).then(refreshMyPageDataAfterMutation);
  } else {
    state.likedPromptIds.add(promptId);
    updatePromptField(promptId, "likes", 1);
    if (isBackendNumericId(promptId)) callBackendApi("likePrompt", promptId).then(refreshMyPageDataAfterMutation);
  }
  showNotice(isLiked ? "좋아요를 취소했습니다." : "좋아요를 눌렀습니다.");
}

function openReportPrompt(promptId) {
  if (!findPromptById(promptId)) return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 신고할 수 있습니다.");
    render();
    return;
  }
  if (state.reportedPromptIds.has(promptId)) {
    showNotice("이미 신고한 프롬프트입니다.");
    return;
  }
  state.reportPromptId = promptId;
  state.reportCommentId = null;
  render();
}

function openReportComment(commentId) {
  if (!findCommentById(commentId)) return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 신고할 수 있습니다.");
    render();
    return;
  }
  if (state.reportedCommentIds.has(commentId)) {
    showNotice("이미 신고한 댓글입니다.");
    return;
  }
  state.reportCommentId = commentId;
  state.reportPromptId = null;
  render();
}

function submitReport(type, targetId, reason) {
  if (type === "comment") {
    reportComment(targetId, reason);
    return;
  }
  reportPrompt(targetId, reason);
}

function reportPrompt(promptId, reason) {
  const content = String(reason || "").trim();
  if (!content) {
    window.alert("신고 이유를 입력해주세요.");
    return;
  }

  state.reportedPromptIds.add(promptId);
  state.reportRecords[`prompt:${promptId}`] = {
    type: "prompt",
    targetId: promptId,
    status: "pending",
    reporter: state.currentUser || "",
    reason: content,
    createdAt: Date.now(),
  };
  state.reportPromptId = null;
  if (isBackendNumericId(promptId)) {
    callBackendApi("reportPrompt", promptId, { reason: content });
  }
  showNotice("신고가 접수되었습니다.");
}

function reportComment(commentId, reason) {
  const content = String(reason || "").trim();
  if (!content) {
    window.alert("신고 이유를 입력해주세요.");
    return;
  }

  const context = findCommentContextById(commentId);
  state.reportedCommentIds.add(commentId);
  state.reportRecords[`comment:${commentId}`] = {
    type: "comment",
    targetId: commentId,
    promptId: context?.promptId || "",
    reporter: state.currentUser || "",
    targetAuthor: context?.comment?.author || context?.comment?.owner || "",
    targetPreview: makePreview(context?.comment?.text || ""),
    status: "pending",
    reason: content,
    createdAt: Date.now(),
  };
  state.reportCommentId = null;
  if (isBackendNumericId(commentId)) {
    callBackendApi("reportComment", commentId, { reason: content });
  }
  showNotice("댓글 신고가 접수되었습니다.");
}

function openShareFromSaved(promptId) {
  const prompt = savedPrompts.find((item) => item.id === promptId);
  if (!prompt) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    return render();
  }

  state.shareDraft = {
    promptId,
    title: prompt.title,
    text: prompt.text,
    tags: prompt.tags?.filter((tag) => tag !== "내프롬프트" && tag !== "Make" && tag !== "첨삭") || [],
  };
  state.shareError = "";
  state.route = "share";
  render();
}

function updateShareDraft(formData) {
  state.shareDraft = {
    ...(state.shareDraft || {}),
    title: String(formData.get("title") || ""),
    text: String(formData.get("prompt") || ""),
    tags: parseSharedTags(String(formData.get("tags") || "")),
  };
}

function addShareTag(value) {
  const tag = String(value || "").replace(/^#+/, "").trim();
  if (!tag) return;
  const currentTags = parseSharedTags(state.shareDraft?.tags?.join(", ") || document.querySelector("input[name='tags']")?.value || "");
  const exists = currentTags.some((item) => normalizeTag(item) === normalizeTag(tag));
  if (!exists) currentTags.push(tag);
  state.shareDraft = { ...(state.shareDraft || {}), tags: currentTags };
  state.shareTagQuery = "";
  state.isComposingShareTag = false;
  render();
}

function updateShareTagQuery(value) {
  const nextQuery = String(value || "");
  if (state.shareTagQuery === nextQuery) return;

  state.shareTagQuery = nextQuery;
  renderShareTagSuggestions();
}

function renderShareTagSuggestions() {
  const suggestionBox = document.querySelector(".share-tag-suggestions");
  if (!suggestionBox) return;

  const selectedTags = parseSharedTags(document.querySelector("input[name='tags']")?.value || state.shareDraft?.tags?.join(", ") || "");
  const suggestions = getShareTagSuggestions(state.shareTagQuery, selectedTags);
  const query = state.shareTagQuery.trim();

  if (suggestions.length > 0) {
    suggestionBox.innerHTML = suggestions
      .map((tag) => `<button type="button" data-add-share-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
      .join("");
  } else if (query) {
    suggestionBox.innerHTML = `<button class="new-tag-suggestion" type="button" data-add-share-tag="${escapeHtml(query)}">새 태그로 추가: #${escapeHtml(query)}</button>`;
  } else {
    suggestionBox.innerHTML = `<span>기존 해시태그를 검색해 선택할 수 있습니다.</span>`;
  }

  suggestionBox.querySelectorAll("[data-add-share-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      addShareTag(button.dataset.addShareTag);
    });
  });
}

function removeShareTag(value) {
  const target = normalizeTag(value);
  const currentTags = parseSharedTags(state.shareDraft?.tags?.join(", ") || "");
  state.shareDraft = {
    ...(state.shareDraft || {}),
    tags: currentTags.filter((tag) => normalizeTag(tag) !== target),
  };
  render();
}

function getShareTagSuggestions(query, selectedTags = []) {
  const normalizedQuery = normalizeTag(query || "");
  const selected = new Set(selectedTags.map(normalizeTag));
  return getKnownTags()
    .filter((tag) => !selected.has(normalizeTag(tag)))
    .filter((tag) => !normalizedQuery || normalizeTag(tag).includes(normalizedQuery))
    .slice(0, 8);
}

function updateSharePreview(formData) {
  const title = String(formData.get("title") || "").trim() || "프롬프트 제목 미리보기";
  const text = String(formData.get("prompt") || "").trim() || "공유할 프롬프트 내용을 입력하면 이곳에서 Home 카드 형태로 미리 확인할 수 있습니다.";
  const tags = parseSharedTags(String(formData.get("tags") || "")).slice(0, 4);
  const previewTags = tags.length ? tags : ["미리보기", "공유", "프롬프트"];
  const previewTitle = document.querySelector("[data-share-preview-title]");
  const previewText = document.querySelector("[data-share-preview-text]");
  const previewTagRow = document.querySelector("[data-share-preview-tags]");

  if (previewTitle) previewTitle.textContent = title;
  if (previewText) previewText.textContent = text;
  if (previewTagRow) {
    previewTagRow.innerHTML = previewTags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("");
  }
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

function openPromptComments(promptId) {
  incrementPromptViews(promptId);
  state.detailPromptId = promptId;
  state.detailHighlightCommentId = null;
  state.expandedComments[promptId] = true;
  hydratePromptComments(promptId);
  render();
}

async function hydratePromptComments(promptId, options = {}) {
  const api = window.TTALKAK_API;
  if (!api?.getPromptComments || !promptId || !isBackendNumericId(promptId)) return false;

  try {
    const comments = await api.getPromptComments(promptId, state.authToken || state.token || undefined);
    if (Array.isArray(comments)) {
      commentsByPrompt[promptId] = comments;
      syncPromptCommentCount(promptId);
      if (options.render !== false && state.detailPromptId === promptId) render();
      return true;
    }
  } catch (error) {
    console.warn("[TTALKAK] /api/prompts/{id}/comments 호출에 실패해 데모 댓글을 유지합니다.", error);
  }

  return false;
}

function syncPromptCommentCount(promptId) {
  const comments = commentsByPrompt[promptId];
  if (!Array.isArray(comments)) return;

  const commentCount = countCommentThread(comments);
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    prompt.comments = commentCount;
    prompt.commentCount = commentCount;
    updated.add(prompt);
  }
}

function findPromptIdByCommentId(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    if (findCommentInList(comments, commentId)) return promptId;
  }

  return "";
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
    prompt.views += 1;
    updated.add(prompt);
  }
}

function getPromptComments(promptId) {
  return commentsByPrompt[promptId] || [];
}

function getSortedPromptComments(promptId) {
  return getPromptComments(promptId)
    .map((comment, index) => ({ comment, index }))
    .sort((a, b) => getCommentLikes(b.comment) - getCommentLikes(a.comment) || a.index - b.index)
    .map(({ comment }) => comment);
}

function getSortedCommentReplies(comment) {
  return [...(comment.replies || [])]
    .map((reply, index) => ({ reply, index }))
    .sort((a, b) => getCommentLikes(b.reply) - getCommentLikes(a.reply) || a.index - b.index)
    .map(({ reply }) => reply);
}

function findCommentById(commentId) {
  if (!commentId) return null;

  for (const comments of Object.values(commentsByPrompt)) {
    const comment = findCommentInList(comments, commentId);
    if (comment) return comment;
  }

  return null;
}

function findCommentInList(comments, commentId) {
  for (const comment of comments || []) {
    if (comment.id === commentId) return comment;
    const reply = findCommentInList(comment.replies || [], commentId);
    if (reply) return reply;
  }

  return null;
}

function countCommentThread(comments) {
  return (comments || []).reduce((total, comment) => total + (comment.deleted ? 0 : 1) + countCommentThread(comment.replies || []), 0);
}

function getCommentLikes(comment) {
  return Math.max(0, Number(comment?.likes || 0));
}

function toggleLikeComment(commentId) {
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 댓글에 좋아요를 누를 수 있습니다.");
    render();
    return;
  }

  const comment = findCommentById(commentId);
  if (!comment) return;
  if (canDeleteComment(comment)) {
    showNotice("내가 작성한 댓글에는 좋아요를 누를 수 없습니다.");
    return;
  }

  const isLiked = state.likedCommentIds.has(commentId);
  if (isLiked) {
    state.likedCommentIds.delete(commentId);
    comment.likes = Math.max(0, getCommentLikes(comment) - 1);
    callBackendApi("unlikeComment", commentId);
  } else {
    state.likedCommentIds.add(commentId);
    comment.likes = getCommentLikes(comment) + 1;
    callBackendApi("likeComment", commentId);
  }

  showNotice(isLiked ? "댓글 좋아요를 취소했습니다." : "댓글에 좋아요를 눌렀습니다.");
}

function getPromptCommentCount(prompt) {
  const threadCount = countCommentThread(getPromptComments(prompt.id));
  return threadCount || Number(prompt.comments || prompt.commentCount || 0);
}

function getDisplayPromptAuthor(prompt) {
  const author = String(prompt?.author || prompt?.owner || "").trim();
  const owner = String(prompt?.owner || prompt?.author || "").trim();
  const currentUser = String(state.currentUser || "").trim();

  if (state.isLoggedIn && currentUser && (owner === currentUser || author === currentUser || author === "나")) {
    return "나";
  }

  if (author && author !== "나") return author;
  if (owner && owner !== "나") return owner;
  return "익명 사용자";
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

function addPromptComment(promptId, text) {
  const content = String(text || "").trim();
  if (!content) return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("댓글을 작성하려면 로그인이 필요합니다.");
    render();
    return;
  }

  if (!commentsByPrompt[promptId]) {
    commentsByPrompt[promptId] = [];
  }

  commentsByPrompt[promptId].push({
    id: `comment-${Date.now()}`,
    author: state.currentUser || "나",
    owner: state.currentUser || "나",
    text: content,
    likes: 0,
    replies: [],
  });

  state.expandedComments[promptId] = true;
  incrementPromptComments(promptId);
  callBackendApi("addComment", promptId, { text: content }).then(() => {
    if (hasBackendAuthToken()) hydratePromptComments(promptId);
  });
  render();
}

function toggleReplyForm(commentId) {
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    return render();
  }

  state.replyingCommentId = state.replyingCommentId === commentId ? null : commentId;
  render();
}

function addCommentReply(commentId, text) {
  const content = String(text || "").trim();
  if (!content) return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("답글을 작성하려면 로그인이 필요합니다.");
    render();
    return;
  }

  const parentComment = findCommentById(commentId);
  if (!parentComment) return;
  const promptId = findPromptIdByCommentId(commentId);

  if (!Array.isArray(parentComment.replies)) {
    parentComment.replies = [];
  }

  parentComment.replies.push({
    id: `reply-${Date.now()}`,
    author: state.currentUser || "나",
    owner: state.currentUser || "나",
    text: content,
    likes: 0,
    replies: [],
  });

  state.replyingCommentId = null;
  if (promptId) incrementPromptComments(promptId);
  callBackendApi("addReply", commentId, { text: content }).then(() => {
    if (promptId && hasBackendAuthToken()) hydratePromptComments(promptId);
  });
  showNotice("답글을 등록했습니다.");
  render();
}

function toggleEditComment(commentId) {
  if (guardAdminUserAction()) return;

  const comment = findCommentById(commentId);
  if (!comment || !canDeleteComment(comment)) return;

  state.editingCommentId = state.editingCommentId === commentId ? null : commentId;
  state.replyingCommentId = null;
  render();
}

function updateOwnComment(commentId, text) {
  const content = String(text || "").trim();
  if (!content) return;
  if (guardAdminUserAction()) return;

  const comment = findCommentById(commentId);
  if (!comment || !canDeleteComment(comment)) return;
  const promptId = findPromptIdByCommentId(commentId);

  if (comment.text !== content) {
    comment.text = content;
    comment.edited = true;
    if (isBackendNumericId(commentId)) {
      callBackendApi("updateComment", commentId, { text: content }).then(() => {
        if (promptId && hasBackendAuthToken()) hydratePromptComments(promptId);
      });
    }
  }

  const revisionKey = makeRevisionRequestKey("comment", commentId);
  if (state.adminPromptRevisionRequests[revisionKey]) {
    const { [revisionKey]: _resolvedRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
    state.adminPromptRevisionRequests = remainingRequests;
  }

  state.editingCommentId = null;
  showNotice("댓글을 수정했습니다.");
}

function deleteOwnComment(commentId) {
  if (guardAdminUserAction()) return;

  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    const comment = findCommentInList(comments, commentId);
    if (!comment || !canDeleteComment(comment)) continue;

    openConfirmAction({
      type: "delete-comment",
      targetId: commentId,
      title: state.adminMode ? "신고 댓글 삭제" : "댓글 삭제",
      message: state.adminMode ? "신고된 댓글을 삭제할까요? 이 작업은 운영 조치로 기록되어야 합니다." : "이 댓글을 삭제할까요?",
      confirmLabel: "삭제",
      danger: true,
    });
    return;
  }
}

function canDeleteComment(comment) {
  if (!comment) return false;
  if (state.adminMode) return true;
  if (!state.isLoggedIn) return false;
  const owner = comment.owner || comment.author;
  return owner === "나" || owner === state.currentUser || comment.author === state.currentUser;
}

function openConfirmAction(action) {
  state.confirmAction = action;
  render();
}

async function runConfirmedAction() {
  const action = state.confirmAction;
  if (!action) return;

  state.confirmAction = null;

  if (action.type === "delete-prompt") {
    performDeletePrompt(action.targetId);
  }

  if (action.type === "unshare-prompt") {
    performUnsharePrompt(action.targetId);
  }

  if (action.type === "delete-comment") {
    performDeleteComment(action.targetId);
  }

  if (action.type === "delete-thread") {
    performDeleteThread(action.targetId);
  }

  if (action.type === "delete-folder") {
    performDeleteFolder(action.targetId);
  }

  if (action.type === "admin-tag-status") {
    updateAdminTagDecision(action.targetId, action.value);
  }

  if (action.type === "logout") {
    stampCurrentUserOwnedPrompts();
    const wasAdminMode = state.adminMode;
    clearAuthenticatedSession();
    showNotice(wasAdminMode ? "로그아웃하여 관리자 데모를 종료했습니다." : "로그아웃했습니다.");
  }

  if (action.type === "withdraw") {
    const api = window.TTALKAK_API;
    if (!state.authToken && !state.token) {
      state.authView = "login";
      showNotice("로그인이 필요합니다.");
      render();
      return;
    }
    try {
      if (!api?.withdrawAccount) throw new Error("회원탈퇴 API를 찾을 수 없습니다.");
      const result = await api.withdrawAccount({ password: action.password || "" }, state.authToken || state.token);
      clearAuthenticatedSession();
      showNotice(result?.message || "회원탈퇴가 완료되었습니다.");
    } catch (error) {
      handleBackendAccessError(error, "회원탈퇴 요청에 실패했습니다.");
      render();
      return;
    }
  }

  if (action.type === "reset-demo") {
    resetDemoState();
    return;
  }

  render();
}

function performDeleteComment(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    const removed = removeCommentFromList(comments, commentId);
    if (!removed) continue;

    if (isBackendNumericId(commentId)) {
      callBackendApi("deleteComment", commentId).then(() => {
        if (hasBackendAuthToken()) hydratePromptComments(promptId);
      });
    }
    decrementPromptComments(promptId);
    state.likedCommentIds.delete(commentId);
    state.reportedCommentIds.delete(commentId);
    if (state.replyingCommentId === commentId) state.replyingCommentId = null;
    if (state.editingCommentId === commentId) state.editingCommentId = null;
    showNotice("댓글을 삭제했습니다.");
    return;
  }
}

function performDeleteThread(threadId) {
  state.recentThreads = state.recentThreads.filter((thread) => thread.id !== threadId);
  if (state.activeThreadId === threadId) {
    state.activeThreadId = null;
    state.messages = [];
    state.composerDraft = "";
  }
  showNotice("대화를 삭제했습니다.");
}

async function createMakeFolder(folderName) {
  if (guardAdminUserAction()) {
    state.creatingFolder = false;
    render();
    return;
  }

  if (!state.isLoggedIn) {
    state.creatingFolder = false;
    showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
    render();
    return;
  }

  if (getCustomMakeFolderCount() >= MAX_CUSTOM_MAKE_FOLDERS) {
    window.alert(`폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`);
    state.creatingFolder = false;
    render();
    return;
  }

  const cleanName = String(folderName || "").trim();
  if (!cleanName) {
    window.alert("폴더 이름을 입력해주세요.");
    return;
  }

  const exists = state.makeFolders.some((folder) => folder.name === cleanName);
  if (exists) {
    window.alert("이미 같은 이름의 폴더가 있습니다.");
    return;
  }

  const folder = { id: `folder-${Date.now()}`, name: cleanName };
  state.makeFolders.push(folder);
  state.activeFolderId = folder.id;
  state.creatingFolder = false;
  const backendFolderId = await createBackendMakeFolder({ name: cleanName });
  if (backendFolderId) folder.serverId = backendFolderId;
  showNotice("폴더를 추가했습니다.");
  render();
}

async function createMakeFolderAndMoveThread(threadId, folderName) {
  if (guardAdminUserAction()) {
    state.creatingThreadFolderId = null;
    render();
    return;
  }

  if (!state.isLoggedIn) {
    state.creatingThreadFolderId = null;
    showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
    render();
    return;
  }

  const thread = state.recentThreads.find((item) => item.id === threadId);
  if (!thread) return;

  if (getCustomMakeFolderCount() >= MAX_CUSTOM_MAKE_FOLDERS) {
    window.alert(`폴더는 최대 ${MAX_CUSTOM_MAKE_FOLDERS}개까지 만들 수 있습니다.`);
    state.creatingThreadFolderId = null;
    render();
    return;
  }

  const cleanName = String(folderName || "").trim();
  if (!cleanName) {
    window.alert("폴더 이름을 입력해주세요.");
    return;
  }

  const exists = state.makeFolders.some((folder) => folder.name === cleanName);
  if (exists) {
    window.alert("이미 같은 이름의 폴더가 있습니다.");
    return;
  }

  const folder = { id: `folder-${Date.now()}`, name: cleanName };
  state.makeFolders.push(folder);
  thread.folderId = folder.id;
  state.activeFolderId = folder.id;
  state.openThreadMenuId = null;
  state.creatingThreadFolderId = null;
  const backendFolderId = await createBackendMakeFolder({ name: cleanName });
  if (backendFolderId) {
    folder.serverId = backendFolderId;
    await moveThreadToFolderOnBackend(thread, backendFolderId);
  } else {
    console.warn("[TTALKAK] 새 폴더 서버 id가 없어 대화 이동 API는 건너뜁니다. 로컬 데모 상태만 유지합니다.");
  }
  showNotice("새 폴더를 만들고 대화를 이동했습니다.");
  render();
}

function getCustomMakeFolderCount() {
  return state.makeFolders.filter((folder) => folder.id !== "all" && folder.id !== "uncategorized").length;
}

async function renameMakeFolder(folderId, name) {
  if (guardAdminUserAction()) {
    state.editingFolderId = null;
    render();
    return;
  }

  if (!state.isLoggedIn) {
    state.editingFolderId = null;
    showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
    render();
    return;
  }

  const folder = state.makeFolders.find((item) => item.id === folderId);
  const cleanName = String(name || "").trim();
  if (!folder || !cleanName) return;

  folder.name = cleanName;
  state.editingFolderId = null;
  const backendFolderId = getBackendFolderId(folderId);
  if (backendFolderId) {
    callBackendApi("updateMakeFolder", backendFolderId, { name: cleanName });
  }
  showNotice("폴더 이름을 수정했습니다.");
  render();
}

function performDeleteFolder(folderId) {
  if (guardAdminUserAction()) {
    render();
    return;
  }

  if (!state.isLoggedIn) {
    showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
    render();
    return;
  }

  if (!folderId || folderId === "uncategorized") return;
  const backendFolderId = getBackendFolderId(folderId);
  state.makeFolders = state.makeFolders.filter((folder) => folder.id !== folderId);
  state.recentThreads.forEach((thread) => {
    if (thread.folderId === folderId) thread.folderId = "uncategorized";
  });
  if (state.activeFolderId === folderId) state.activeFolderId = "all";
  if (backendFolderId) {
    callBackendApi("deleteMakeFolder", backendFolderId);
  }
  showNotice("폴더를 삭제했습니다.");
}

async function moveThreadToFolder(threadId, folderId) {
  if (guardAdminUserAction()) {
    render();
    return;
  }

  if (!state.isLoggedIn) {
    showNotice("로그인하면 대화를 폴더로 정리할 수 있습니다.");
    render();
    return;
  }

  const thread = state.recentThreads.find((item) => item.id === threadId);
  if (!thread) return;
  thread.folderId = folderId || "uncategorized";
  await moveThreadToFolderOnBackend(thread, getBackendFolderId(thread.folderId));
  showNotice("대화 폴더를 변경했습니다.");
  render();
}

async function moveThreadToFolderOnBackend(thread, backendFolderId) {
  const api = window.TTALKAK_API;
  if (!api?.moveMakeThread) return;

  const backendThreadId = await ensureBackendMakeThreadId(thread);
  if (!backendThreadId) {
    console.warn("[TTALKAK] 서버 대화 id가 없어 폴더 이동 API는 건너뜁니다. 로컬 데모 상태만 유지합니다.");
    return;
  }

  try {
    await api.moveMakeThread(
      backendThreadId,
      { folderId: isBackendNumericId(backendFolderId) ? Number(backendFolderId) : null },
      state.authToken || state.token || undefined,
    );
  } catch (error) {
    handleBackendAccessError(error, "대화 폴더 이동 요청에 실패해 로컬 데모 상태만 유지합니다.");
    console.warn("[TTALKAK] /api/make/threads/{id}/folder 호출에 실패해 로컬 데모 상태만 유지합니다.", error);
  }
}

function countThreadsInFolder(folderId) {
  return state.recentThreads.filter((thread) => getThreadFolderId(thread) === folderId).length;
}

function getThreadFolderId(thread) {
  return thread.folderId || "uncategorized";
}

function getActiveFolderName() {
  if (state.activeFolderId === "all") return "최근 대화";
  return state.makeFolders.find((folder) => folder.id === state.activeFolderId)?.name || "최근 대화";
}

function removeCommentFromList(comments, commentId) {
  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index];
    if (comment.id === commentId && canDeleteComment(comment)) {
      if ((comment.replies || []).length > 0) {
        comment.deleted = true;
        comment.text = "삭제된 댓글입니다.";
        comment.author = "삭제된 댓글";
        comment.owner = null;
        comment.likes = 0;
        comment.edited = false;
        return true;
      }

      comments.splice(index, 1);
      return true;
    }

    if (removeCommentFromList(comment.replies || [], commentId)) {
      return true;
    }
  }

  return false;
}

function resetDemoState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures in preview mode.
  }
  window.location.reload();
}

function toggleLibraryDemoData() {
  state.libraryDemoSeeded = !state.libraryDemoSeeded;
  state.savedPage = 1;
  showNotice(state.libraryDemoSeeded ? "보관함 데모 데이터를 표시합니다." : "보관함 데모 데이터를 숨겼습니다.");
  render();
}

function incrementPromptComments(promptId) {
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    prompt.comments += 1;
    updated.add(prompt);
  }
}

function decrementPromptComments(promptId) {
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    prompt.comments = Math.max(0, prompt.comments - 1);
    updated.add(prompt);
  }
}

async function copyMakeMessage(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  const finalPrompt = getFinalPromptText(message);

  try {
    await navigator.clipboard.writeText(finalPrompt);
  } catch (_error) {
    fallbackCopyText(finalPrompt);
  }

  state.copiedMessageId = messageId;
  showNotice("프롬프트를 복사했습니다.");
  window.setTimeout(() => {
    if (state.copiedMessageId !== messageId) return;
    state.copiedMessageId = "";
    render();
  }, 1100);
}

function saveMakeMessage(messageId) {
  if (guardAdminUserAction()) return;

  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  const finalPrompt = getFinalPromptText(message);

  const savedIndex = savedPrompts.findIndex((item) => item.id === messageId);
  if (savedIndex >= 0) {
    savedPrompts.splice(savedIndex, 1);
    state.userLibraryPromptIds.delete(messageId);
    state.savedPage = 1;
    showNotice("저장한 프롬프트에서 제거했습니다.");
    render();
    return;
  }

  savedPrompts.unshift({
    id: message.id,
    title: makePromptTitle(message.sourcePrompt || finalPrompt),
    text: finalPrompt,
    tags: ["내프롬프트", "Make", "첨삭"],
    views: 0,
    comments: 0,
    saves: 1,
    author: state.currentUser || "나",
    owner: state.currentUser || "나",
    source: "mine",
    isShared: false,
    savedByMe: true,
    sourcePrompt: message.sourcePrompt || finalPrompt,
    messages: state.messages.map((item) => ({ ...item })),
  });
  state.userLibraryPromptIds.add(message.id);

  state.savedPage = 1;
  showNotice("저장한 프롬프트에 추가했습니다.");
  render();
}

async function resendEditedMessage(messageId, value) {
  const cleanValue = String(value || "").trim();
  const index = state.messages.findIndex((message) => message.id === messageId && message.role === "user");
  if (index < 0 || !cleanValue) return;
  if (guardAdminUserAction()) return;

  const now = Date.now();
  const assistantMessageId = `make-${now}`;
  state.messages = state.messages.slice(0, index + 1);
  state.messages[index] = { ...state.messages[index], content: cleanValue, editedAt: now };
  const improvedPrompt = await improvePromptWithBackend(cleanValue);
  state.messages.push({
    id: assistantMessageId,
    role: "assistant",
    content: improvedPrompt,
    sourcePrompt: cleanValue,
  });
  state.editingMessageId = null;
  pendingLatestMessageScrollId = assistantMessageId;
  updateRecentThread(state.activeThreadId || `thread-${now}`);
  syncMakeThreadWithBackend(state.activeThreadId || `thread-${now}`);
  showNotice("수정한 메시지로 다시 전송했습니다.");
  render();
}

function openShareFromMakeMessage(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("공유하려면 로그인이 필요합니다.");
    return;
  }

  const finalPrompt = getFinalPromptText(message);
  state.shareDraft = {
    promptId: `make-share-${message.id}`,
    title: makePromptTitle(message.sourcePrompt || finalPrompt),
    text: finalPrompt,
    tags: ["내프롬프트", "Make", "첨삭"],
  };
  state.shareError = "";
  state.route = "share";
  render();
}

function openExecuteModal(messageId) {
  if (!state.messages.some((item) => item.id === messageId)) return;
  state.executeMessageId = messageId;
  state.executePromptId = null;
  render();
}

function openPromptExecuteModal(promptId) {
  if (!findPromptById(promptId)) return;
  state.executePromptId = promptId;
  state.executeMessageId = null;
  render();
}

async function executeMakeMessage(messageId, targetId) {
  const message = state.messages.find((item) => item.id === messageId);
  const prompt = findPromptById(state.executePromptId);
  const finalPrompt = message ? getFinalPromptText(message) : String(prompt?.text || "").trim();
  if (!finalPrompt) return;
  const target = getExecuteTarget(targetId);
  if (!target) return;
  window.open(target.url, "_blank", "noopener,noreferrer");

  try {
    await navigator.clipboard.writeText(finalPrompt);
  } catch (_error) {
    fallbackCopyText(finalPrompt);
  }

  state.executeMessageId = null;
  state.executePromptId = null;
  showNotice(`${target.name}로 이동합니다. 복사된 프롬프트를 입력란에 붙여넣어 실행하세요.`);
  render();
}

function getExecuteTarget(targetId) {
  const targets = {
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
    gemini: { name: "Google Gemini", url: "https://gemini.google.com/" },
    claude: { name: "Claude", url: "https://claude.ai/" },
  };

  return targets[targetId] || null;
}

function updateRecentThread(threadId) {
  const lastUser = [...state.messages].reverse().find((message) => message.role === "user");
  const firstUser = state.messages.find((message) => message.role === "user");
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === "assistant");
  const existingThread = state.recentThreads.find((item) => item.id === threadId);
  const thread = {
    id: threadId,
    dedupeKey: threadId,
    title: makePromptTitle(lastUser?.content || "새 대화"),
    preview: makePreview(lastAssistant?.content || lastUser?.content || ""),
    createdAt: existingThread?.createdAt || Date.now(),
    folderId: existingThread?.folderId || (state.activeFolderId !== "all" ? state.activeFolderId : "uncategorized"),
    serverId: existingThread?.serverId || "",
    messages: state.messages.map((item) => ({ ...item })),
  };

  state.recentThreads = [thread, ...state.recentThreads.filter((item) => item.id !== threadId)].slice(0, 8);
}

function openRecentThread(threadId) {
  const thread = state.recentThreads.find((item) => item.id === threadId);
  if (!thread) return;

  state.activeThreadId = thread.id;
  state.messages = thread.messages.map((item) => ({ ...item }));
  state.route = "make";
  render();
}

function openSavedMakePrompt(promptId) {
  const prompt = savedPrompts.find((item) => item.id === promptId);
  if (!prompt?.messages?.length) return;

  const threadId = `saved-thread-${promptId}`;
  state.activeThreadId = threadId;
  state.messages = prompt.messages.map((item) => ({ ...item }));
  updateRecentThread(threadId);
  state.route = "make";
  render();
}

function startNewChat() {
  state.activeThreadId = null;
  state.messages = [];
  state.copiedMessageId = "";
  state.composerDraft = "";
  render();
}

function getRecentThreadKeyFromThread(thread) {
  return thread.id || thread.dedupeKey || "";
}

function getRecentThreadKey(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function applyTemplate(templateId) {
  const template = promptTemplates.find((item) => item.id === templateId);
  if (!template) return;

  state.composerDraft = template.prompt;
  render();
  window.setTimeout(() => {
    const textarea = document.querySelector("[data-autosize-textarea]");
    if (!textarea) return;
    textarea.focus();
    const firstBlankLine = textarea.value.split("\n").findIndex((line) => /:\s*$/.test(line));
    const lines = textarea.value.split("\n");
    const targetLineIndex = firstBlankLine >= 0 ? firstBlankLine : lines.length - 1;
    const cursorPosition = lines.slice(0, targetLineIndex + 1).join("\n").length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
    autosizeTextarea(textarea);
  }, 0);
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function makePromptTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Make에서 저장한 프롬프트";
  return clean.length > 26 ? `${clean.slice(0, 26)}...` : clean;
}

function makePreview(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "대화 내용 없음";
  return clean.length > 44 ? `${clean.slice(0, 44)}...` : clean;
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

function deleteOwnPrompt(promptId) {
  const prompt = findPromptById(promptId);
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 본인 프롬프트만 삭제할 수 있습니다.");
    return;
  }
  if (!prompt || prompt.source !== "mine") return;

  openConfirmAction({
    type: "delete-prompt",
    targetId: promptId,
    title: "프롬프트 삭제",
    message: "이 프롬프트를 정말 삭제할까요? 삭제하면 Saved와 Home에서 모두 사라집니다.",
    confirmLabel: "삭제",
    danger: true,
  });
}

function unshareOwnPrompt(promptId) {
  const prompt = findPromptById(promptId);
  if (guardAdminUserAction()) return;

  if (!state.adminMode && !state.isLoggedIn) {
    state.authView = "login";
    showNotice("로그인 후 본인 프롬프트만 공유 취소할 수 있습니다.");
    return;
  }
  if (!prompt || (prompt.source !== "mine" && !state.adminMode)) return;

  openConfirmAction({
    type: "unshare-prompt",
    targetId: promptId,
    title: "공유 취소",
    message: "공유를 취소하면 Home과 검색 결과에서 이 프롬프트가 사라집니다. 계속할까요?",
    confirmLabel: "공유 취소",
    danger: false,
  });
}

async function publishSavedPrompt(promptId) {
  const prompt = savedPrompts.find((item) => item.id === promptId);
  if (!prompt || prompt.source !== "mine") return;
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    render();
    return;
  }

  let backendPrompt = null;
  if (isBackendNumericId(promptId) && window.TTALKAK_API?.shareExistingPrompt) {
    try {
      backendPrompt = await window.TTALKAK_API.shareExistingPrompt(promptId, state.authToken || state.token || undefined);
    } catch (error) {
      handleBackendAccessError(error, "공유 상태 변경 요청에 실패했습니다.");
      return;
    }
  }

  if (backendPrompt) {
    Object.assign(prompt, backendPrompt, {
      source: "mine",
      isShared: true,
      savedByMe: prompt.savedByMe,
      author: state.currentUser || backendPrompt.author,
      owner: state.currentUser || backendPrompt.owner || backendPrompt.author,
    });
  }

  prompt.isShared = true;
  prompt.source = "mine";
  prompt.author = state.currentUser || prompt.author || "나";
  prompt.owner = state.currentUser || prompt.owner || prompt.author;
  prompt.createdAt = prompt.createdAt || Date.now();

  const popularIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
  if (popularIndex >= 0) {
    popularPrompts[popularIndex] = { ...popularPrompts[popularIndex], ...prompt, isShared: true, source: "mine" };
  } else {
    popularPrompts.unshift({ ...prompt, isShared: true, source: "mine" });
  }

  state.popularSort = "latest";
  state.popularPage = 1;
  state.userLibraryPromptIds.add(prompt.id);
  showNotice("프롬프트를 공유됨 상태로 전환했습니다.");
  render();
}

async function updateOwnPrompt(promptId, formData) {
  const prompt = findPromptById(promptId);
  if (!prompt || prompt.source !== "mine") return;
  if (guardAdminUserAction()) return;

  const title = String(formData.get("title") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const tags = parseSharedTags(String(formData.get("tags") || ""));

  if (!title || !text || tags.length === 0) {
    window.alert("제목, 프롬프트, 해시태그를 모두 입력해주세요.");
    return;
  }

  let backendPrompt = null;
  if (isBackendNumericId(promptId) && window.TTALKAK_API?.updatePrompt) {
    try {
      backendPrompt = await window.TTALKAK_API.updatePrompt(
        promptId,
        { title, text, tags },
        state.authToken || state.token || undefined,
      );
    } catch (error) {
      handleBackendAccessError(error, "프롬프트 수정 요청에 실패했습니다.");
      return;
    }
  }

  const nextValues = backendPrompt
    ? { ...backendPrompt, source: "mine", savedByMe: prompt.savedByMe, isShared: prompt.isShared }
    : { title, text, tags, updatedAt: Date.now() };

  [popularPrompts, savedPrompts].forEach((list) => {
    const item = list.find((entry) => entry.id === promptId);
    if (!item) return;
    Object.assign(item, nextValues);
  });

  const revisionKey = makeRevisionRequestKey("prompt", promptId);
  if (state.adminPromptRevisionRequests[revisionKey] || state.adminPromptRevisionRequests[promptId]) {
    const { [revisionKey]: _resolvedRequest, [promptId]: _legacyRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
    state.adminPromptRevisionRequests = remainingRequests;
  }

  state.editingPromptId = null;
  showNotice("프롬프트를 수정했습니다.");
  render();
}

function performDeletePrompt(promptId) {
  if (isBackendNumericId(promptId)) {
    callBackendApi("deletePrompt", promptId);
  }
  removePromptById(popularPrompts, promptId);
  removePromptById(savedPrompts, promptId);
  state.userLibraryPromptIds.delete(promptId);
  state.backendLibraryPromptIds.delete(promptId);
  state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
  normalizeSavedPage();
  showNotice("프롬프트를 삭제했습니다.");
}

function performUnsharePrompt(promptId) {
  const prompt = findPromptById(promptId);
  if (!prompt || prompt.source !== "mine") return;

  removePromptById(popularPrompts, promptId);
  const savedPrompt = savedPrompts.find((item) => item.id === promptId);
  if (savedPrompt) {
    savedPrompt.isShared = false;
    savedPrompt.source = "mine";
  } else {
    savedPrompts.unshift({ ...prompt, isShared: false, source: "mine" });
  }

  state.popularPage = 1;
  state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
  if (isBackendNumericId(promptId)) {
    callBackendApi("unsharePrompt", promptId);
  }
  showNotice("프롬프트 공유를 취소했습니다.");
}

function removePromptById(list, promptId) {
  const index = list.findIndex((item) => item.id === promptId);
  if (index >= 0) list.splice(index, 1);
}

function normalizeSavedPage() {
  const filteredCount = getSavedPagePrompts().filter((prompt) => matchesSavedFilter(prompt)).length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / SAVED_PAGE_SIZE));
  state.savedPage = Math.min(state.savedPage, totalPages);
}

function togglePasswordVisibility(button) {
  const field = button.closest(".password-field");
  const input = field?.querySelector("input");
  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.innerHTML = shouldShow ? icons.eyeOff : icons.eye;
  button.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
  input.focus();
}

function restoreSearchFocus() {
  if (state.detailPromptId || state.authView || state.reportPromptId || state.reportCommentId || state.confirmAction) return;

  const nextInput = document.querySelector("[data-tag-search]");
  if (!nextInput) return;

  const activeElement = document.activeElement;
  const isEditingField =
    activeElement &&
    activeElement !== document.body &&
    activeElement !== nextInput &&
    activeElement.matches?.("input, textarea, select, [contenteditable='true']");
  if (isEditingField) return;

  nextInput.focus();
  nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
}

function getSavedPagePrompts() {
  if (state.myBackendStatus === "connected") {
    return savedPrompts.filter((prompt) => {
      if (!state.backendLibraryPromptIds.has(prompt.id)) return false;
      return prompt.savedByMe || state.pendingUnsaveIds.has(prompt.id) || state.likedPromptIds.has(prompt.id);
    });
  }

  const merged = savedPrompts.filter(
    (prompt) =>
      !isHiddenDemoLibraryPrompt(prompt) &&
      (prompt.savedByMe || state.pendingUnsaveIds.has(prompt.id) || state.likedPromptIds.has(prompt.id)),
  );
  const seen = new Set(merged.map((prompt) => prompt.id));

  popularPrompts.forEach((prompt) => {
    if (!state.likedPromptIds.has(prompt.id) || seen.has(prompt.id)) return;
    merged.push({ ...prompt, source: prompt.source === "mine" ? "mine" : "community" });
    seen.add(prompt.id);
  });

  return merged;
}

function hasUserLibraryContent() {
  return getSavedPagePrompts().length > 0;
}

function matchesSavedFilter(prompt) {
  const matchesSource =
    (prompt.source === "community" && state.savedFilter.community) ||
    (prompt.source === "mine" && state.savedFilter.mine);

  if (!state.savedFilter.liked) return matchesSource;
  return state.likedPromptIds.has(prompt.id) && matchesSource;
}

function getSavedSorter() {
  const byRecent = (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0);
  const bySaves = (a, b) => getPromptSaveCount(b) - getPromptSaveCount(a);
  const byLikes = (a, b) => getPromptLikes(b) - getPromptLikes(a);
  const byComments = (a, b) => getPromptCommentCount(b) - getPromptCommentCount(a);
  const byViews = (a, b) => Number(b.views || 0) - Number(a.views || 0);

  if (state.savedSort === "saves") return (a, b) => bySaves(a, b) || byRecent(a, b) || byViews(a, b);
  if (state.savedSort === "comments") return (a, b) => byComments(a, b) || bySaves(a, b) || byRecent(a, b);
  if (state.savedSort === "likes") return (a, b) => byLikes(a, b) || bySaves(a, b) || byRecent(a, b);
  if (state.savedSort === "views") return (a, b) => byViews(a, b) || bySaves(a, b) || byRecent(a, b);
  return (a, b) => byRecent(a, b) || bySaves(a, b) || byViews(a, b);
}

function showSearchTipOnce() {
  if (state.searchTipShown) return;

  state.searchTipShown = true;
  state.searchTipVisible = true;
  window.clearTimeout(searchTipTimer);
  render();
  restoreSearchFocus();

  searchTipTimer = window.setTimeout(() => {
    state.searchTipVisible = false;
    document.querySelector("[data-search-help]")?.classList.remove("show-tip");
  }, 2200);
}

function scheduleSearchCommit(value) {
  window.clearTimeout(searchCommitTimer);
  searchCommitTimer = window.setTimeout(() => {
    commitSearchQuery(value);
  }, SEARCH_DEBOUNCE_MS);
}

function commitSearchQuery(value) {
  const nextQuery = String(value || "");
  window.clearTimeout(searchCommitTimer);
  if (state.searchQuery === nextQuery) return;

  state.searchQuery = nextQuery;
  state.popularPage = 1;
  refreshBackendHomePrompts();
  render();
  restoreSearchFocus();
}

function scheduleAdminPromptSearchCommit(value) {
  window.clearTimeout(adminPromptSearchCommitTimer);
  adminPromptSearchCommitTimer = window.setTimeout(() => {
    commitAdminPromptSearchQuery(value);
  }, SEARCH_DEBOUNCE_MS);
}

function commitAdminPromptSearchQuery(value) {
  const nextQuery = String(value || "");
  window.clearTimeout(adminPromptSearchCommitTimer);
  if (state.adminPromptQuery === nextQuery) return;

  state.adminPromptQuery = nextQuery;
  render();
  restoreAdminPromptSearchFocus();
}

function restoreAdminPromptSearchFocus() {
  const nextInput = document.querySelector("[data-admin-prompt-search]");
  if (!nextInput) return;

  nextInput.focus();
  nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
}

function scheduleAdminTagSearchCommit(value) {
  window.clearTimeout(adminTagSearchCommitTimer);
  adminTagSearchCommitTimer = window.setTimeout(() => {
    commitAdminTagSearchQuery(value);
  }, SEARCH_DEBOUNCE_MS);
}

function commitAdminTagSearchQuery(value) {
  const nextQuery = String(value || "");
  window.clearTimeout(adminTagSearchCommitTimer);
  if (state.adminTagQuery === nextQuery) return;

  state.adminTagQuery = nextQuery;
  render();
  restoreAdminTagSearchFocus();
}

function restoreAdminTagSearchFocus() {
  const nextInput = document.querySelector("[data-admin-tag-search]");
  if (!nextInput) return;

  nextInput.focus();
  nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
}

function searchByTag(tag) {
  const cleanTag = String(tag || "").replace(/^#+/, "").trim();
  if (!cleanTag) return;

  window.clearTimeout(searchCommitTimer);
  state.searchScope = "tag";
  state.searchQuery = cleanTag;
  state.popularPage = 1;
  state.detailPromptId = null;
  state.route = "home";
  refreshBackendHomePrompts();
  render();
  restoreSearchFocus();
}

function searchByAuthor(author) {
  const cleanAuthor = String(author || "").trim();
  if (!cleanAuthor) return;

  window.clearTimeout(searchCommitTimer);
  state.searchScope = "author";
  state.searchQuery = cleanAuthor;
  state.popularPage = 1;
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
  state.route = "home";
  refreshBackendHomePrompts();
  render();
  restoreSearchFocus();
}

function openAdminUserActivity(nickname, options = {}) {
  const cleanNickname = String(nickname || "").trim();
  if (!cleanNickname) return;
  const resolvedNickname = resolveAdminUserNickname(cleanNickname);

  state.adminUserQuery = options.keepQuery ? cleanNickname : resolvedNickname;
  state.adminUserActivityNickname = resolvedNickname;
  state.adminTab = "users";
  state.route = "admin";
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
  showNotice(`${resolvedNickname}님의 활동을 조회합니다.`);
  render();
}

function resolveAdminUserNickname(value) {
  const cleanValue = String(value || "").trim();
  const normalizedValue = normalizeAdminSearchText(cleanValue);
  if (!normalizedValue) return cleanValue;

  const nicknames = getAdminKnownNicknames();
  const exactMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname) === normalizedValue);
  if (exactMatch) return exactMatch;

  const startsWithMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname).startsWith(normalizedValue));
  if (startsWithMatch) return startsWithMatch;

  const includesMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname).includes(normalizedValue));
  return includesMatch || cleanValue;
}

function getAdminKnownNicknames() {
  const nicknameMap = new Map();
  const addNickname = (nickname) => {
    const cleanNickname = String(nickname || "").trim();
    const normalizedNickname = normalizeAdminSearchText(cleanNickname);
    if (!normalizedNickname || nicknameMap.has(normalizedNickname)) return;
    nicknameMap.set(normalizedNickname, cleanNickname);
  };

  getUniquePrompts([...popularPrompts, ...savedPrompts]).forEach((prompt) => {
    addNickname(getDisplayPromptAuthor(prompt));
    getSortedPromptComments(prompt.id).forEach((comment) => {
      addNickname(comment.author || comment.owner);
      (comment.replies || []).forEach((reply) => addNickname(reply.author || reply.owner));
    });
  });
  getAdminReportRecords().forEach((record) => {
    addNickname(record.reporter);
    addNickname(record.promptAuthor);
    addNickname(record.commentAuthor);
  });

  return Array.from(nicknameMap.values()).sort((a, b) => a.localeCompare(b, "ko"));
}

function findPromptById(promptId) {
  return savedPrompts.find((item) => item.id === promptId) || popularPrompts.find((item) => item.id === promptId);
}

async function sharePrompt(formData) {
  if (guardAdminUserAction()) return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    render();
    return;
  }

  const title = formData.get("title").trim();
  const text = formData.get("prompt").trim();
  const tags = parseSharedTags(formData.get("tags"));

  if (!title || !text || tags.length === 0) {
    state.shareError = "제목, 프롬프트, 해시태그를 모두 입력해주세요.";
    render();
    return;
  }

  const promptId = state.shareDraft?.promptId || `shared-${Date.now()}`;
  const existingPrompt = findPromptById(promptId);
  const prompt = {
    id: promptId,
    title,
    text,
    tags,
    views: 0,
    comments: 0,
    saves: 0,
    author: state.currentUser || existingPrompt?.author || "익명 사용자",
    owner: state.currentUser || existingPrompt?.owner || existingPrompt?.author || "익명 사용자",
    source: "mine",
    isShared: true,
    savedByMe: Boolean(existingPrompt?.savedByMe),
    createdAt: existingPrompt?.createdAt || Date.now(),
  };

  const existingSavedPrompt = savedPrompts.find((item) => item.id === prompt.id);
  if (existingSavedPrompt) {
    delete existingSavedPrompt.messages;
  }

  let finalPrompt = prompt;
  const api = window.TTALKAK_API;
  if (api?.sharePrompt) {
    try {
      const backendPrompt = await api.sharePrompt(
        {
          title: prompt.title,
          text: prompt.text,
          tags: prompt.tags,
          isShared: true,
        },
        state.authToken || state.token || undefined,
      );
      finalPrompt = {
        ...backendPrompt,
        source: "mine",
        isShared: true,
        savedByMe: Boolean(existingPrompt?.savedByMe || backendPrompt.savedByMe),
        author: state.currentUser || backendPrompt.author,
        owner: state.currentUser || backendPrompt.owner || backendPrompt.author,
      };
      if (prompt.id !== finalPrompt.id) {
        removePromptById(popularPrompts, prompt.id);
        removePromptById(savedPrompts, prompt.id);
      }
    } catch (error) {
      handleBackendAccessError(error, "프롬프트 공유 요청에 실패했습니다.");
      return;
    }
  }

  upsertPrompt(popularPrompts, finalPrompt);
  upsertPrompt(savedPrompts, finalPrompt);
  state.userLibraryPromptIds.add(finalPrompt.id);
  state.backendLibraryPromptIds.add(finalPrompt.id);
  if (!commentsByPrompt[finalPrompt.id]) {
    commentsByPrompt[finalPrompt.id] = [];
  }
  state.searchQuery = "";
  state.popularSort = "latest";
  state.popularPage = 1;
  state.shareError = "";
  state.shareDraft = null;
  state.route = "home";
  showNotice("최종 프롬프트가 공유되었습니다. Home 최신 목록에서 확인할 수 있습니다.");
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
  const criteria = parsePromptSearchQuery(state.searchQuery, state.searchScope);
  const prompts = getUniquePrompts(popularPrompts);

  if (!hasPromptSearchCriteria(criteria)) {
    return sortPopularPrompts(prompts);
  }

  return sortPopularPrompts(
    prompts.filter((prompt) => {
      if (criteria.tagTokens.length) {
        const tags = prompt.tags.map(normalizeTag);
        const matchesTags = criteria.tagTokens.every((token) => tags.some((tag) => tag.includes(token)));
        if (!matchesTags) return false;
      }

      if (criteria.keywordTokens.length) {
        const keywordHaystack = normalizeSearchText([prompt.title, prompt.text].join(" "));
        const matchesKeywords = criteria.keywordTokens.every((token) => keywordHaystack.includes(token));
        if (!matchesKeywords) return false;
      }

      if (criteria.authorTokens.length) {
        const authorHaystack = normalizeSearchText(getDisplayPromptAuthor(prompt));
        const matchesAuthor = criteria.authorTokens.every((token) => authorHaystack.includes(token));
        if (!matchesAuthor) return false;
      }

      if (criteria.allTokens.length) {
        const allHaystack = normalizeSearchText([prompt.title, prompt.text, getDisplayPromptAuthor(prompt), ...(prompt.tags || [])].join(" "));
        return criteria.allTokens.every((token) => allHaystack.includes(token));
      }

      return true;
    }),
  );
}

function getPopularTags(prompts) {
  const counts = new Map();
  const labels = new Map();
  const recentUsedAt = new Map();
  const createdOrder = new Map();

  prompts.forEach((prompt, promptIndex) => {
    const usedAt = new Date(getPromptCreatedAt(prompt) || 0).getTime() || 0;
    (prompt.tags || []).forEach((tag) => {
      const label = String(tag || "").replace(/^#+/, "").trim();
      if (!label) return;
      const key = normalizeTag(label);
      if (getAdminTagStatus(label) !== "approved") return;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!labels.has(key)) labels.set(key, label);
      if (!createdOrder.has(key)) createdOrder.set(key, promptIndex);
      recentUsedAt.set(key, Math.max(recentUsedAt.get(key) || 0, usedAt));
    });
  });

  return [...counts.entries()]
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff) return countDiff;

      const recentDiff = (recentUsedAt.get(b[0]) || 0) - (recentUsedAt.get(a[0]) || 0);
      if (recentDiff) return recentDiff;

      return (createdOrder.get(b[0]) || 0) - (createdOrder.get(a[0]) || 0);
    })
    .slice(0, 8)
    .map(([key]) => labels.get(key))
    .filter(Boolean);
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

function getAdminManagedTags() {
  const stats = getTagStats();
  const query = normalizeTag(state.adminTagQuery || "");
  const filter = ["all", "pending", "approved", "rejected"].includes(state.adminTagFilter) ? state.adminTagFilter : "all";
  const sort = ["usage", "recent"].includes(state.adminTagSort) ? state.adminTagSort : "usage";

  const backendTags = (state.backendAdminTags || []).map((tag) => ({
    label: tag.label,
    key: tag.key,
    id: tag.id,
    status: tag.status || getAdminTagStatus(tag.label),
    count: tag.count || 0,
    recentAt: tag.recentAt || 0,
    backend: true,
  }));
  const backendKeys = new Set(backendTags.map((tag) => tag.key));
  const localTags = getKnownTags()
    .filter((tag) => !backendKeys.has(normalizeTag(tag)))
    .map((tag) => {
      const key = normalizeTag(tag);
      const stat = stats.get(key) || {};
      return {
        label: tag,
        key,
        status: getAdminTagStatus(tag),
        count: stat.count || 0,
        recentAt: stat.recentAt || 0,
      };
    });

  return [...backendTags, ...localTags]
    .filter((tag) => filter === "all" || tag.status === filter)
    .filter((tag) => !query || normalizeTag(tag.label).includes(query))
    .sort((a, b) => {
      if (sort === "recent") {
        return b.recentAt - a.recentAt || b.count - a.count || a.label.localeCompare(b.label, "ko");
      }

      return b.count - a.count || b.recentAt - a.recentAt || getAdminTagStatusOrder(a.status) - getAdminTagStatusOrder(b.status) || a.label.localeCompare(b.label, "ko");
    })
    .slice(0, 16);
}

function getTagStats() {
  const stats = new Map();

  [...popularPrompts, ...savedPrompts].forEach((prompt) => {
    const usedAt = new Date(getPromptCreatedAt(prompt) || 0).getTime() || 0;
    (prompt.tags || []).forEach((tag) => {
      const key = normalizeTag(tag);
      if (!key) return;

      const current = stats.get(key) || { count: 0, recentAt: 0 };
      stats.set(key, {
        count: current.count + 1,
        recentAt: Math.max(current.recentAt, usedAt),
      });
    });
  });

  return stats;
}

function getMyPrompts() {
  if (state.myBackendStatus === "connected") {
    return getUniquePrompts(state.backendMyPrompts);
  }
  return getUniquePrompts(savedPrompts.filter((prompt) => prompt.source === "mine" && !isHiddenDemoLibraryPrompt(prompt)));
}

function getMyComments() {
  if (state.myBackendStatus === "connected") {
    return state.backendMyComments.map((comment) => ({
      promptId: String(comment.promptId || ""),
      prompt: comment.prompt || findPromptById(String(comment.promptId || "")) || {
        id: String(comment.promptId || ""),
        title: comment.promptTitle || "삭제된 프롬프트",
        text: "",
        author: "",
      },
      comment,
    }));
  }

  const owner = state.currentUser || "나";
  const items = [];

  Object.entries(commentsByPrompt).forEach(([promptId, comments]) => {
    collectOwnedComments(items, promptId, comments, owner);
  });

  return items;
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
  if (state.myBackendStatus === "connected") {
    return backendReports.sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
  }

  const promptReports = [...state.reportedPromptIds].map((promptId) => {
    const prompt = findPromptById(promptId);
    const record = getReportRecord(`prompt:${promptId}`);
    return {
      type: "prompt",
      title: "프롬프트 신고",
      id: promptId,
      label: prompt?.title || "삭제된 프롬프트",
      status: record.status,
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
      status: record.status,
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
        label: target.type === "comment" ? target.text : target.title,
        reason: request.reason,
        status: "revision-requested",
        requestedAt: request.requestedAt,
      };
    })
    .filter(Boolean);

  return [...revisionRequests, ...backendReports, ...promptReports, ...commentReports].sort(
    (a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0),
  );
}

function getAdminUserActivity(nickname) {
  const cleanNickname = String(nickname || "").trim();
  const normalizedNickname = normalizeAdminSearchText(cleanNickname);
  const prompts = getUniquePrompts([...popularPrompts, ...savedPrompts])
    .filter((prompt) => normalizeAdminSearchText(getDisplayPromptAuthor(prompt)) === normalizedNickname)
    .map((prompt) => ({
      title: prompt.title,
      preview: makePreview(prompt.text),
      promptId: prompt.id,
    }));

  const comments = [];
  const replies = [];
  getUniquePrompts([...popularPrompts, ...savedPrompts]).forEach((prompt) => {
    getSortedPromptComments(prompt.id).forEach((comment) => {
      if (normalizeAdminSearchText(comment.author || comment.owner) === normalizedNickname) {
        comments.push({
          title: prompt.title,
          preview: comment.deleted ? "삭제된 댓글입니다." : makePreview(comment.text),
          promptId: prompt.id,
          commentId: comment.id,
        });
      }
      (comment.replies || []).forEach((reply) => {
        if (normalizeAdminSearchText(reply.author || reply.owner) === normalizedNickname) {
          replies.push({
            title: prompt.title,
            preview: reply.deleted ? "삭제된 댓글입니다." : makePreview(reply.text),
            promptId: prompt.id,
            commentId: reply.id,
          });
        }
      });
    });
  });

  const reportRecords = getAdminReportRecords();
  const reportsMade = reportRecords
    .filter((record) => normalizeAdminSearchText(record.reporter) === normalizedNickname)
    .map((record) => ({
      title: record.type === "comment" ? `댓글 신고 · ${record.contextTitle || "게시물 확인 필요"}` : record.title,
      preview: record.summary || record.targetPreview || "신고 내용 확인 필요",
      promptId: record.promptId,
      commentId: record.type === "comment" ? record.targetId : "",
    }));
  const reportsReceived = reportRecords
    .filter((record) => {
      const promptAuthor = normalizeAdminSearchText(record.promptAuthor);
      const commentAuthor = normalizeAdminSearchText(record.commentAuthor);
      return promptAuthor === normalizedNickname || commentAuthor === normalizedNickname;
    })
    .map((record) => ({
      title: record.type === "comment" ? `댓글 신고 · ${record.contextTitle || "게시물 확인 필요"}` : record.title,
      preview: record.targetPreview || record.summary || "신고 대상 확인 필요",
      promptId: record.promptId,
      commentId: record.type === "comment" ? record.targetId : "",
    }));

  return {
    nickname: cleanNickname,
    prompts,
    comments,
    replies,
    reportsMade,
    reportsReceived,
  };
}

function getReportRecord(key) {
  return state.reportRecords[key] || { status: "pending" };
}

function mapBackendReportStatus(status) {
  const normalized = String(status || "pending").toLowerCase();
  if (["reviewed", "resolved", "done", "completed", "complete"].includes(normalized)) return "resolved";
  if (["dismissed", "rejected", "reject"].includes(normalized)) return "dismissed";
  return "pending";
}

function mapFrontendReportStatus(status) {
  if (status === "resolved") return "REVIEWED";
  if (status === "dismissed") return "DISMISSED";
  return "PENDING";
}

function makeRevisionRequestKey(type, id) {
  return `${type}:${id}`;
}

function getPromptRevisionRequest(promptId) {
  return state.adminPromptRevisionRequests[makeRevisionRequestKey("prompt", promptId)] || state.adminPromptRevisionRequests[promptId] || null;
}

function getRevisionRequestTarget(key) {
  const value = String(key || "");
  const separatorIndex = value.indexOf(":");
  const type = separatorIndex > 0 ? value.slice(0, separatorIndex) : "prompt";
  const id = separatorIndex > 0 ? value.slice(separatorIndex + 1) : value;

  if (type === "comment") {
    const comment = findCommentById(id);
    if (!comment) return null;
    return {
      type,
      id,
      key: makeRevisionRequestKey(type, id),
      title: "댓글 수정 요청",
      text: comment.text,
      owner: comment.owner || comment.author,
    };
  }

  const prompt = findPromptById(id);
  if (!prompt) return null;
  return {
    type: "prompt",
    id,
    key: makeRevisionRequestKey("prompt", id),
    title: prompt.title,
    text: prompt.text,
    owner: prompt.owner || prompt.author,
  };
}

function isRevisionTargetOwnedByCurrentUser(target) {
  if (!target) return false;
  const owner = target.owner;
  return owner === "나" || owner === state.currentUser;
}

function getAdminReportRecords() {
  if (state.backendAdminReports.length) {
    return state.backendAdminReports.map((report) => {
      const prompt = report.promptId ? findPromptById(report.promptId) : report.type === "prompt" ? findPromptById(report.targetId) : null;
      const record = getReportRecord(report.key);
      return {
        key: report.key,
        type: report.type,
        targetId: report.targetId,
        promptId: report.promptId || prompt?.id || "",
        status: record.status || mapBackendReportStatus(report.status),
        title: report.type === "comment" ? "댓글 신고" : (report.title || prompt?.title || "프롬프트 신고"),
        contextTitle: report.contextTitle || prompt?.title || "게시물 확인 필요",
        reporter: report.reporter || report.raw?.reporterNickname || report.raw?.reporter?.nickname || record.reporter || "",
        promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : report.promptAuthor || "",
        commentAuthor: report.commentAuthor || report.targetAuthor || "",
        targetPreview: report.targetPreview || makePreview(prompt?.text || ""),
        summary: report.reason ? `신고 사유: ${report.reason}` : report.summary || "신고 사유 없음",
      };
    }).sort((a, b) => Number(getReportRecord(b.key).createdAt || 0) - Number(getReportRecord(a.key).createdAt || 0));
  }

  const records = [];
  [...state.reportedPromptIds].forEach((promptId) => {
    const prompt = findPromptById(promptId);
    const key = `prompt:${promptId}`;
    const record = getReportRecord(key);
    records.push({
      key,
      type: "prompt",
      targetId: promptId,
      promptId,
      status: record.status || "pending",
      title: prompt?.title || "삭제된 프롬프트",
      reporter: record.reporter || "",
      promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : "",
      summary: record.reason || makePreview(prompt?.text || ""),
    });
  });
  [...state.reportedCommentIds].forEach((commentId) => {
    const context = findCommentContextById(commentId);
    const comment = context?.comment || findCommentById(commentId);
    const key = `comment:${commentId}`;
    const record = getReportRecord(key);
    const prompt = context?.prompt || findPromptById(record.promptId);
    records.push({
      key,
      type: "comment",
      targetId: commentId,
      promptId: record.promptId || context?.promptId || "",
      status: record.status || "pending",
      title: "댓글 신고",
      contextTitle: prompt?.title || "삭제된 게시물",
      reporter: record.reporter || "",
      promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : "",
      commentAuthor: record.targetAuthor || comment?.author || comment?.owner || "",
      targetPreview: record.targetPreview || makePreview(comment?.text || "삭제된 댓글"),
      summary: record.reason ? `신고 사유: ${record.reason}` : "신고 사유 없음",
    });
  });
  return records.sort((a, b) => Number(getReportRecord(b.key).createdAt || 0) - Number(getReportRecord(a.key).createdAt || 0));
}

function getReportStatusLabel(status) {
  if (status === "revision-requested") return "수정 요청됨";
  if (status === "dismissed") return "기각";
  if (status === "resolved") return "검토 완료";
  return "접수";
}

function matchesAdminPromptQuery(prompt, query) {
  const normalizedQuery = normalizeAdminSearchText(query);
  if (!normalizedQuery) return true;

  const visibility = state.adminHiddenPromptIds.has(prompt.id)
    ? "숨김 hidden"
    : prompt.isShared || prompt.source === "community"
      ? "공유 공개 shared public"
      : "비공개 private";
  const source = prompt.source === "mine" ? "내 프롬프트 mine" : "커뮤니티 다른 사용자 community";
  const haystack = normalizeAdminSearchText(
    [prompt.title, prompt.text, prompt.author, source, visibility, ...(prompt.tags || [])].join(" "),
  );

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function matchesAdminPromptFilter(prompt, filter) {
  if (filter === "shared") return Boolean(prompt.isShared || prompt.source === "community");
  if (filter === "private") return prompt.source === "mine" && !prompt.isShared;
  if (filter === "hidden") return state.adminHiddenPromptIds.has(prompt.id);
  if (filter === "reported") return state.reportedPromptIds.has(prompt.id);
  return true;
}

function normalizeAdminSearchText(value) {
  return String(value || "")
    .replace(/^#+/, "")
    .replace(/[#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getAdminTagStatus(tag) {
  const decision = state.adminTagDecisions[normalizeTag(tag)];
  if (decision === "approved" || decision === "rejected") return decision;
  return "pending";
}

function getAdminTagStatusLabel(status) {
  if (status === "approved") return "검토 완료";
  if (status === "rejected") return "추천 제외";
  return "검토 중";
}

function getAdminTagStatusClass(status) {
  if (status === "approved") return "public";
  if (status === "rejected") return "private";
  return "pending-unsave";
}

function getAdminTagStatusOrder(status) {
  if (status === "pending") return 0;
  if (status === "approved") return 1;
  return 2;
}

async function updateAdminTagDecision(tag, decision) {
  if (!tag || !["pending", "approved", "rejected"].includes(decision)) return;

  const backendTag = state.backendAdminTags.find((item) => item.key === tag || normalizeTag(item.label) === tag || item.id === tag);
  if (backendTag?.id && window.TTALKAK_API?.updateAdminTagStatus) {
    try {
      const updated = await window.TTALKAK_API.updateAdminTagStatus(backendTag.id, decision.toUpperCase(), state.authToken || state.token || undefined);
      state.backendAdminTags = state.backendAdminTags.map((item) =>
        item.id === backendTag.id ? { ...item, ...updated, status: updated.status || decision } : item,
      );
    } catch (error) {
      handleBackendAccessError(error, "태그 상태 변경 요청에 실패했습니다.");
      console.warn("[TTALKAK] /api/admin/tags/{id}/status 호출에 실패해 데모 상태만 변경합니다.", error);
    }
  }

  if (decision === "pending") {
    const nextDecisions = { ...state.adminTagDecisions };
    delete nextDecisions[tag];
    state.adminTagDecisions = nextDecisions;
  } else {
    state.adminTagDecisions = { ...state.adminTagDecisions, [tag]: decision };
  }

  showNotice(`태그 상태를 ${getAdminTagStatusLabel(decision)}으로 변경했습니다.`);
}

async function updateReportRecordStatus(key, status) {
  if (!key || !["pending", "dismissed", "resolved"].includes(status)) return;
  const record = getReportRecord(key);
  if (record.backendId && window.TTALKAK_API?.updateAdminReportStatus) {
    try {
      const updated = await window.TTALKAK_API.updateAdminReportStatus(
        record.backendId,
        mapFrontendReportStatus(status),
        state.authToken || state.token || undefined,
        `${getReportStatusLabel(status)} 처리`,
      );
      const backendStatus = mapBackendReportStatus(updated?.status || status);
      state.backendAdminReports = state.backendAdminReports.map((report) =>
        report.id === record.backendId ? { ...report, ...updated, status: updated?.status || status } : report,
      );
      status = backendStatus;
    } catch (error) {
      handleBackendAccessError(error, "신고 상태 변경 요청에 실패했습니다.");
      console.warn("[TTALKAK] /api/admin/reports/{id}/status 호출에 실패해 데모 상태만 변경합니다.", error);
    }
  }
  state.reportRecords[key] = { ...getReportRecord(key), status, updatedAt: Date.now() };
  showNotice(`신고 상태를 ${getReportStatusLabel(status)}로 변경했습니다.`);
}

function requestPromptRevision(targetKey, reason) {
  const target = getRevisionRequestTarget(targetKey);
  const content = String(reason || "").trim();

  if (!target || !state.adminMode) return;
  if (!content) {
    window.alert("작성자에게 전달할 수정 요청 사유를 입력해주세요.");
    return;
  }

  state.adminPromptRevisionRequests = {
    ...state.adminPromptRevisionRequests,
    [target.key]: {
      type: target.type,
      targetId: target.id,
      reason: content,
      requestedAt: Date.now(),
      status: "requested",
    },
  };
  state.adminRequestTargetKey = null;
  showNotice("작성자에게 수정 요청을 보냈습니다.");
}

function findPromptIdByCommentId(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    if (findCommentInList(comments, commentId)) return promptId;
  }
  return "";
}

function findCommentContextById(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    const comment = findCommentInList(comments, commentId);
    if (comment) {
      return {
        promptId,
        prompt: findPromptById(promptId),
        comment,
      };
    }
  }
  return null;
}

function sortPopularPrompts(prompts) {
  const sorters = {
    popular: (a, b) => b.views - a.views || b.comments - a.comments || b.saves - a.saves,
    saves: (a, b) => b.saves - a.saves || b.views - a.views || b.comments - a.comments,
    comments: (a, b) => getPromptCommentCount(b) - getPromptCommentCount(a) || b.views - a.views || b.saves - a.saves,
    likes: (a, b) => getPromptLikes(b) - getPromptLikes(a) || b.views - a.views || b.saves - a.saves,
    latest: (a, b) => getPromptCreatedAt(b) - getPromptCreatedAt(a) || b.views - a.views,
  };

  return [...prompts].sort(sorters[state.popularSort] || sorters.popular);
}

function getPromptLikes(prompt) {
  return prompt.likes ?? Math.round(getPromptSaveCount(prompt) / 3);
}

function getPromptCreatedAt(prompt) {
  if (Number.isFinite(prompt.createdAt)) return prompt.createdAt;
  const sharedTimestamp = String(prompt.id || "").match(/^shared-(\d+)$/)?.[1];
  if (sharedTimestamp) return Number(sharedTimestamp);
  const demoIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
  return demoIndex >= 0 ? popularPrompts.length - demoIndex : 0;
}

function getUniquePrompts(prompts) {
  const seen = new Set();

  return prompts.filter((prompt) => {
    const key = prompt.id || `${prompt.title}-${prompt.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

async function toggleAdminPromptHidden(promptId) {
  if (!promptId) return;
  if (state.adminHiddenPromptIds.has(promptId)) {
    if (window.TTALKAK_API?.restoreAdminPrompt && isBackendNumericId(promptId)) {
      try {
        await window.TTALKAK_API.restoreAdminPrompt(promptId, state.authToken || state.token || undefined);
      } catch (error) {
        handleBackendAccessError(error, "게시글 숨김 해제 요청에 실패했습니다.");
        console.warn("[TTALKAK] /api/admin/prompts/{id}/restore 호출에 실패해 데모 상태만 변경합니다.", error);
      }
    }
    state.adminHiddenPromptIds.delete(promptId);
    showNotice("관리자 숨김을 해제했습니다.");
  } else {
    if (window.TTALKAK_API?.hideAdminPrompt && isBackendNumericId(promptId)) {
      try {
        await window.TTALKAK_API.hideAdminPrompt(promptId, state.authToken || state.token || undefined);
      } catch (error) {
        handleBackendAccessError(error, "게시글 숨김 요청에 실패했습니다.");
        console.warn("[TTALKAK] /api/admin/prompts/{id}/hide 호출에 실패해 데모 상태만 변경합니다.", error);
      }
    }
    state.adminHiddenPromptIds.add(promptId);
    showNotice("관리자 숨김 처리했습니다.");
  }
}

function getPopularTotalPages(count) {
  return Math.max(1, Math.ceil(count / 16));
}

function parsePromptSearchQuery(query, scope = "all") {
  const searchScope = getValidSearchScope(scope);
  const tagTokens = [];
  const keywordTokens = [];
  const authorTokens = [];
  const allTokens = [];

  String(query || "")
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (searchScope === "tag" || token.startsWith("#")) {
        const tag = normalizeTag(token);
        if (tag) tagTokens.push(tag);
        return;
      }

      const keyword = normalizeSearchText(token);
      if (!keyword) return;
      if (searchScope === "keyword") {
        keywordTokens.push(keyword);
        return;
      }
      if (searchScope === "author") {
        authorTokens.push(keyword);
        return;
      }
      allTokens.push(keyword);
    });

  return { tagTokens, keywordTokens, authorTokens, allTokens };
}

function hasPromptSearchCriteria(criteria) {
  return Boolean(criteria.tagTokens.length || criteria.keywordTokens.length || criteria.authorTokens.length || criteria.allTokens.length);
}

function getValidSearchScope(scope) {
  return ["all", "tag", "keyword", "author"].includes(scope) ? scope : "all";
}

function normalizeSearchText(value) {
  return String(value || "")
    .replace(/^#+/, "")
    .replace(/[#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTag(value) {
  return value.replace(/^#+/, "").trim().toLowerCase();
}

function isValidPhone(value) {
  return /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(String(value || "").trim());
}

function isFutureDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function polishPrompt(prompt) {
  return `역할: 당신은 해당 분야의 전문 어시스턴트입니다.\n\n목표: ${prompt}\n\n요구사항:\n- 요청의 목적을 먼저 파악하고 필요한 경우 합리적인 가정을 명시하세요.\n- 구체적인 단계, 출력 형식, 확인 기준을 포함해 답변하세요.\n- 모호한 표현은 명확한 기준과 예시로 바꿔 설명하세요.\n- 바로 사용할 수 있는 형태로 결과물을 작성하세요.\n\n출력 형식:\n1. 최종 답변\n2. 핵심 근거\n3. 필요 시 다음 액션`;
}

function getFinalPromptText(message) {
  const content = String(message?.content || "");
  const marker = "역할:";
  const markerIndex = content.indexOf(marker);

  if (markerIndex > 0 && content.slice(0, markerIndex).includes("개선")) {
    return content.slice(markerIndex).trim();
  }

  return content.trim();
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatShortDate(value) {
  const time = Number(value || 0);
  if (!time) return "방금 생성";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function showNotice(message) {
  state.notice = message;
  window.clearTimeout(showNotice.timer);
  render();
  showNotice.timer = window.setTimeout(() => {
    state.notice = "";
    render();
  }, 1700);
}

function getBackendErrorMessage(error) {
  const payload = error?.payload;
  return String(
    payload?.message ||
      payload?.error ||
      payload?.code ||
      error?.message ||
      "",
  ).trim();
}

function getAuthToken() {
  return String(state.authToken || state.token || "").trim();
}

function isDemoAuthToken(token = getAuthToken()) {
  return String(token || "").trim() === DEMO_AUTH_TOKEN;
}

function hasBackendAuthToken() {
  const token = getAuthToken();
  return Boolean(token) && !isDemoAuthToken(token);
}

function handleBackendAccessError(error, fallbackMessage = "요청을 처리하지 못했습니다.") {
  const status = Number(error?.status || error?.payload?.status || 0);
  const backendMessage = getBackendErrorMessage(error);

  if (status === 401) {
    const token = getAuthToken();
    if (!token || isDemoAuthToken(token)) {
      showNotice(backendMessage || "백엔드 인증이 필요한 요청입니다. 현재 데모 화면 상태는 유지합니다.");
      return true;
    }

    clearAuthenticatedSession({ keepRoute: true });
    state.authView = "login";
    showNotice("로그인이 필요하거나 만료되었습니다. 다시 로그인해주세요.");
    return true;
  }

  if (status === 403) {
    showNotice(backendMessage || "이 작업을 수행할 권한이 없습니다.");
    return true;
  }

  if (backendMessage || fallbackMessage) {
    showNotice(backendMessage || fallbackMessage);
    return true;
  }

  return false;
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
  const api = window.TTALKAK_API;
  const handler = api?.[action];
  if (typeof handler !== "function") return Promise.resolve(null);

  const token = getAuthToken();
  if (PROTECTED_BACKEND_ACTIONS.has(action) && (!token || isDemoAuthToken(token))) {
    console.info(`[TTALKAK] ${action} API 호출은 실제 인증 토큰이 없어 건너뜁니다. 로컬 데모 상태만 유지합니다.`);
    return Promise.resolve(null);
  }

  return Promise.resolve(handler(...args, token || undefined)).catch((error) => {
    handleBackendAccessError(error, "백엔드 요청에 실패해 화면의 임시 상태만 유지합니다.");
    console.warn(`[TTALKAK] ${action} API 호출에 실패해 데모 상태만 유지합니다.`, error);
    return null;
  });
}

async function createBackendMakeFolder(payload) {
  const api = window.TTALKAK_API;
  if (!api?.createMakeFolder) return "";

  try {
    const result = await api.createMakeFolder(payload, state.authToken || state.token || undefined);
    return String(result?.id || result?.folderId || result?.data?.id || result?.data?.folderId || "");
  } catch (error) {
    handleBackendAccessError(error, "폴더 생성 요청에 실패해 로컬 데모 폴더만 유지합니다.");
    console.warn("[TTALKAK] /api/make/folders 생성 호출에 실패해 로컬 데모 폴더만 유지합니다.", error);
    return "";
  }
}

async function createBackendMakeThread(thread) {
  const api = window.TTALKAK_API;
  if (!api?.createMakeThread || !thread) return "";

  const messages = Array.isArray(thread.messages) && thread.messages.length
    ? thread.messages
    : state.messages;
  const backendThreadId = isBackendNumericId(thread.serverId)
    ? Number(thread.serverId)
    : isBackendNumericId(thread.id)
      ? Number(thread.id)
      : null;

  try {
    const payload = {
        title: thread.title || makePromptTitle(messages.find((message) => message.role === "user")?.content || "새 대화"),
        preview: thread.preview || makePreview(messages[messages.length - 1]?.content || ""),
        folderId: getBackendFolderId(thread.folderId),
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          sourcePrompt: message.sourcePrompt || "",
        })),
      };
    if (backendThreadId) {
      payload.id = backendThreadId;
      payload.threadId = backendThreadId;
    }

    const result = await api.createMakeThread(
      payload,
      state.authToken || state.token || undefined,
    );
    return String(result?.id || result?.threadId || result?.data?.id || result?.data?.threadId || "");
  } catch (error) {
    handleBackendAccessError(error, "대화 저장 요청에 실패해 로컬 데모 대화만 유지합니다.");
    console.warn("[TTALKAK] /api/make/threads 저장 호출에 실패해 로컬 데모 대화만 유지합니다.", error);
    return "";
  }
}

async function ensureBackendMakeThreadId(thread) {
  if (!thread) return "";
  if (isBackendNumericId(thread.serverId)) return String(thread.serverId);
  if (isBackendNumericId(thread.id)) {
    thread.serverId = String(thread.id);
    return thread.serverId;
  }

  const serverId = await createBackendMakeThread(thread);
  if (serverId) {
    thread.serverId = serverId;
    return serverId;
  }
  return "";
}

function getBackendFolderId(folderId) {
  if (!folderId || folderId === "all" || folderId === "uncategorized") return null;
  const folder = state.makeFolders.find((item) => item.id === folderId || item.serverId === folderId);
  const candidate = folder?.serverId || folderId;
  return isBackendNumericId(candidate) ? Number(candidate) : null;
}

function isBackendNumericId(value) {
  return value !== null && value !== undefined && /^\d+$/.test(String(value));
}

async function improvePromptWithBackend(prompt) {
  const api = window.TTALKAK_API;
  if (!api?.improvePrompt) return polishPrompt(prompt);

  try {
    const improved = await api.improvePrompt({ prompt }, state.authToken || state.token || undefined);
    state.makeBackendMessage = "Make API 연결됨: POST /api/prompts/improve 응답을 반영했습니다.";
    return improved || polishPrompt(prompt);
  } catch (error) {
    const status = Number(error?.status || error?.payload?.status || 0);
    let fallbackMessage = "프롬프트 첨삭 요청에 실패해 데모 첨삭을 표시합니다.";
    if (status === 404) {
      fallbackMessage = "관련 프롬프트 기법을 찾지 못해 데모 첨삭을 표시합니다.";
    } else if (status === 429) {
      fallbackMessage = "요청이 많아 잠시 후 다시 시도해주세요. 지금은 데모 첨삭을 표시합니다.";
    } else if (status === 500 || status === 503) {
      fallbackMessage = "RAG 또는 백엔드 응답 지연으로 데모 첨삭을 표시합니다.";
    }
    state.makeBackendMessage = `Make demo data 표시 중: ${fallbackMessage}`;
    handleBackendAccessError(error, fallbackMessage);
    console.warn("[TTALKAK] /api/prompts/improve 연동에 실패해 데모 첨삭을 유지합니다.", error);
    return polishPrompt(prompt);
  }
}

async function syncMakeThreadWithBackend(threadId) {
  const thread = state.recentThreads.find((item) => item.id === threadId);
  if (!thread) return;
  const serverId = await createBackendMakeThread(thread);
  if (serverId) thread.serverId = serverId;
}

async function hydrateBackendMakeDataIfNeeded() {
  if (state.route !== "make" || state.makeBackendStatus !== "idle") return;

  const api = window.TTALKAK_API;
  if (!api?.getMakeThreads && !api?.getMakeFolders) {
    state.makeBackendStatus = "fallback";
    state.makeBackendMessage = "Make demo data 표시 중: Make API wrapper가 없어 데모 대화를 표시합니다.";
    render();
    return;
  }

  state.makeBackendStatus = "checking";
  state.makeBackendMessage = "Make API 연결 확인 중";

  const [threadsResult, foldersResult] = await Promise.allSettled([
    api.getMakeThreads?.(state.authToken || state.token || undefined),
    api.getMakeFolders?.(state.authToken || state.token || undefined),
  ]);

  let shouldRender = false;

  if (foldersResult.status === "fulfilled" && Array.isArray(foldersResult.value)) {
    const folders = foldersResult.value.filter((folder) => folder.id && folder.name);
    if (folders.length) {
      state.makeFolders = normalizeMakeFolders(folders);
      shouldRender = true;
    }
  } else if (foldersResult.status === "rejected") {
    console.warn("[TTALKAK] /api/make/folders 연동에 실패해 데모 폴더를 유지합니다.", foldersResult.reason);
  }

  if (threadsResult.status === "fulfilled" && Array.isArray(threadsResult.value)) {
    const threads = threadsResult.value.filter((thread) => thread.id);
    if (threads.length) {
      state.recentThreads = threads.map((thread) => ({
        id: thread.id,
        dedupeKey: thread.id,
        serverId: thread.serverId || (isBackendNumericId(thread.id) ? String(thread.id) : ""),
        title: thread.title || "새 대화",
        preview: thread.preview || makePreview(thread.messages?.at(-1)?.content || ""),
        folderId: thread.folderId || "uncategorized",
        createdAt: thread.createdAt || Date.now(),
        messages: Array.isArray(thread.messages) ? thread.messages : [],
      }));
      normalizeRecentThreads();
      shouldRender = true;
    }
  } else if (threadsResult.status === "rejected") {
    console.warn("[TTALKAK] /api/make/threads 연동에 실패해 데모 대화를 유지합니다.", threadsResult.reason);
  }

  const anyConnected = threadsResult.status === "fulfilled" || foldersResult.status === "fulfilled";
  state.makeBackendStatus = anyConnected ? "connected" : "fallback";
  state.makeBackendMessage = anyConnected
    ? "Make API 연결됨: GET /api/make/threads, /api/make/folders 요청을 확인했습니다."
    : "Make demo data 표시 중: Make 백엔드 호출 실패로 데모 대화를 표시합니다.";

  if (shouldRender || state.route === "make") render();
}

function refreshMyPageDataAfterMutation() {
  if (!state.isLoggedIn || state.myBackendStatus !== "connected") return Promise.resolve();
  state.myBackendStatus = "idle";
  return hydrateBackendMyPageDataIfNeeded({ force: true });
}

async function hydrateBackendMyPageDataIfNeeded({ force = false } = {}) {
  if (state.route !== "saved" || !state.isLoggedIn || (!force && state.myBackendStatus !== "idle")) return;
  const api = window.TTALKAK_API;
  if (!api?.getMyLibrary) return;

  state.myBackendStatus = "checking";
  const token = state.authToken || state.token || undefined;
  const [libraryResult, promptsResult, commentsResult, reportsResult] = await Promise.allSettled([
    api.getMyLibrary({ filter: "all", page: 1, pageSize: 64 }, token),
    api.getMyPrompts?.({ page: 1, pageSize: 64 }, token),
    api.getMyComments?.({ page: 1, pageSize: 64 }, token),
    api.getMyReports?.({ page: 1, pageSize: 64 }, token),
  ]);

  let shouldRender = false;
  if (libraryResult.status === "fulfilled" && Array.isArray(libraryResult.value?.items)) {
    state.backendLibraryPromptIds = new Set();
    libraryResult.value.items.forEach((prompt) => {
      const normalized = {
        ...prompt,
        source: prompt.source || (prompt.isMine ? "mine" : "community"),
        savedByMe: Boolean(prompt.savedByMe || prompt.raw?.isSaved),
      };
      upsertPrompt(savedPrompts, normalized);
      if (normalized.isShared) upsertPrompt(popularPrompts, normalized);
      state.userLibraryPromptIds.add(normalized.id);
      state.backendLibraryPromptIds.add(normalized.id);
    });
    shouldRender = true;
  } else if (libraryResult.status === "rejected") {
    console.warn("[TTALKAK] /api/me/library 연동에 실패해 데모 보관함을 유지합니다.", libraryResult.reason);
  }

  if (promptsResult.status === "fulfilled" && Array.isArray(promptsResult.value?.items)) {
    state.backendMyPrompts = promptsResult.value.items.map((prompt) => ({
      ...prompt,
      source: "mine",
      owner: state.currentUser || prompt.owner || prompt.author,
      author: state.currentUser || prompt.author,
    }));
    state.backendMyPrompts.forEach((prompt) => {
      upsertPrompt(savedPrompts, prompt);
      if (prompt.isShared) upsertPrompt(popularPrompts, prompt);
    });
    shouldRender = true;
  } else if (promptsResult.status === "rejected") {
    console.warn("[TTALKAK] /api/me/prompts 연동에 실패해 데모 내 프롬프트를 유지합니다.", promptsResult.reason);
  }

  if (commentsResult.status === "fulfilled" && Array.isArray(commentsResult.value)) {
    state.backendMyComments = commentsResult.value;
    commentsResult.value.forEach((comment) => {
      if (comment.prompt) {
        upsertPrompt(popularPrompts, comment.prompt);
        upsertPrompt(savedPrompts, comment.prompt);
      }
    });
    shouldRender = true;
  }

  if (reportsResult.status === "fulfilled" && Array.isArray(reportsResult.value)) {
    state.backendMyReports = reportsResult.value;
    shouldRender = true;
  }

  state.myBackendStatus = "connected";
  if (shouldRender) render();
}

async function hydrateBackendAdminDataIfNeeded() {
  if (state.route !== "admin" || !state.adminMode || state.adminBackendStatus !== "idle") return;
  const api = window.TTALKAK_API;
  if (!api?.getAdminReports && !api?.getAdminTags) return;

  state.adminBackendStatus = "checking";
  const token = state.authToken || state.token || undefined;
  const [reportsResult, tagsResult] = await Promise.allSettled([
    api.getAdminReports?.({}, token),
    api.getAdminTags?.({}, token),
  ]);

  let shouldRender = false;
  if (reportsResult.status === "fulfilled" && Array.isArray(reportsResult.value)) {
    state.backendAdminReports = reportsResult.value;
    reportsResult.value.forEach((report) => {
      state.reportRecords[report.key] = {
        ...getReportRecord(report.key),
        backendId: report.id,
        status: mapBackendReportStatus(report.status),
        reason: report.reason || getReportRecord(report.key).reason || "",
        createdAt: report.createdAt || Date.now(),
      };
      if (report.type === "prompt") state.reportedPromptIds.add(report.targetId);
      if (report.type === "comment") state.reportedCommentIds.add(report.targetId);
    });
    shouldRender = true;
  } else if (reportsResult.status === "rejected") {
    console.warn("[TTALKAK] /api/admin/reports 연동에 실패해 데모 신고 데이터를 유지합니다.", reportsResult.reason);
  }

  if (tagsResult.status === "fulfilled" && Array.isArray(tagsResult.value)) {
    state.backendAdminTags = tagsResult.value;
    tagsResult.value.forEach((tag) => {
      if (!tag.key) return;
      state.adminTagDecisions = { ...state.adminTagDecisions, [tag.key]: tag.status };
    });
    shouldRender = true;
  } else if (tagsResult.status === "rejected") {
    console.warn("[TTALKAK] /api/admin/tags 연동에 실패해 데모 태그 데이터를 유지합니다.", tagsResult.reason);
  }

  state.adminBackendStatus = "connected";
  if (shouldRender) render();
}

function persistState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        popularPrompts,
        savedPrompts: savedPrompts
          .filter((prompt) => !state.pendingUnsaveIds.has(prompt.id) || prompt.source === "mine")
          .map((prompt) =>
            state.pendingUnsaveIds.has(prompt.id) && prompt.source === "mine" ? { ...prompt, savedByMe: false } : prompt,
          ),
        commentsByPrompt,
        state: {
          isLoggedIn: state.isLoggedIn,
          currentUser: state.currentUser,
          currentUserId: state.currentUserId,
          currentUserRole: state.currentUserRole,
          authToken: state.authToken,
          token: state.token,
          libraryDemoSeeded: state.libraryDemoSeeded,
          userLibraryPromptIds: [...state.userLibraryPromptIds],
          likedPromptIds: [...state.likedPromptIds],
          likedCommentIds: [...state.likedCommentIds],
          reportedPromptIds: [...state.reportedPromptIds],
          reportedCommentIds: [...state.reportedCommentIds],
          hideReportedPrompts: state.hideReportedPrompts,
          adminMode: state.adminMode,
          adminHiddenPromptIds: [...state.adminHiddenPromptIds],
          adminTagDecisions: state.adminTagDecisions,
          adminTab: state.adminTab,
          adminPromptQuery: state.adminPromptQuery,
          adminPromptFilter: state.adminPromptFilter,
          adminTagQuery: state.adminTagQuery,
          adminTagFilter: state.adminTagFilter,
          adminTagSort: state.adminTagSort,
          adminUserQuery: state.adminUserQuery,
          adminUserActivityNickname: state.adminUserActivityNickname,
          adminPromptRevisionRequests: state.adminPromptRevisionRequests,
          reportRecords: state.reportRecords,
          searchScope: state.searchScope,
          popularSort: state.popularSort,
          savedSort: state.savedSort,
          guestImproveCount: state.guestImproveCount,
          recentThreads: state.recentThreads,
          makeFolders: state.makeFolders,
          activeFolderId: state.activeFolderId,
          activeThreadId: state.activeThreadId,
          messages: state.messages,
          composerDraft: state.composerDraft,
          templateCollapsed: state.templateCollapsed,
        },
      }),
    );
  } catch (_error) {
    // Local preview can still run if browser storage is blocked.
  }
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.popularPrompts)) {
      popularPrompts.splice(0, popularPrompts.length, ...parsed.popularPrompts);
    }
    if (Array.isArray(parsed.savedPrompts)) {
      savedPrompts.splice(0, savedPrompts.length, ...parsed.savedPrompts);
      normalizeSavedPromptOwnership();
    }
    if (parsed.commentsByPrompt && typeof parsed.commentsByPrompt === "object") {
      Object.keys(commentsByPrompt).forEach((key) => delete commentsByPrompt[key]);
      Object.assign(commentsByPrompt, parsed.commentsByPrompt);
    }

    const savedState = parsed.state || {};
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const restoredToken = storedToken || savedState.authToken || savedState.token || "";
    state.isLoggedIn = Boolean(savedState.isLoggedIn && restoredToken);
    state.currentUser = state.isLoggedIn ? savedState.currentUser || null : null;
    state.currentUserId = state.isLoggedIn ? savedState.currentUserId || null : null;
    state.currentUserRole = state.isLoggedIn ? savedState.currentUserRole || "user" : "user";
    state.authToken = state.isLoggedIn ? restoredToken : "";
    state.token = state.isLoggedIn ? restoredToken : "";
    state.libraryDemoSeeded = Boolean(savedState.libraryDemoSeeded);
    state.userLibraryPromptIds = new Set(Array.isArray(savedState.userLibraryPromptIds) ? savedState.userLibraryPromptIds : []);
    state.likedPromptIds = new Set(Array.isArray(savedState.likedPromptIds) ? savedState.likedPromptIds : []);
    state.likedCommentIds = new Set(Array.isArray(savedState.likedCommentIds) ? savedState.likedCommentIds : []);
    state.reportedPromptIds = new Set(Array.isArray(savedState.reportedPromptIds) ? savedState.reportedPromptIds : []);
    state.reportedCommentIds = new Set(Array.isArray(savedState.reportedCommentIds) ? savedState.reportedCommentIds : []);
    state.hideReportedPrompts = Boolean(savedState.hideReportedPrompts);
    state.adminMode = Boolean(state.isLoggedIn && state.currentUserRole === "admin" && savedState.adminMode);
    if (state.adminMode) state.route = "admin";
    state.adminHiddenPromptIds = new Set(Array.isArray(savedState.adminHiddenPromptIds) ? savedState.adminHiddenPromptIds : []);
    state.adminTagDecisions = savedState.adminTagDecisions && typeof savedState.adminTagDecisions === "object" ? savedState.adminTagDecisions : {};
    state.adminTab = ["reports", "prompts", "tags", "users"].includes(savedState.adminTab) ? savedState.adminTab : "reports";
    state.adminPromptQuery = savedState.adminPromptQuery || "";
    state.adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(savedState.adminPromptFilter)
      ? savedState.adminPromptFilter
      : "all";
    state.adminTagQuery = savedState.adminTagQuery || "";
    state.adminTagFilter = ["all", "pending", "approved", "rejected"].includes(savedState.adminTagFilter)
      ? savedState.adminTagFilter
      : "all";
    state.adminTagSort = ["usage", "recent"].includes(savedState.adminTagSort) ? savedState.adminTagSort : "usage";
    state.adminUserQuery = savedState.adminUserQuery || "";
    state.adminUserActivityNickname = savedState.adminUserActivityNickname || "";
    state.adminPromptRevisionRequests =
      savedState.adminPromptRevisionRequests && typeof savedState.adminPromptRevisionRequests === "object"
        ? savedState.adminPromptRevisionRequests
        : {};
    state.reportRecords = savedState.reportRecords && typeof savedState.reportRecords === "object" ? savedState.reportRecords : {};
    state.searchScope = getValidSearchScope(savedState.searchScope);
    state.popularSort = ["popular", "saves", "comments", "likes", "latest"].includes(savedState.popularSort)
      ? savedState.popularSort
      : "popular";
    state.savedSort = ["recent", "saves", "comments", "likes", "views"].includes(savedState.savedSort)
      ? savedState.savedSort
      : "recent";
    state.guestImproveCount = Number(savedState.guestImproveCount || 0);
    state.recentThreads = Array.isArray(savedState.recentThreads) ? savedState.recentThreads : [];
    state.makeFolders = normalizeMakeFolders(savedState.makeFolders);
    state.activeFolderId = state.makeFolders.some((folder) => folder.id === savedState.activeFolderId) || savedState.activeFolderId === "all" ? savedState.activeFolderId : "all";
    state.activeThreadId = savedState.activeThreadId || null;
    state.messages = Array.isArray(savedState.messages) ? savedState.messages : [];
    state.composerDraft = savedState.composerDraft || "";
    state.templateCollapsed = Boolean(savedState.templateCollapsed);
    normalizePersistedLikeCounts();
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
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
  const seen = new Set();

  state.recentThreads = state.recentThreads.filter((thread, index) => {
    if (!thread.id) {
      thread.id = `legacy-thread-${Date.now()}-${index}`;
    }
    const key = thread.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    thread.dedupeKey = key;
    return true;
  });
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

async function hydrateBackendHomeData() {
  const api = window.TTALKAK_API;
  if (!api?.getCommunityPosts) {
    state.backendStatus = "fallback";
    state.backendStatusMessage = "src/api.js를 사용할 수 없어 데모 데이터를 표시 중입니다.";
    render();
    return;
  }

  const [promptsResult, tagsResult] = await Promise.allSettled([
    api.getCommunityPosts({ page: 1, size: 64, sort: state.popularSort }),
    api.getPopularTags?.({ limit: 8 }),
  ]);

  let shouldRender = false;

  if (promptsResult.status === "fulfilled" && Array.isArray(promptsResult.value?.items)) {
    popularPrompts.splice(
      0,
      popularPrompts.length,
      ...promptsResult.value.items.map((prompt) => ({
        ...prompt,
        source: prompt.source || "community",
        isShared: prompt.isShared ?? true,
      })),
    );
    normalizePersistedLikeCounts();
    state.backendStatus = "connected";
    state.backendStatusMessage = "GET http://localhost:8080/api/prompts 응답으로 Home 목록을 렌더링 중입니다.";
    shouldRender = true;
  } else if (promptsResult.status === "rejected") {
    state.backendStatus = "fallback";
    state.backendStatusMessage = "GET http://localhost:8080/api/prompts 호출에 실패해 데모 데이터를 표시 중입니다.";
    console.warn("[TTALKAK] /api/prompts 연동에 실패해 데모 데이터를 유지합니다.", promptsResult.reason);
  }

  if (tagsResult.status === "fulfilled" && Array.isArray(tagsResult.value)) {
    state.backendPopularTags = tagsResult.value.slice(0, 8);
    if (state.backendStatus === "connected") {
      state.backendStatusMessage = "GET /api/prompts와 GET /api/tags/popular 응답을 Home에 반영 중입니다.";
    }
    shouldRender = true;
  } else if (tagsResult.status === "rejected") {
    console.warn("[TTALKAK] /api/tags/popular 연동에 실패해 데모 태그를 유지합니다.", tagsResult.reason);
  }

  if (shouldRender) render();
}

async function refreshBackendHomePrompts() {
  const api = window.TTALKAK_API;
  if (!api?.searchCommunityPosts) return;

  const query = String(state.searchQuery || "").trim();
  const scope = getValidSearchScope(state.searchScope);
  const requestSignature = JSON.stringify({ query, scope, sort: state.popularSort });
  state.backendStatusMessage = "GET /api/prompts 검색 조건을 백엔드에 전달 중입니다.";

  try {
    const result = await api.searchCommunityPosts({
      scope,
      query,
      page: 1,
      size: 64,
      sort: state.popularSort,
    });
    if (requestSignature !== JSON.stringify({ query: String(state.searchQuery || "").trim(), scope: getValidSearchScope(state.searchScope), sort: state.popularSort })) {
      return;
    }
    if (Array.isArray(result?.items)) {
      popularPrompts.splice(
        0,
        popularPrompts.length,
        ...result.items.map((prompt) => ({
          ...prompt,
          source: prompt.source || (prompt.isMine ? "mine" : "community"),
          isShared: prompt.isShared ?? true,
        })),
      );
      state.backendStatus = "connected";
      state.backendStatusMessage = query
        ? `GET /api/prompts?scope=${scope}&query=... 검색 결과를 Home에 반영 중입니다.`
        : "GET /api/prompts 응답으로 Home 목록을 렌더링 중입니다.";
      normalizePersistedLikeCounts();
      render();
    }
  } catch (error) {
    state.backendStatus = "fallback";
    state.backendStatusMessage = "검색 API 호출에 실패해 현재 화면의 로컬 목록을 유지합니다.";
    console.warn("[TTALKAK] /api/prompts 검색 호출에 실패해 로컬 필터를 유지합니다.", error);
  }
}

loadPersistedState();
normalizeDemoCopy();
normalizeAssistantPromptOutputs();
normalizeRecentThreads();
ensureDemoComments();
render();
hydrateBackendHomeData();

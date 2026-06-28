const popularPrompts = [
  {
    id: "post-1",
    title: "전문적인 인스타그램 캡션 작성",
    text: "당신은 전문적인 콘텐츠 마케터입니다. 브랜드의 핵심 메시지를 살려 인스타그램 캡션을 작성해주세요. 해시태그도 5개 포함해주세요.",
    tags: ["마케팅", "인스타그램", "콘텐츠"],
    views: 150420,
    comments: 1835,
    saves: 62880,
    author: "박민준",
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
    author: "박민준",
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
    author: "김지수",
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
    author: "이서연",
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
    author: "이서연",
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
    author: "이서연",
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
    author: "김지수",
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
    author: "이서연",
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

const fallbackPopularTags = window.TTALKAK_DEMO_COPY?.fallbackPopularTags || ["SEO", "마케팅", "코딩", "이메일", "블로그", "콘텐츠", "첨삭", "기획"];
const demoPromptTextOverrides = {
  "post-1": {
    title: "전문적인 인스타그램 캡션 작성",
    text: "당신은 전문적인 콘텐츠 마케터입니다. 브랜드의 핵심 메시지를 살려 인스타그램 캡션을 작성해주세요. 해시태그도 5개 포함해주세요.",
    tags: ["마케팅", "인스타그램", "콘텐츠"],
    author: "박민준",
  },
  "post-2": {
    title: "글쓰기 첨삭 프롬프트",
    text: "더 매력적인 글쓰기를 위한 첨삭봇입니다. 글의 흐름, 문법, 가독성을 모두 고려해서 개선안을 제안해주세요.",
    tags: ["첨삭", "글쓰기", "편집"],
    author: "박민준",
  },
  "post-3": {
    title: "SEO 블로그 포스팅",
    text: "검색엔진 상위 노출을 위한 키워드 중심의 블로그 글을 작성해주세요. 제목, 소제목, 본문 구조를 함께 제안해주세요.",
    tags: ["SEO", "블로그", "검색최적화"],
    author: "김지수",
  },
  "post-4": {
    title: "소셜미디어 캠페인 전략",
    text: "특정 제품이나 서비스를 위한 소셜미디어 마케팅 캠페인 전략을 수립해주세요. 플랫폼별 접근 방법을 포함해주세요.",
    tags: ["소셜미디어", "캠페인", "전략"],
    author: "이서연",
  },
  "post-5": {
    title: "클릭을 유도하는 제목 작성",
    text: "특정 키워드를 중심으로 클릭을 유도할 수 있는 제목을 10개 만들어주세요. 숫자와 질문 형식을 활용해주세요.",
    tags: ["제목", "클릭베이트", "SEO"],
    author: "이서연",
  },
  "post-6": {
    title: "유튜브 영상 기획안",
    text: "시청자의 관심을 끌 수 있는 유튜브 영상 기획안을 작성해주세요. 훅, 본문, 마무리 CTA를 포함해주세요.",
    tags: ["유튜브", "영상", "기획"],
    author: "이서연",
  },
  "post-7": {
    title: "브레인스토밍 도우미",
    text: "새로운 아이디어나 프로젝트를 위한 창의적인 발상을 도와주세요. 다양한 관점에서 아이디어를 제시해주세요.",
    tags: ["브레인스토밍", "아이디어", "창의성"],
    author: "김지수",
  },
  "post-8": {
    title: "협찬 제안서 만들기",
    text: "브랜드와의 협업을 위한 전문적인 제안서를 작성해주세요. 나의 채널 특성과 타깃 오디언스를 강조해주세요.",
    tags: ["협찬", "제안서", "비즈니스"],
    author: "이서연",
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
      author: "김지수",
      text: "해시태그까지 같이 요청하는 구조라서 바로 활용하기 좋네요.",
      likes: 4,
      replies: [{ id: "reply-1", author: "박민준", text: "맞아요. 바로 복사해서 쓰기 좋은 형태라 편합니다.", likes: 0, edited: true }],
    },
    { id: "comment-2", author: "이서연", text: "브랜드 톤앤매너를 추가하면 결과가 더 정확해질 것 같아요.", likes: 2, edited: true },
  ],
  "post-2": [
    {
      id: "comment-3",
      author: "박민준",
      text: "문법, 흐름, 가독성을 나눠서 첨삭하는 방식이 마음에 듭니다.",
      likes: 1,
      replies: [{ id: "reply-2", author: "이서연", text: "여기에 톤 조정까지 넣으면 더 좋을 것 같아요.", likes: 0 }],
    },
  ],
  "post-3": [
    { id: "comment-4", author: "이서연", text: "검색 키워드와 독자 수준을 함께 넣으면 더 좋겠어요.", likes: 3 },
  ],
  "post-4": [
    { id: "comment-5", author: "김지수", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞습니다." },
    { id: "comment-6", author: "박민준", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같아요." },
  ],
  "post-5": [
    { id: "comment-7", author: "이서연", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나오네요." },
    { id: "comment-8", author: "김지수", text: "타깃 독자까지 넣으면 클릭률을 더 고려할 수 있겠어요." },
  ],
  "post-6": [
    { id: "comment-9", author: "박민준", text: "훅, 본문, 마무리 CTA로 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "이서연", text: "영상 길이와 업로드 채널을 추가하면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "김지수", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "박민준", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "이서연", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "김지수", text: "목표와 핵심 메시지를 분리하면 더 설득력 있을 것 같아요." },
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
const SAVED_PAGE_SIZE = 16;
const SEARCH_DEBOUNCE_MS = 320;

const commentsByPrompt = {
  "post-1": [
    { id: "comment-1", author: "김지수", text: "해시태그까지 같이 요청하는 구성이 실무에서 쓰기 좋네요." },
    { id: "comment-2", author: "이서연", text: "브랜드 톤앤매너를 추가하면 더 정확한 결과가 나올 것 같아요." },
  ],
  "post-2": [
    { id: "comment-3", author: "박민준", text: "문법, 흐름, 가독성을 나눠서 첨삭하는 방식이 마음에 듭니다." },
  ],
  "post-3": [
    { id: "comment-4", author: "이서연", text: "검색 키워드와 독자 페르소나도 함께 넣으면 더 좋겠어요." },
  ],
  "post-4": [
    { id: "comment-5", author: "김지수", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞아요." },
    { id: "comment-6", author: "박민준", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같습니다." },
  ],
  "post-5": [
    { id: "comment-7", author: "이서연", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나와요." },
    { id: "comment-8", author: "김지수", text: "타깃 독자까지 넣으면 클릭률을 더 잘 겨냥할 수 있겠네요." },
  ],
  "post-6": [
    { id: "comment-9", author: "박민준", text: "인트로, 본문, 마무리 CTA를 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "이서연", text: "영상 길이와 톤을 같이 적으면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "김지수", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "박민준", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "이서연", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "김지수", text: "목차와 핵심 메시지를 분리해달라고 하면 더 정돈될 것 같아요." },
  ],
};

const demoCommentBackfill = {
  "post-4": [
    { id: "comment-5", author: "김지수", text: "플랫폼별 접근 방식을 따로 요청하는 점이 실무에 잘 맞아요." },
    { id: "comment-6", author: "박민준", text: "캠페인 목적과 예산 범위를 추가하면 더 구체적일 것 같습니다." },
  ],
  "post-5": [
    { id: "comment-7", author: "이서연", text: "숫자와 질문형 제목을 함께 요구해서 결과물이 다양하게 나와요." },
    { id: "comment-8", author: "김지수", text: "타깃 독자까지 넣으면 클릭률을 더 잘 겨냥할 수 있겠네요." },
  ],
  "post-6": [
    { id: "comment-9", author: "박민준", text: "인트로, 본문, 마무리 CTA를 나누는 구성이 좋습니다." },
    { id: "comment-10", author: "이서연", text: "영상 길이와 톤을 같이 적으면 더 바로 쓰기 좋겠어요." },
  ],
  "post-7": [
    { id: "comment-11", author: "김지수", text: "브레인스토밍 단계에서 관점 전환을 요청하는 방식이 유용합니다." },
    { id: "comment-12", author: "박민준", text: "아이디어 평가 기준까지 붙이면 회의용으로도 좋겠어요." },
  ],
  "post-8": [
    { id: "comment-13", author: "이서연", text: "브랜드와 타깃 오디언스를 함께 묻는 점이 제안서에 잘 맞습니다." },
    { id: "comment-14", author: "김지수", text: "목차와 핵심 메시지를 분리해달라고 하면 더 정돈될 것 같아요." },
  ],
};

const state = {
  route: "home",
  authView: null,
  detailPromptId: null,
  reportPromptId: null,
  reportCommentId: null,
  editingPromptId: null,
  editingMessageId: null,
  executeMessageId: null,
  executePromptId: null,
  confirmAction: null,
  hideReportedPrompts: false,
  adminMode: false,
  adminHiddenPromptIds: new Set(),
  adminTagDecisions: {},
  reportRecords: {},
  isLoggedIn: false,
  currentUser: null,
  isComposingSearch: false,
  isComposingShareTag: false,
  searchTipShown: false,
  searchTipVisible: false,
  searchQuery: "",
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
let searchTipTimer = null;

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
  bookmark: `<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-3.8L6 21z"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
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
      ${state.authView ? AuthModal() : ""}
      ${state.reportPromptId || state.reportCommentId ? ReportModal() : ""}
      ${state.executeMessageId || state.executePromptId ? ExecuteModal() : ""}
      ${state.confirmAction ? ConfirmModal() : ""}
      ${state.notice ? `<div class="toast" role="status">${state.notice}</div>` : ""}
    </div>
  `;
  bindEvents();
  focusActiveModal();
}

function navigateTo(route) {
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
  state.searchQuery = "";
  state.popularPage = 1;
  state.detailPromptId = null;
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
  } else if (state.editingPromptId) {
    state.editingPromptId = null;
  } else if (state.detailPromptId) {
    state.detailPromptId = null;
  } else {
    return;
  }

  render();
}

function focusActiveModal() {
  window.setTimeout(() => {
    const modals = document.querySelectorAll(".modal");
    const modal = modals[modals.length - 1];
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

  return `
    <aside class="sidebar" aria-label="주요 메뉴">
      <nav class="nav-list">
        ${item("home", "Home", icons.home)}
        ${item("make", "Make", icons.make)}
        ${item("saved", "Saved", icons.save)}
        ${item("share", "Share", icons.share)}
        ${state.adminMode ? item("admin", "Admin", icons.shield) : ""}
      </nav>
    </aside>
  `;
}

function Header() {
  const remaining = Math.max(0, FREE_MAKE_LIMIT - state.guestImproveCount);
  const hasReportedPrompts = state.reportedPromptIds.size > 0;
  const showPromptTools = state.route === "home" || state.route === "saved";
  const authButton = state.isLoggedIn
    ? `<div class="account-actions"><button class="topbar-tool ${state.adminMode ? "active" : ""}" type="button" data-toggle-admin-demo>관리자 데모</button><button class="login-button logged-in" type="button" data-logout>${escapeHtml(state.currentUser || "사용자")}님 · 로그아웃</button></div>`
    : `<button class="login-button" type="button" data-open-auth="login">로그인</button>`;

  return `
    <header class="topbar">
      <button class="brand" data-route="home" aria-label="TTALKAK 홈">
        <span class="brand-mark">T</span>
        <span>TTALKAK</span>
      </button>
      <div class="topbar-auth">
        ${authButton}
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
  if (state.route === "make") return MakePage();
  if (state.route === "saved") return SavedPage();
  if (state.route === "share") return SharePage();
  if (state.route === "admin") return AdminPage();
  return HomePage();
}

function HomePage() {
  const prompts = applyReportedVisibility(getVisiblePopularPrompts());
  const popularTags = getPopularTags(applyReportedVisibility(sortPopularPrompts(getUniquePrompts(popularPrompts))));
  const displayTags = popularTags.length ? popularTags : fallbackPopularTags;
  const totalPages = getPopularTotalPages(prompts.length);
  const currentPage = Math.min(state.popularPage, totalPages);
  const pagePrompts = prompts.slice((currentPage - 1) * 16, currentPage * 16);
  const isSearching = state.searchQuery.trim().length > 0;

  return `
    <section class="home-page" aria-labelledby="popular-heading">
      <label class="search-field">
        <span>${icons.search}</span>
        <input type="search" data-tag-search value="${escapeHtml(state.searchQuery)}" placeholder="해시태그로 프롬프트를 검색하세요..." aria-label="해시태그 검색" />
        <button class="search-help ${state.searchTipVisible ? "show-tip" : ""}" type="button" data-search-help aria-label="다중 해시태그 검색 안내">
          <span>${icons.bulb}</span>
          <small role="tooltip">쉼표로 여러 해시태그를 함께 검색할 수 있습니다.</small>
        </button>
      </label>
      <div class="popular-tags" aria-label="인기 태그">
        ${displayTags.map((tag) => `<button class="${normalizeTag(state.searchQuery) === normalizeTag(tag) ? "active" : ""}" type="button" data-popular-tag="${tag}">#${tag}</button>`).join("")}
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
              <p>일치하는 해시태그의 프롬프트가 없습니다.</p>
            </div>`
      }
    </section>
  `;
}

function SortOption(value, label) {
  return `<option value="${value}" ${state.popularSort === value ? "selected" : ""}>${label}</option>`;
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
  const prompt = savedPrompts.find((item) => item.id === promptId);
  return Boolean(prompt?.savedByMe) && !state.pendingUnsaveIds.has(promptId);
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

function commitPendingUnsaves(nextRoute = state.route) {
  if (state.route !== "saved" || nextRoute === "saved" || state.pendingUnsaveIds.size === 0) return;

  state.pendingUnsaveIds.forEach((promptId) => {
    const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);
    if (savedIndex >= 0) {
      if (savedPrompts[savedIndex].source === "mine") {
        savedPrompts[savedIndex].savedByMe = false;
      } else {
        savedPrompts.splice(savedIndex, 1);
      }
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
  const canDelete = prompt.source === "mine";
  const isMine = prompt.source === "mine";
  const isLiked = state.likedPromptIds.has(prompt.id);
  const isReported = state.reportedPromptIds.has(prompt.id);
  const isShared = prompt.isShared === true || prompt.source === "community";
  const hasMakeHistory = isMine && Array.isArray(prompt.messages) && prompt.messages.length > 0;
  const commentCount = getPromptCommentCount(prompt);
  const showStatus = options.showStatus !== false;
  const statusBadges = [
    isMine
      ? `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`
      : "",
    isPendingUnsave ? `<span class="status-badge pending-unsave">저장 취소 예정</span>` : "",
  ].join("");

  return `
    <article class="prompt-card ${isMine ? "mine-card" : ""} ${isReported ? "reported-card" : ""} ${isPendingUnsave ? "pending-unsave-card" : ""}" data-open-prompt="${prompt.id}" tabindex="0" role="button" aria-label="${prompt.title} 전체 보기">
      <div class="card-head">
        <h2>${prompt.title}</h2>
        <div class="card-actions">
          ${isMine ? `<button class="icon-button edit-card-button" data-edit-prompt="${prompt.id}" aria-label="수정">${icons.edit}</button>` : ""}
          ${isMine && !isShared ? `<button class="icon-button share-card-button" data-share-saved="${prompt.id}" aria-label="공유">${icons.share}</button>` : ""}
          ${isMine && isShared ? `<button class="icon-button unshare-card-button" data-unshare-prompt="${prompt.id}" aria-label="공유 취소">${icons.share}</button>` : ""}
          ${hasMakeHistory ? `<button class="history-card-button" data-open-make-history="${prompt.id}" aria-label="Make 대화 보기">${icons.make}<span>대화 보기</span></button>` : ""}
          ${canDelete ? `<button class="icon-button delete-card-button" data-delete-prompt="${prompt.id}" aria-label="삭제">${icons.trash}</button>` : ""}
          <button class="icon-button metric-action like-card-button ${isLiked ? "liked" : ""}" data-like-prompt="${prompt.id}" aria-label="좋아요">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
          <button class="icon-button metric-action comment-card-button" data-open-comments="${prompt.id}" aria-label="댓글 보기">${icons.comment}<span>${formatNumber(commentCount)}</span></button>
          <button class="icon-button metric-action save-card-button ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
        </div>
      </div>
      ${showStatus && statusBadges ? `<div class="status-row">${statusBadges}</div>` : ""}
      <p>${prompt.text}</p>
      <div class="tag-row">${prompt.tags.map((tag) => `<button type="button" data-search-tag="${escapeHtml(tag)}">#${tag}</button>`).join("")}</div>
      <footer class="card-meta">
        <span>${icons.eye}${formatNumber(prompt.views)}</span>
        <span>${prompt.author}</span>
      </footer>
    </article>
  `;
}

function PromptDetailModal() {
  const prompt = findPromptById(state.detailPromptId);
  if (!prompt) return "";

  const isSaved = isPromptSaved(prompt.id);
  const isPendingUnsave = isPromptPendingUnsave(prompt.id);
  const canDelete = prompt.source === "mine";
  const comments = getSortedPromptComments(prompt.id);
  const commentCount = getPromptCommentCount(prompt);
  const isCommentsExpanded = Boolean(state.expandedComments[prompt.id]);
  const visibleComments = isCommentsExpanded ? comments : comments.slice(0, 3);
  const isLiked = state.likedPromptIds.has(prompt.id);
  const isReported = state.reportedPromptIds.has(prompt.id);
  const isShared = prompt.isShared === true || prompt.source === "community";

  return `
    <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="prompt-detail-title">
      <article class="modal prompt-detail-modal">
        <div class="modal-head">
          <h2 id="prompt-detail-title">${prompt.title}</h2>
        </div>
        <div class="prompt-detail-layout">
          <section class="prompt-detail-main" aria-label="프롬프트 내용">
            <p class="prompt-detail-text">${prompt.text}</p>
            <div class="tag-row detail-tags">${prompt.tags.map((tag) => `<button type="button" data-search-tag="${escapeHtml(tag)}">#${tag}</button>`).join("")}</div>
            <footer class="card-meta detail-meta">
              <span>${icons.eye}${formatNumber(prompt.views)}</span>
              <span>${prompt.author}</span>
              <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
            </footer>
          </section>
          <section class="comments-panel" aria-label="댓글">
            <div class="comments-head">
              <h3>댓글</h3>
              <div class="comments-head-actions">
                <span>${formatNumber(commentCount)}개</span>
                <button type="button" data-toggle-comments="${prompt.id}">${isCommentsExpanded ? "접기" : "펼치기"}</button>
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
                    state.isLoggedIn
                      ? `<form class="comment-form" data-comment-form="${prompt.id}">
                          <input name="comment" type="text" placeholder="댓글을 입력하세요." autocomplete="off" />
                          <button class="primary-button" type="submit">등록</button>
                        </form>`
                      : `<div class="comment-login">
                          <span>댓글을 작성하려면 로그인이 필요합니다.</span>
                          <button class="secondary-button" type="button" data-open-auth="login">로그인</button>
                        </div>`
                  }`
                : `<p class="comment-empty">댓글 ${formatNumber(commentCount)}개가 접혀 있습니다.</p>`
            }
          </section>
        </div>
        <div class="modal-actions detail-actions">
          <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
          <button class="detail-action-button execute-action" type="button" data-execute-prompt="${prompt.id}" aria-label="AI 적용">${icons.play}<span>Execute</span></button>
          <button class="detail-action-button like-action ${isLiked ? "liked" : ""}" type="button" data-like-prompt="${prompt.id}" aria-label="${isLiked ? "좋아요 취소" : "좋아요"}">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
          <button class="detail-action-button save-action ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" type="button" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : isSaved ? "저장 취소" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
          ${canDelete && !isShared ? `<button class="secondary-button" type="button" data-share-saved="${prompt.id}">공유하기</button>` : ""}
          ${canDelete && isShared ? `<button class="secondary-button" type="button" data-unshare-prompt="${prompt.id}">공유 취소</button>` : ""}
          ${canDelete ? `<button class="secondary-button danger-button" type="button" data-delete-prompt="${prompt.id}">삭제</button>` : ""}
          <button class="detail-action-button report-action report-state-button ${isReported ? "reported" : ""}" type="button" data-report-prompt="${prompt.id}" aria-label="${isReported ? "신고됨" : "신고"}">${icons.flag}</button>
        </div>
      </article>
    </div>
  `;
}

function PromptEditModal() {
  const prompt = findPromptById(state.editingPromptId);
  if (!prompt || (prompt.source !== "mine" && !state.adminMode)) return "";

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

function CommentItem(comment) {
  const canDelete = canDeleteComment(comment);
  const isReported = state.reportedCommentIds.has(comment.id);
  const isLiked = state.likedCommentIds.has(comment.id);
  const replies = getSortedCommentReplies(comment);
  const isReplying = state.replyingCommentId === comment.id;
  const isEditing = state.editingCommentId === comment.id;

  return `
    <article class="comment-item ${isReported ? "reported-comment" : ""}">
      <div class="comment-item-head">
        <strong>${comment.author}</strong>
        <div class="comment-actions">
          ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${comment.id}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "댓글 좋아요 취소" : "댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(comment))}</span></button>`}
          <button class="comment-reply-button" type="button" data-reply-comment="${comment.id}" title="답글" aria-label="답글">${icons.comment}</button>
          ${
            canDelete
              ? `<button class="comment-edit-button" type="button" data-edit-comment="${comment.id}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                 <button class="comment-delete-button" type="button" data-delete-comment="${comment.id}" title="삭제" aria-label="댓글 삭제">${icons.trash}</button>`
              : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${comment.id}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "댓글 신고"}">${icons.flag}</button>`
          }
        </div>
      </div>
      ${
        isEditing
          ? `<form class="comment-edit-form" data-edit-comment-form="${comment.id}">
              <input name="comment" type="text" value="${escapeHtml(comment.text)}" autocomplete="off" />
              <button class="primary-button" type="submit">저장</button>
            </form>`
          : `<p>${comment.text}${comment.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
      }
      ${
        replies.length || isReplying
          ? `<div class="reply-thread">
              ${replies.map(ReplyItem).join("")}
              ${
                isReplying
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
  const canDelete = canDeleteComment(reply);
  const isReported = state.reportedCommentIds.has(reply.id);
  const isLiked = state.likedCommentIds.has(reply.id);
  const isEditing = state.editingCommentId === reply.id;

  return `
    <article class="reply-item ${isReported ? "reported-reply" : ""}">
      <div class="reply-item-head">
        <strong>${reply.author}</strong>
        <div class="reply-actions">
          ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${reply.id}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "대댓글 좋아요 취소" : "대댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(reply))}</span></button>`}
          ${
            canDelete
              ? `<button class="comment-edit-button" type="button" data-edit-comment="${reply.id}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                 <button class="comment-delete-button" type="button" data-delete-comment="${reply.id}" title="삭제" aria-label="답글 삭제">${icons.trash}</button>`
              : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${reply.id}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "대댓글 신고"}">${icons.flag}</button>`
          }
        </div>
      </div>
      ${
        isEditing
          ? `<form class="comment-edit-form" data-edit-comment-form="${reply.id}">
              <input name="comment" type="text" value="${escapeHtml(reply.text)}" autocomplete="off" />
              <button class="primary-button" type="submit">저장</button>
            </form>`
          : `<p>${reply.text}${reply.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
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
  const visibleThreads =
    state.activeFolderId === "all"
      ? state.recentThreads
      : state.recentThreads.filter((thread) => (thread.folderId || "uncategorized") === state.activeFolderId);

  return `
    <aside class="make-side-panel" aria-label="Make 최근 대화">
      <section class="make-folder-section">
        <div class="make-side-head">
          <strong>폴더</strong>
          <button type="button" data-show-folder-form>새 폴더</button>
        </div>
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
          ${state.makeFolders.map((folder) => MakeFolderButton(folder.id, folder.name, countThreadsInFolder(folder.id))).join("")}
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
                <article class="recent-thread ${state.activeThreadId === thread.id ? "active" : ""}">
                  <button class="recent-thread-main" type="button" data-open-thread="${thread.id}">
                    <strong>${escapeHtml(thread.title)}</strong>
                    <span>${escapeHtml(thread.preview)}</span>
                    <small>${formatShortDate(thread.createdAt)}</small>
                  </button>
                  <select class="thread-folder-select" data-thread-folder="${thread.id}" aria-label="대화 폴더">
                    ${state.makeFolders.map((folder) => `<option value="${folder.id}" ${getThreadFolderId(thread) === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
                  </select>
                  <button class="recent-thread-delete" type="button" data-delete-thread="${thread.id}" aria-label="대화 삭제">${icons.trash}</button>
                </article>
              `).join("")}
            </div>`
          : `<p class="recent-empty">아직 저장된 대화가 없습니다.</p>`
      }
    </aside>
  `;
}

function MakeFolderButton(folderId, name, count) {
  const isEditing = state.editingFolderId === folderId && folderId !== "all" && folderId !== "uncategorized";
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
    <div class="make-folder-item ${state.activeFolderId === folderId ? "active" : ""}">
      <button type="button" data-open-folder="${folderId}">${icons.bookmark}<span>${escapeHtml(name)}</span><em>${formatNumber(count)}</em></button>
      ${
        folderId !== "all" && folderId !== "uncategorized"
          ? `<div class="make-folder-actions"><button type="button" data-edit-folder="${folderId}" aria-label="폴더 수정">${icons.edit}</button><button type="button" data-delete-folder="${folderId}" aria-label="폴더 삭제">${icons.trash}</button></div>`
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
      <div class="message-group assistant-group">
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
    <div class="message-group user-group">
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
            </article>
            <footer class="user-message-actions">
              <button type="button" data-edit-message="${message.id}">${icons.edit}<span>수정</span></button>
            </footer>`
      }
    </div>
  `;
}

function SavedPage() {
  const tabs = [
    { id: "library", label: "내 보관함", count: getSavedPagePrompts().length },
    { id: "mine", label: "내가 만든 프롬프트", count: getMyPrompts().length },
    { id: "comments", label: "댓글 관리", count: getMyComments().length },
    { id: "reports", label: "신고 내역", count: state.reportedPromptIds.size + state.reportedCommentIds.size },
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
      ${MyPagePanel()}
    </section>
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
                  (item) => `
                    <article class="activity-item">
                      <div>
                        <strong>${escapeHtml(item.prompt?.title || "삭제된 프롬프트")}</strong>
                        <p>${escapeHtml(item.comment.text)}</p>
                      </div>
                      <div class="activity-actions">
                        <button type="button" data-open-prompt="${item.promptId}">원문 보기</button>
                        <button type="button" data-edit-comment="${item.comment.id}">수정</button>
                        <button type="button" data-delete-comment="${item.comment.id}">삭제</button>
                      </div>
                    </article>
                  `,
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
                        <strong>${report.type === "prompt" ? "프롬프트 신고" : "댓글 신고"}</strong>
                        <p>${escapeHtml(report.label)}</p>
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
          <p>관리자 데모를 켜야 Admin 페이지를 볼 수 있습니다.</p>
        </div>
      </section>
    `;
  }

  const reportedPrompts = [...state.reportedPromptIds].map((id) => findPromptById(id)).filter(Boolean);
  const reportRecords = getAdminReportRecords();
  const allPrompts = getUniquePrompts([...popularPrompts, ...savedPrompts]);
  const pendingTags = getKnownTags().filter((tag) => !state.adminTagDecisions[normalizeTag(tag)]).slice(0, 12);

  return `
    <section class="admin-page" aria-labelledby="admin-heading">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.shield}</span>
          <h1 id="admin-heading">Admin</h1>
        </div>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>신고 관리</h2>
          ${
            reportRecords.length
              ? reportRecords
                  .map(
                    (record) => `
                      <article class="admin-row report-status-${record.status}">
                        <div>
                          <strong>${escapeHtml(record.title)}</strong>
                          <p>${escapeHtml(record.summary)}</p>
                          <span class="status-badge ${record.status === "dismissed" ? "private" : record.status === "resolved" ? "public" : "pending-unsave"}">${getReportStatusLabel(record.status)}</span>
                        </div>
                        <div class="admin-actions">
                          ${record.promptId ? `<button type="button" data-open-prompt="${record.promptId}">보기</button>` : ""}
                          ${record.promptId ? `<button type="button" data-edit-prompt="${record.promptId}">수정</button>` : ""}
                          ${record.promptId ? `<button type="button" data-admin-hide-prompt="${record.promptId}">${state.adminHiddenPromptIds.has(record.promptId) ? "숨김 해제" : "숨김"}</button>` : ""}
                          <button type="button" data-admin-report-status="${record.key}:resolved">처리 완료</button>
                          <button type="button" data-admin-report-status="${record.key}:dismissed">기각</button>
                          ${record.status === "dismissed" ? `<button type="button" data-admin-report-status="${record.key}:pending">기각 취소</button>` : ""}
                          ${record.promptId ? `<button type="button" data-admin-delete-prompt="${record.promptId}">대상 삭제</button>` : ""}
                        </div>
                      </article>
                    `,
                  )
                  .join("")
              : `<p class="admin-empty">접수된 신고가 없습니다.</p>`
          }
        </section>
        <section class="admin-panel">
          <h2>프롬프트 관리</h2>
          ${allPrompts
            .slice(0, 8)
            .map(
              (prompt) => `
                <article class="admin-row">
                  <div>
                    <strong>${escapeHtml(prompt.title)}</strong>
                    <p>${prompt.source === "mine" ? "내 프롬프트" : "커뮤니티"} · ${prompt.isShared || prompt.source === "community" ? "공유됨" : "비공개"}</p>
                  </div>
                  <div class="admin-actions">
                    <button type="button" data-open-prompt="${prompt.id}">보기</button>
                    <button type="button" data-edit-prompt="${prompt.id}">수정</button>
                    <button type="button" data-admin-hide-prompt="${prompt.id}">${state.adminHiddenPromptIds.has(prompt.id) ? "숨김 해제" : "숨김"}</button>
                    <button type="button" data-admin-delete-prompt="${prompt.id}">삭제</button>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
        <section class="admin-panel">
          <h2>태그 관리</h2>
          ${
            pendingTags.length
              ? pendingTags
                  .map(
                    (tag) => `
                      <article class="admin-row">
                        <strong>#${escapeHtml(tag)}</strong>
                        <div class="admin-actions">
                          <button type="button" data-admin-tag-action="approved:${escapeHtml(normalizeTag(tag))}">검토 완료</button>
                          <button type="button" data-admin-tag-action="rejected:${escapeHtml(normalizeTag(tag))}">추천 제외</button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
              : `<p class="admin-empty">검토할 태그가 없습니다.</p>`
          }
        </section>
      </div>
    </section>
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

  if (isWithdraw) {
    return `
      <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="modal auth-modal" data-auth-form>
          <div class="modal-head">
            <h2 id="auth-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
          </div>
          <p class="auth-helper">회원탈퇴는 백엔드 연동 후 계정과 작성 데이터 정책에 맞춰 처리됩니다. 현재는 데모 흐름입니다.</p>
          <button class="primary-button danger-primary full" type="submit">회원탈퇴 데모</button>
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
          <p class="auth-helper">${isFindId ? "이름과 전화번호 또는 이메일로 아이디 찾기 데모를 진행합니다." : "아이디와 전화번호 또는 이메일로 비밀번호 재설정 데모를 진행합니다."}</p>
          ${
            isFindId
              ? `<input name="name" placeholder="이름" autocomplete="name" />`
              : `<input name="userId" placeholder="아이디" autocomplete="username" />`
          }
          <input name="phone" placeholder="전화번호" autocomplete="tel" />
          <input name="email" type="email" placeholder="이메일" autocomplete="email" />
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
        ${isSignup ? `<div class="auth-check-row"><input name="nickname" placeholder="닉네임" /><button type="button" data-check-duplicate="nickname">중복 확인</button></div><input name="name" placeholder="이름" /><div class="auth-check-row"><input name="userId" placeholder="아이디" autocomplete="username" /><button type="button" data-check-duplicate="userId">중복 확인</button></div><input name="email" type="email" placeholder="이메일 (선택)" autocomplete="email" /><input name="birth" type="date" aria-label="생년월일 선택" />` : `<input name="userId" placeholder="아이디" autocomplete="username" />`}
        <label class="password-field">
          <input name="password" type="password" placeholder="비밀번호" autocomplete="${isSignup ? "new-password" : "current-password"}" />
          <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
        </label>
        ${
          isSignup
            ? `<label class="password-field">
                <input name="passwordConfirm" type="password" placeholder="비밀번호 확인" autocomplete="new-password" />
                <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
              </label>
              <label class="agreement-row"><input type="checkbox" name="terms" /> 사이트 이용 약관에 동의합니다</label>
              <label class="agreement-row"><input type="checkbox" name="privacy" /> 개인정보 수집 및 이용에 동의합니다</label>`
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
        ${isSignup ? `<button class="text-button" type="button" data-open-auth="login">이미 계정이 있어요</button>` : `<button class="text-button" type="button" data-open-auth="withdraw">회원탈퇴 데모</button>`}
      </form>
    </div>
  `;
}

function bindEvents() {
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

  document.querySelectorAll("[data-open-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authView = button.dataset.openAuth;
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
      state.adminMode = !state.adminMode;
      if (!state.adminMode && state.route === "admin") state.route = "home";
      showNotice(state.adminMode ? "관리자 데모 UI를 켰습니다." : "관리자 데모 UI를 껐습니다.");
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

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      togglePasswordVisibility(button);
    });
  });

  document.querySelectorAll("[data-google-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.isLoggedIn = true;
      state.currentUser = "Google닉네임";
      state.authView = null;
      showNotice("Google 계정으로 로그인했습니다.");
    });
  });

  document.querySelectorAll("[data-check-duplicate]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest(".auth-check-row");
      const input = row?.querySelector("input");
      if (!String(input?.value || "").trim()) {
        window.alert("중복 확인할 값을 입력해주세요.");
        return;
      }
      button.textContent = "확인 완료";
      button.disabled = true;
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
      render();
    });
  });

  document.querySelectorAll("[data-close-prompt-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingPromptId = null;
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
    button.addEventListener("click", () => {
      runConfirmedAction();
    });
  });

  document.querySelectorAll("[data-open-prompt]").forEach((card) => {
    card.addEventListener("click", () => {
      openPromptDetail(card.dataset.openPrompt);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPromptDetail(card.dataset.openPrompt);
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
      state.myPageTab = button.dataset.myTab;
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
      publishSavedPrompt(button.dataset.shareSaved);
    });
  });

  document.querySelectorAll("[data-unshare-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
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
      deleteOwnPrompt(button.dataset.deletePrompt);
    });
  });

  const searchInput = document.querySelector("[data-tag-search]");
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
        if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.isComposing) return;
        event.preventDefault();
        if (typeof composer.requestSubmit === "function") {
          composer.requestSubmit();
        } else {
          composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });
    }

    composer.addEventListener("submit", (event) => {
      event.preventDefault();
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
      state.activeThreadId = threadId;
      state.messages.push({ id: `user-${now}`, role: "user", content: value });
      state.messages.push({
        id: `make-${now}`,
        role: "assistant",
        content: polishPrompt(value),
        sourcePrompt: value,
      });
      state.composerDraft = "";
      updateRecentThread(threadId);
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
      render();
    });
  });

  document.querySelectorAll("[data-cancel-message-edit]").forEach((button) => {
    button.addEventListener("click", () => {
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

  document.querySelectorAll("[data-admin-tag-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const [decision, tag] = String(button.dataset.adminTagAction || "").split(":");
      if (!tag) return;
      state.adminTagDecisions = { ...state.adminTagDecisions, [tag]: decision };
      showNotice("태그 검토 상태를 변경했습니다.");
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

  document.querySelectorAll("[data-edit-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.editingPromptId = button.dataset.editPrompt;
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

  document.querySelectorAll("[data-show-folder-form]").forEach((button) => {
    button.addEventListener("click", () => {
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
      render();
    });
  });

  document.querySelectorAll("[data-edit-folder]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingFolderId = button.dataset.editFolder;
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
    button.addEventListener("click", () => {
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
      moveThreadToFolder(select.dataset.threadFolder, select.value);
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
      openRecentThread(button.dataset.openThread);
    });
  });

  document.querySelectorAll("[data-delete-thread]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
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
    authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(authForm);
      const isSignup = state.authView === "signup";
      const isFindId = state.authView === "find-id";
      const isFindPassword = state.authView === "find-password";
      const isWithdraw = state.authView === "withdraw";
      const userId = String(formData.get("userId") || "").trim();
      const password = String(formData.get("password") || "").trim();

      if (isWithdraw) {
        openConfirmAction({
          type: "withdraw",
          title: "회원탈퇴",
          message: "회원탈퇴 데모를 진행할까요?",
          confirmLabel: "회원탈퇴",
          danger: true,
        });
        return;
      }

      if (isFindId) {
        const name = String(formData.get("name") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        const email = String(formData.get("email") || "").trim();
        if (!name || (!phone && !email)) {
          window.alert("이름과 전화번호 또는 이메일을 입력해주세요.");
          return;
        }
        if (phone && !isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        state.authView = "login";
        showNotice("입력한 정보로 아이디 찾기 요청을 보냈습니다.");
        return;
      }

      if (isFindPassword) {
        const phone = String(formData.get("phone") || "").trim();
        const email = String(formData.get("email") || "").trim();
        if (!userId || (!phone && !email)) {
          window.alert("아이디와 전화번호 또는 이메일을 입력해주세요.");
          return;
        }
        if (phone && !isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        state.authView = "login";
        showNotice("비밀번호 재설정 요청을 보냈습니다.");
        return;
      }

      if (isSignup) {
        const requiredFields = [
          ["nickname", "닉네임"],
          ["name", "이름"],
          ["userId", "아이디"],
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
      }

      if (isSignup && formData.get("password") !== formData.get("passwordConfirm")) {
        window.alert("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        return;
      }
      state.isLoggedIn = true;
      state.currentUser = String(formData.get("nickname") || formData.get("name") || userId || "사용자").trim() || "사용자";
      state.authView = null;
      showNotice(isSignup ? "회원가입이 완료되었습니다." : "로그인했습니다.");
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
    button.addEventListener("click", () => {
      deleteOwnComment(button.dataset.deleteComment);
    });
  });

  document.querySelectorAll("[data-edit-comment]").forEach((button) => {
    button.addEventListener("click", () => {
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
  const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);

  if (savedIndex >= 0) {
    const savedPrompt = savedPrompts[savedIndex];
    const isSavedByMe = Boolean(savedPrompt.savedByMe);

    if (!isSavedByMe) {
      savedPrompt.savedByMe = true;
      state.pendingUnsaveIds.delete(promptId);
      updatePromptField(promptId, "saves", 1);
      showNotice("저장했습니다.");
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
    updatePromptField(promptId, "saves", -1);
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

  showNotice("저장했습니다.");
}

function toggleLikePrompt(promptId) {
  const isLiked = state.likedPromptIds.has(promptId);
  if (isLiked) {
    state.likedPromptIds.delete(promptId);
    updatePromptField(promptId, "likes", -1);
  } else {
    state.likedPromptIds.add(promptId);
    updatePromptField(promptId, "likes", 1);
  }
  showNotice(isLiked ? "좋아요를 취소했습니다." : "좋아요를 눌렀습니다.");
}

function openReportPrompt(promptId) {
  if (!findPromptById(promptId)) return;
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
    reason: content,
    createdAt: Date.now(),
  };
  state.reportPromptId = null;
  showNotice("신고가 접수되었습니다.");
}

function reportComment(commentId, reason) {
  const content = String(reason || "").trim();
  if (!content) {
    window.alert("신고 이유를 입력해주세요.");
    return;
  }

  state.reportedCommentIds.add(commentId);
  state.reportRecords[`comment:${commentId}`] = {
    type: "comment",
    targetId: commentId,
    status: "pending",
    reason: content,
    createdAt: Date.now(),
  };
  state.reportCommentId = null;
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

function openPromptDetail(promptId) {
  incrementPromptViews(promptId);
  state.detailPromptId = promptId;
  render();
}

function openPromptComments(promptId) {
  incrementPromptViews(promptId);
  state.detailPromptId = promptId;
  state.expandedComments[promptId] = true;
  render();
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
  return (comments || []).reduce((total, comment) => total + 1 + countCommentThread(comment.replies || []), 0);
}

function getCommentLikes(comment) {
  return Math.max(0, Number(comment?.likes || 0));
}

function toggleLikeComment(commentId) {
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
  } else {
    state.likedCommentIds.add(commentId);
    comment.likes = getCommentLikes(comment) + 1;
  }

  showNotice(isLiked ? "댓글 좋아요를 취소했습니다." : "댓글에 좋아요를 눌렀습니다.");
}

function getPromptCommentCount(prompt) {
  return countCommentThread(getPromptComments(prompt.id));
}

function addPromptComment(promptId, text) {
  const content = String(text || "").trim();
  if (!content) return;

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
  render();
}

function toggleReplyForm(commentId) {
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

  const parentComment = findCommentById(commentId);
  if (!parentComment) return;

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
  showNotice("답글을 등록했습니다.");
}

function toggleEditComment(commentId) {
  const comment = findCommentById(commentId);
  if (!comment || !canDeleteComment(comment)) return;

  state.editingCommentId = state.editingCommentId === commentId ? null : commentId;
  state.replyingCommentId = null;
  render();
}

function updateOwnComment(commentId, text) {
  const content = String(text || "").trim();
  if (!content) return;

  const comment = findCommentById(commentId);
  if (!comment || !canDeleteComment(comment)) return;

  if (comment.text !== content) {
    comment.text = content;
    comment.edited = true;
  }

  state.editingCommentId = null;
  showNotice("댓글을 수정했습니다.");
}

function deleteOwnComment(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    const comment = findCommentInList(comments, commentId);
    if (!comment || !canDeleteComment(comment)) continue;

    openConfirmAction({
      type: "delete-comment",
      targetId: commentId,
      title: "댓글 삭제",
      message: "이 댓글을 삭제할까요?",
      confirmLabel: "삭제",
      danger: true,
    });
    return;
  }
}

function canDeleteComment(comment) {
  if (!comment) return false;
  const owner = comment.owner || comment.author;
  return owner === "나" || owner === state.currentUser || comment.author === state.currentUser;
}

function openConfirmAction(action) {
  state.confirmAction = action;
  render();
}

function runConfirmedAction() {
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

  if (action.type === "logout") {
    state.isLoggedIn = false;
    state.currentUser = null;
    showNotice("로그아웃했습니다.");
  }

  if (action.type === "withdraw") {
    state.isLoggedIn = false;
    state.currentUser = null;
    state.authView = null;
    showNotice("회원탈퇴 데모가 완료되었습니다.");
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

function createMakeFolder(folderName) {
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
  showNotice("폴더를 추가했습니다.");
  render();
}

function renameMakeFolder(folderId, name) {
  const folder = state.makeFolders.find((item) => item.id === folderId);
  const cleanName = String(name || "").trim();
  if (!folder || !cleanName) return;

  folder.name = cleanName;
  state.editingFolderId = null;
  showNotice("폴더 이름을 수정했습니다.");
  render();
}

function performDeleteFolder(folderId) {
  if (!folderId || folderId === "uncategorized") return;
  state.makeFolders = state.makeFolders.filter((folder) => folder.id !== folderId);
  state.recentThreads.forEach((thread) => {
    if (thread.folderId === folderId) thread.folderId = "uncategorized";
  });
  if (state.activeFolderId === folderId) state.activeFolderId = "all";
  showNotice("폴더를 삭제했습니다.");
}

function moveThreadToFolder(threadId, folderId) {
  const thread = state.recentThreads.find((item) => item.id === threadId);
  if (!thread) return;
  thread.folderId = folderId || "uncategorized";
  showNotice("대화 폴더를 변경했습니다.");
  render();
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
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  const finalPrompt = getFinalPromptText(message);

  const savedIndex = savedPrompts.findIndex((item) => item.id === messageId);
  if (savedIndex >= 0) {
    savedPrompts.splice(savedIndex, 1);
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
    source: "mine",
    isShared: false,
    savedByMe: true,
    sourcePrompt: message.sourcePrompt || finalPrompt,
    messages: state.messages.map((item) => ({ ...item })),
  });

  state.savedPage = 1;
  showNotice("저장한 프롬프트에 추가했습니다.");
  render();
}

function resendEditedMessage(messageId, value) {
  const cleanValue = String(value || "").trim();
  const index = state.messages.findIndex((message) => message.id === messageId && message.role === "user");
  if (index < 0 || !cleanValue) return;

  const now = Date.now();
  state.messages = state.messages.slice(0, index + 1);
  state.messages[index] = { ...state.messages[index], content: cleanValue, editedAt: now };
  state.messages.push({
    id: `make-${now}`,
    role: "assistant",
    content: polishPrompt(cleanValue),
    sourcePrompt: cleanValue,
  });
  state.editingMessageId = null;
  updateRecentThread(state.activeThreadId || `thread-${now}`);
  showNotice("수정한 메시지로 다시 전송했습니다.");
  render();
}

function openShareFromMakeMessage(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;

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
  const dedupeKey = getRecentThreadKey(firstUser?.content || lastUser?.content || "");
  const thread = {
    id: threadId,
    dedupeKey,
    title: makePromptTitle(lastUser?.content || "새 대화"),
    preview: makePreview(lastAssistant?.content || lastUser?.content || ""),
    createdAt: existingThread?.createdAt || Date.now(),
    folderId: existingThread?.folderId || (state.activeFolderId !== "all" ? state.activeFolderId : "uncategorized"),
    messages: state.messages.map((item) => ({ ...item })),
  };

  state.recentThreads = [thread, ...state.recentThreads.filter((item) => item.id !== threadId && getRecentThreadKeyFromThread(item) !== dedupeKey)].slice(0, 8);
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
  if (thread.dedupeKey) return thread.dedupeKey;
  const firstUser = thread.messages?.find((message) => message.role === "user");
  return getRecentThreadKey(firstUser?.content || thread.title || "");
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

function autosizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

function deleteOwnPrompt(promptId) {
  const prompt = findPromptById(promptId);
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

function publishSavedPrompt(promptId) {
  const prompt = savedPrompts.find((item) => item.id === promptId);
  if (!prompt || prompt.source !== "mine") return;

  if (!state.isLoggedIn) {
    state.authView = "login";
    render();
    return;
  }

  prompt.isShared = true;
  prompt.source = "mine";
  prompt.author = state.currentUser || prompt.author || "나";
  prompt.createdAt = prompt.createdAt || Date.now();

  const popularIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
  if (popularIndex >= 0) {
    popularPrompts[popularIndex] = { ...popularPrompts[popularIndex], ...prompt, isShared: true, source: "mine" };
  } else {
    popularPrompts.unshift({ ...prompt, isShared: true, source: "mine" });
  }

  state.popularSort = "latest";
  state.popularPage = 1;
  showNotice("프롬프트를 공유됨 상태로 전환했습니다.");
  render();
}

function updateOwnPrompt(promptId, formData) {
  const prompt = findPromptById(promptId);
  if (!prompt || prompt.source !== "mine") return;

  const title = String(formData.get("title") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const tags = parseSharedTags(String(formData.get("tags") || ""));

  if (!title || !text || tags.length === 0) {
    window.alert("제목, 프롬프트, 해시태그를 모두 입력해주세요.");
    return;
  }

  [popularPrompts, savedPrompts].forEach((list) => {
    const item = list.find((entry) => entry.id === promptId);
    if (!item) return;
    item.title = title;
    item.text = text;
    item.tags = tags;
    item.updatedAt = Date.now();
  });

  state.editingPromptId = null;
  showNotice("프롬프트를 수정했습니다.");
  render();
}

function performDeletePrompt(promptId) {
  removePromptById(popularPrompts, promptId);
  removePromptById(savedPrompts, promptId);
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
  const nextInput = document.querySelector("[data-tag-search]");
  if (!nextInput) return;

  nextInput.focus();
  nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
}

function getSavedPagePrompts() {
  const merged = [...savedPrompts];
  const seen = new Set(merged.map((prompt) => prompt.id));

  popularPrompts.forEach((prompt) => {
    if (!state.likedPromptIds.has(prompt.id) || seen.has(prompt.id)) return;
    merged.push({ ...prompt, source: prompt.source === "mine" ? "mine" : "community" });
    seen.add(prompt.id);
  });

  return merged;
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
  const byViews = (a, b) => Number(b.views || 0) - Number(a.views || 0);

  if (state.savedSort === "saves") return (a, b) => bySaves(a, b) || byRecent(a, b) || byViews(a, b);
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
  render();
  restoreSearchFocus();
}

function searchByTag(tag) {
  const cleanTag = String(tag || "").replace(/^#+/, "").trim();
  if (!cleanTag) return;

  window.clearTimeout(searchCommitTimer);
  state.searchQuery = cleanTag;
  state.popularPage = 1;
  state.detailPromptId = null;
  state.route = "home";
  render();
  restoreSearchFocus();
}

function findPromptById(promptId) {
  return savedPrompts.find((item) => item.id === promptId) || popularPrompts.find((item) => item.id === promptId);
}

function sharePrompt(formData) {
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
    author: "나",
    source: "mine",
    isShared: true,
    savedByMe: Boolean(existingPrompt?.savedByMe),
    createdAt: existingPrompt?.createdAt || Date.now(),
  };

  const existingSavedPrompt = savedPrompts.find((item) => item.id === prompt.id);
  if (existingSavedPrompt) {
    delete existingSavedPrompt.messages;
  }

  upsertPrompt(popularPrompts, prompt);
  upsertPrompt(savedPrompts, prompt);
  if (!commentsByPrompt[prompt.id]) {
    commentsByPrompt[prompt.id] = [];
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
  const tokens = parseTagQuery(state.searchQuery);
  const prompts = getUniquePrompts(popularPrompts);

  if (tokens.length === 0) {
    return sortPopularPrompts(prompts);
  }

  return sortPopularPrompts(
    prompts.filter((prompt) => {
      const tags = prompt.tags.map(normalizeTag);
      return tokens.every((token) => tags.some((tag) => tag.includes(token)));
    }),
  );
}

function getPopularTags(prompts) {
  const counts = new Map();
  const labels = new Map();

  prompts.forEach((prompt) => {
    (prompt.tags || []).forEach((tag) => {
      const label = String(tag || "").replace(/^#+/, "").trim();
      if (!label) return;
      const key = normalizeTag(label);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!labels.has(key)) labels.set(key, label);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || labels.get(a[0]).localeCompare(labels.get(b[0]), "ko-KR"))
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

function getMyPrompts() {
  return getUniquePrompts(savedPrompts.filter((prompt) => prompt.source === "mine"));
}

function getMyComments() {
  const owner = state.currentUser || "나";
  const items = [];

  Object.entries(commentsByPrompt).forEach(([promptId, comments]) => {
    collectOwnedComments(items, promptId, comments, owner);
  });

  return items;
}

function collectOwnedComments(items, promptId, comments, owner) {
  (comments || []).forEach((comment) => {
    if (comment.owner === owner || comment.author === owner || comment.owner === "나" || comment.author === "나") {
      items.push({ promptId, prompt: findPromptById(promptId), comment });
    }
    collectOwnedComments(items, promptId, comment.replies || [], owner);
  });
}

function getMyReports() {
  const promptReports = [...state.reportedPromptIds].map((promptId) => {
    const prompt = findPromptById(promptId);
    const record = getReportRecord(`prompt:${promptId}`);
    return {
      type: "prompt",
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
      id: commentId,
      label: comment?.text || "삭제된 댓글",
      status: record.status,
    };
  });

  return [...promptReports, ...commentReports];
}

function getReportRecord(key) {
  return state.reportRecords[key] || { status: "pending" };
}

function getAdminReportRecords() {
  const records = [];
  [...state.reportedPromptIds].forEach((promptId) => {
    const prompt = findPromptById(promptId);
    const key = `prompt:${promptId}`;
    const record = getReportRecord(key);
    records.push({
      key,
      type: "prompt",
      promptId,
      status: record.status || "pending",
      title: prompt?.title || "삭제된 프롬프트",
      summary: record.reason || makePreview(prompt?.text || ""),
    });
  });
  [...state.reportedCommentIds].forEach((commentId) => {
    const comment = findCommentById(commentId);
    const key = `comment:${commentId}`;
    const record = getReportRecord(key);
    records.push({
      key,
      type: "comment",
      promptId: findPromptIdByCommentId(commentId),
      status: record.status || "pending",
      title: "댓글 신고",
      summary: record.reason || comment?.text || "삭제된 댓글",
    });
  });
  return records.sort((a, b) => Number(getReportRecord(b.key).createdAt || 0) - Number(getReportRecord(a.key).createdAt || 0));
}

function getReportStatusLabel(status) {
  if (status === "dismissed") return "기각";
  if (status === "resolved") return "처리 완료";
  return "접수";
}

function updateReportRecordStatus(key, status) {
  if (!key || !["pending", "dismissed", "resolved"].includes(status)) return;
  state.reportRecords[key] = { ...getReportRecord(key), status, updatedAt: Date.now() };
  showNotice(`신고 상태를 ${getReportStatusLabel(status)}로 변경했습니다.`);
}

function findPromptIdByCommentId(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    if (findCommentInList(comments, commentId)) return promptId;
  }
  return "";
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
    if (state.hideReportedPrompts && state.reportedPromptIds.has(prompt.id)) return false;
    return true;
  });
}

function toggleAdminPromptHidden(promptId) {
  if (!promptId) return;
  if (state.adminHiddenPromptIds.has(promptId)) {
    state.adminHiddenPromptIds.delete(promptId);
    showNotice("관리자 숨김을 해제했습니다.");
  } else {
    state.adminHiddenPromptIds.add(promptId);
    showNotice("관리자 숨김 처리했습니다.");
  }
}

function getPopularTotalPages(count) {
  return Math.max(1, Math.ceil(count / 16));
}

function parseTagQuery(query) {
  return query
    .split(/[,\s]+/)
    .map(normalizeTag)
    .filter(Boolean);
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
          likedPromptIds: [...state.likedPromptIds],
          likedCommentIds: [...state.likedCommentIds],
          reportedPromptIds: [...state.reportedPromptIds],
          reportedCommentIds: [...state.reportedCommentIds],
          hideReportedPrompts: state.hideReportedPrompts,
          adminMode: state.adminMode,
          adminHiddenPromptIds: [...state.adminHiddenPromptIds],
          adminTagDecisions: state.adminTagDecisions,
          reportRecords: state.reportRecords,
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
    state.isLoggedIn = Boolean(savedState.isLoggedIn);
    state.currentUser = savedState.currentUser || null;
    state.likedPromptIds = new Set(Array.isArray(savedState.likedPromptIds) ? savedState.likedPromptIds : []);
    state.likedCommentIds = new Set(Array.isArray(savedState.likedCommentIds) ? savedState.likedCommentIds : []);
    state.reportedPromptIds = new Set(Array.isArray(savedState.reportedPromptIds) ? savedState.reportedPromptIds : []);
    state.reportedCommentIds = new Set(Array.isArray(savedState.reportedCommentIds) ? savedState.reportedCommentIds : []);
    state.hideReportedPrompts = Boolean(savedState.hideReportedPrompts);
    state.adminMode = Boolean(savedState.adminMode);
    state.adminHiddenPromptIds = new Set(Array.isArray(savedState.adminHiddenPromptIds) ? savedState.adminHiddenPromptIds : []);
    state.adminTagDecisions = savedState.adminTagDecisions && typeof savedState.adminTagDecisions === "object" ? savedState.adminTagDecisions : {};
    state.reportRecords = savedState.reportRecords && typeof savedState.reportRecords === "object" ? savedState.reportRecords : {};
    state.popularSort = ["popular", "saves", "comments", "likes", "latest"].includes(savedState.popularSort)
      ? savedState.popularSort
      : "popular";
    state.savedSort = ["recent", "saves", "likes", "views"].includes(savedState.savedSort) ? savedState.savedSort : "recent";
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

  state.recentThreads = state.recentThreads.filter((thread) => {
    const key = getRecentThreadKeyFromThread(thread);
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

loadPersistedState();
normalizeDemoCopy();
normalizeAssistantPromptOutputs();
normalizeRecentThreads();
ensureDemoComments();
render();

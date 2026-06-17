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
  executeMessageId: null,
  confirmAction: null,
  hideReportedPrompts: false,
  isLoggedIn: false,
  currentUser: null,
  isComposingSearch: false,
  searchTipShown: false,
  searchTipVisible: false,
  searchQuery: "",
  popularSort: "popular",
  popularPage: 1,
  savedPage: 1,
  shareError: "",
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
  savedFilter: { community: true, mine: true },
  messages: [],
  recentThreads: [],
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
  eye: `<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="m3 3 18 18"/><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"/><path d="M9.9 4.3A9.8 9.8 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-2.3 3.4"/><path d="M6.1 6.1C3.5 7.9 2 12 2 12s3.5 8 10 8a9.6 9.6 0 0 0 5.9-2.1"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 1 1 21 12z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  flag: `<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-1 5 1 5H5"/></svg>`,
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
      ${state.authView ? AuthModal() : ""}
      ${state.reportPromptId || state.reportCommentId ? ReportModal() : ""}
      ${state.executeMessageId ? ExecuteModal() : ""}
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
  } else if (state.reportPromptId) {
    state.reportPromptId = null;
  } else if (state.reportCommentId) {
    state.reportCommentId = null;
  } else if (state.authView) {
    state.authView = null;
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
      </nav>
    </aside>
  `;
}

function Header() {
  const remaining = Math.max(0, FREE_MAKE_LIMIT - state.guestImproveCount);
  const hasReportedPrompts = state.reportedPromptIds.size > 0;
  const showPromptTools = state.route === "home" || state.route === "saved";
  const authButton = state.isLoggedIn
    ? `<button class="login-button logged-in" type="button" data-logout>${escapeHtml(state.currentUser || "사용자")}님 · 로그아웃</button>`
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
          <span>!</span>
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
}

function isPromptSaved(promptId) {
  const prompt = savedPrompts.find((item) => item.id === promptId);
  return Boolean(prompt?.savedByMe) && !state.pendingUnsaveIds.has(promptId);
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
  const opensMakeThread = Boolean(prompt.messages?.length);
  const isMine = prompt.source === "mine";
  const isLiked = state.likedPromptIds.has(prompt.id);
  const isReported = state.reportedPromptIds.has(prompt.id);
  const isShared = prompt.isShared === true || prompt.source === "community";
  const commentCount = getPromptCommentCount(prompt);
  const showStatus = options.showStatus !== false;
  const statusBadges = [
    isMine
      ? `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`
      : "",
    isPendingUnsave ? `<span class="status-badge pending-unsave">저장 취소 예정</span>` : "",
  ].join("");

  return `
    <article class="prompt-card ${isMine ? "mine-card" : ""} ${isReported ? "reported-card" : ""} ${isPendingUnsave ? "pending-unsave-card" : ""}" data-open-prompt="${prompt.id}" ${opensMakeThread ? `data-open-make-prompt="${prompt.id}"` : ""} tabindex="0" role="button" aria-label="${prompt.title} 전체 보기">
      <div class="card-head">
        <h2>${prompt.title}</h2>
        <div class="card-actions">
          ${isMine && !isShared ? `<button class="icon-button share-card-button" data-share-saved="${prompt.id}" aria-label="공유">${icons.share}</button>` : ""}
          ${isMine && isShared ? `<button class="icon-button unshare-card-button" data-unshare-prompt="${prompt.id}" aria-label="공유 취소">${icons.share}</button>` : ""}
          ${canDelete ? `<button class="icon-button delete-card-button" data-delete-prompt="${prompt.id}" aria-label="삭제">${icons.trash}</button>` : ""}
          <button class="icon-button metric-action like-card-button ${isLiked ? "liked" : ""}" data-like-prompt="${prompt.id}" aria-label="좋아요">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
          <button class="icon-button metric-action comment-card-button" data-open-comments="${prompt.id}" aria-label="댓글 보기">${icons.comment}<span>${formatNumber(commentCount)}</span></button>
          <button class="icon-button metric-action save-card-button ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : "저장"}">${icons.bookmark}<span>${formatNumber(prompt.saves)}</span></button>
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
        <p class="prompt-detail-text">${prompt.text}</p>
        <div class="tag-row detail-tags">${prompt.tags.map((tag) => `<button type="button" data-search-tag="${escapeHtml(tag)}">#${tag}</button>`).join("")}</div>
        <footer class="card-meta detail-meta">
          <span>${icons.eye}${formatNumber(prompt.views)}</span>
          <span>${prompt.author}</span>
        </footer>
        <section class="comments-panel" aria-label="댓글">
          <div class="comments-head">
            <h3>댓글</h3>
            <span>${formatNumber(commentCount)}개</span>
          </div>
          <div class="comment-list">
            ${
              visibleComments.length
                ? visibleComments.map(CommentItem).join("")
                : `<p class="comment-empty">아직 표시할 댓글이 없습니다.</p>`
            }
          </div>
          ${
            comments.length > 3
              ? `<button class="comment-more-button" type="button" data-toggle-comments="${prompt.id}">
                  ${isCommentsExpanded ? "댓글 접기" : `전체 댓글 보기 (${formatNumber(comments.length)}개)`}
                </button>`
              : ""
          }
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
          }
        </section>
        <div class="modal-actions detail-actions">
          <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
          <button class="detail-action-button like-action ${isLiked ? "liked" : ""}" type="button" data-like-prompt="${prompt.id}" aria-label="${isLiked ? "좋아요 취소" : "좋아요"}">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
          <button class="detail-action-button save-action ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" type="button" data-save-prompt="${prompt.id}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : isSaved ? "저장 취소" : "저장"}">${icons.bookmark}<span>${formatNumber(prompt.saves)}</span></button>
          ${canDelete && !isShared ? `<button class="secondary-button" type="button" data-share-saved="${prompt.id}">공유하기</button>` : ""}
          ${canDelete && isShared ? `<button class="secondary-button" type="button" data-unshare-prompt="${prompt.id}">공유 취소</button>` : ""}
          ${canDelete ? `<button class="secondary-button danger-button" type="button" data-delete-prompt="${prompt.id}">삭제</button>` : ""}
          <button class="detail-action-button report-action report-state-button ${isReported ? "reported" : ""}" type="button" data-report-prompt="${prompt.id}" aria-label="${isReported ? "신고됨" : "신고"}">${icons.flag}</button>
        </div>
      </article>
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
  if (!message) return "";

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
  return `
    <aside class="make-side-panel" aria-label="Make 최근 대화">
      <div class="make-side-head">
        <strong>최근 대화</strong>
        <button type="button" data-new-chat>새 대화</button>
      </div>
      ${
        state.recentThreads.length
          ? `<div class="recent-thread-list">
              ${state.recentThreads.map((thread) => `
                <button class="recent-thread ${state.activeThreadId === thread.id ? "active" : ""}" type="button" data-open-thread="${thread.id}">
                  <strong>${thread.title}</strong>
                  <span>${thread.preview}</span>
                </button>
              `).join("")}
            </div>`
          : `<p class="recent-empty">아직 저장된 대화가 없습니다.</p>`
      }
    </aside>
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
          <button type="button" data-execute-message="${message.id}">${icons.play}<span>Execute</span></button>
        </footer>
      </div>
    `;
  }

  return `
    <div class="message-group user-group">
      <article class="message ${message.role}">
        <p>${message.content}</p>
      </article>
    </div>
  `;
}

function SavedPage() {
  const filtered = applyReportedVisibility(savedPrompts).filter(
    (prompt) => (prompt.source === "community" && state.savedFilter.community) || (prompt.source === "mine" && state.savedFilter.mine),
  ).sort((a, b) => b.saves - a.saves || b.views - a.views || b.comments - a.comments);
  const pendingUnsaveCount = filtered.filter((prompt) => state.pendingUnsaveIds.has(prompt.id)).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / SAVED_PAGE_SIZE));
  if (state.savedPage > totalPages) state.savedPage = totalPages;
  const currentPage = state.savedPage;
  const pagePrompts = filtered.slice((currentPage - 1) * SAVED_PAGE_SIZE, currentPage * SAVED_PAGE_SIZE);

  return `
    <section class="saved-page" aria-labelledby="saved-heading">
      <div class="page-head">
        <div class="page-title">
          <span>${icons.bookmark}</span>
          <h1 id="saved-heading">저장한 프롬프트</h1>
        </div>
        <div class="filter-row" role="group" aria-label="저장 목록 필터">
          <label><input type="checkbox" data-filter="community" ${state.savedFilter.community ? "checked" : ""} /> 다른 사용자 프롬프트</label>
          <label><input type="checkbox" data-filter="mine" ${state.savedFilter.mine ? "checked" : ""} /> 내 프롬프트</label>
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
              <span>${icons.bookmark}</span>
              <p>로그인하여 프롬프트를 저장해보세요.</p>
            </div>`
      }
    </section>
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

  return `
    <section class="share-page" aria-labelledby="share-title">
      <div class="share-shell">
        <div class="page-title share-title">
          <span>${icons.share}</span>
          <h1 id="share-title">프롬프트 공유하기</h1>
        </div>
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
          <span>해시태그 (쉼표로 구분)</span>
          <input name="tags" type="text" value="${escapeHtml(draftTags)}" placeholder="예: 마케팅, SEO, 콘텐츠" />
          </label>
          <div class="share-helper">
            <span>${state.shareError || "공유된 프롬프트는 홈의 인기 프롬프트와 검색 결과에 노출됩니다."}</span>
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
  const title = isFindId ? "아이디 찾기" : isFindPassword ? "비밀번호 찾기" : isSignup ? "회원가입" : "로그인";

  if (isFindId || isFindPassword) {
    return `
      <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="modal auth-modal" data-auth-form>
          <div class="modal-head">
            <h2 id="auth-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
          </div>
          <p class="auth-helper">${isFindId ? "가입할 때 입력한 이름과 전화번호를 입력해주세요." : "아이디와 가입할 때 입력한 전화번호를 입력해주세요."}</p>
          ${
            isFindId
              ? `<input name="name" placeholder="이름" autocomplete="name" />`
              : `<input name="userId" placeholder="아이디" autocomplete="username" />`
          }
          <input name="phone" placeholder="전화번호" autocomplete="tel" />
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
        ${isSignup ? `<input name="name" placeholder="이름" /><input name="birth" type="date" /><input name="phone" placeholder="전화번호" />` : ""}
        <input name="userId" placeholder="아이디" autocomplete="username" />
        <label class="password-field">
          <input name="password" type="password" placeholder="비밀번호" autocomplete="${isSignup ? "new-password" : "current-password"}" />
          <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
        </label>
        ${
          isSignup
            ? `<label class="password-field">
                <input name="passwordConfirm" type="password" placeholder="비밀번호 확인" autocomplete="new-password" />
                <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
              </label>`
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
        ${isSignup ? `<button class="text-button" type="button" data-open-auth="login">이미 계정이 있어요</button>` : ""}
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
      state.isLoggedIn = false;
      state.currentUser = null;
      showNotice("로그아웃했습니다.");
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

  document.querySelectorAll("[data-close-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authView = null;
      render();
    });
  });

  document.querySelectorAll("[data-close-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailPromptId = null;
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
      if (card.dataset.openMakePrompt) {
        openSavedMakePrompt(card.dataset.openMakePrompt);
        return;
      }
      openPromptDetail(card.dataset.openPrompt);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (card.dataset.openMakePrompt) {
        openSavedMakePrompt(card.dataset.openMakePrompt);
        return;
      }
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
      openShareFromSaved(button.dataset.shareSaved);
    });
  });

  document.querySelectorAll("[data-unshare-prompt]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      unshareOwnPrompt(button.dataset.unsharePrompt);
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

  document.querySelectorAll("[data-save-message]").forEach((button) => {
    button.addEventListener("click", () => {
      saveMakeMessage(button.dataset.saveMessage);
    });
  });

  document.querySelectorAll("[data-execute-message]").forEach((button) => {
    button.addEventListener("click", () => {
      openExecuteModal(button.dataset.executeMessage);
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

  document.querySelectorAll("[data-open-thread]").forEach((button) => {
    button.addEventListener("click", () => {
      openRecentThread(button.dataset.openThread);
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
      const userId = String(formData.get("userId") || "").trim();
      const password = String(formData.get("password") || "").trim();

      if (isFindId) {
        const name = String(formData.get("name") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        if (!name || !phone) {
          window.alert("이름과 전화번호를 모두 입력해주세요.");
          return;
        }
        if (!isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        state.authView = "login";
        showNotice("입력한 정보로 아이디 찾기 요청을 보냈습니다.");
        return;
      }

      if (isFindPassword) {
        const phone = String(formData.get("phone") || "").trim();
        if (!userId || !phone) {
          window.alert("아이디와 전화번호를 모두 입력해주세요.");
          return;
        }
        if (!isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        state.authView = "login";
        showNotice("비밀번호 재설정 요청을 보냈습니다.");
        return;
      }

      if (isSignup) {
        const requiredFields = [
          ["name", "이름"],
          ["birth", "생일"],
          ["phone", "전화번호"],
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

        const phone = String(formData.get("phone") || "").trim();
        const birth = String(formData.get("birth") || "").trim();
        if (!isValidPhone(phone)) {
          window.alert("전화번호 형식을 확인해주세요.");
          return;
        }
        if (isFutureDate(birth)) {
          window.alert("생일은 오늘 이후 날짜로 입력할 수 없습니다.");
          return;
        }
        if (password.length < 8) {
          window.alert("비밀번호는 8자 이상 입력해주세요.");
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
      state.currentUser = String(formData.get("name") || userId || "사용자").trim() || "사용자";
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

    shareForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sharePrompt(new FormData(shareForm));
    });
  }

  const reportForm = document.querySelector("[data-report-form]");
  if (reportForm) {
    reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitReport(reportForm.dataset.reportType, reportForm.dataset.reportForm, new FormData(reportForm).get("reason"));
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

function openExecuteModal(messageId) {
  if (!state.messages.some((item) => item.id === messageId)) return;
  state.executeMessageId = messageId;
  render();
}

async function executeMakeMessage(messageId, targetId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  const target = getExecuteTarget(targetId);
  if (!target) return;
  const finalPrompt = getFinalPromptText(message);
  window.open(target.url, "_blank", "noopener,noreferrer");

  try {
    await navigator.clipboard.writeText(finalPrompt);
  } catch (_error) {
    fallbackCopyText(finalPrompt);
  }

  state.executeMessageId = null;
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
  const dedupeKey = getRecentThreadKey(firstUser?.content || lastUser?.content || "");
  const thread = {
    id: threadId,
    dedupeKey,
    title: makePromptTitle(lastUser?.content || "새 대화"),
    preview: makePreview(lastAssistant?.content || lastUser?.content || ""),
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
  if (!prompt || prompt.source !== "mine") return;

  openConfirmAction({
    type: "unshare-prompt",
    targetId: promptId,
    title: "공유 취소",
    message: "공유를 취소하면 Home과 검색 결과에서 이 프롬프트가 사라집니다. 계속할까요?",
    confirmLabel: "공유 취소",
    danger: false,
  });
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
  const filteredCount = savedPrompts.filter(
    (prompt) => (prompt.source === "community" && state.savedFilter.community) || (prompt.source === "mine" && state.savedFilter.mine),
  ).length;
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

  upsertPrompt(popularPrompts, prompt);
  upsertPrompt(savedPrompts, prompt);
  if (!commentsByPrompt[prompt.id]) {
    commentsByPrompt[prompt.id] = [];
  }
  state.searchQuery = "";
  state.popularPage = 1;
  state.shareError = "";
  state.shareDraft = null;
  state.route = "home";
  showNotice("프롬프트를 공유했습니다.");
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
  return prompt.likes ?? Math.round((prompt.saves || 0) / 3);
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
  if (!state.hideReportedPrompts) return prompts;
  return prompts.filter((prompt) => !state.reportedPromptIds.has(prompt.id));
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
          popularSort: state.popularSort,
          guestImproveCount: state.guestImproveCount,
          recentThreads: state.recentThreads,
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
    state.popularSort = ["popular", "saves", "comments", "likes", "latest"].includes(savedState.popularSort)
      ? savedState.popularSort
      : "popular";
    state.guestImproveCount = Number(savedState.guestImproveCount || 0);
    state.recentThreads = Array.isArray(savedState.recentThreads) ? savedState.recentThreads : [];
    state.activeThreadId = savedState.activeThreadId || null;
    state.messages = Array.isArray(savedState.messages) ? savedState.messages : [];
    state.composerDraft = savedState.composerDraft || "";
    state.templateCollapsed = Boolean(savedState.templateCollapsed);
    normalizePersistedLikeCounts();
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
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

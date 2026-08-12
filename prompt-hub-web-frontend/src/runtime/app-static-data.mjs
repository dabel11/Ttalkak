// @ts-check
/** @param {{ demo?: { fallbackPopularTags?: string[] } | null, demoFallbackEnabled?: boolean }} [options] */
export function createAppStaticData({ demo = null, demoFallbackEnabled = false } = {}) {
  const DEMO_FALLBACK_ENABLED = Boolean(demoFallbackEnabled);
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
  const fallbackPopularTags = demo?.fallbackPopularTags || ["SEO", "마케팅", "코딩", "이메일", "블로그", "콘텐츠", "첨삭", "기획"];
  // Full demo copy is loaded from demo-data.mjs only when demo fallback is enabled.
  const demoPromptTextOverrides = {};
  const demoCommentTextOverrides = {};
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
  return Object.freeze({ DEMO_FALLBACK_ENABLED, popularPrompts, savedPrompts, DEMO_LIBRARY_PROMPT_IDS, fallbackPopularTags, demoPromptTextOverrides, demoCommentTextOverrides, promptTemplates, FREE_MAKE_LIMIT, WITHDRAWN_AUTHOR_LABEL, PROTECTED_BACKEND_ACTIONS, SAVED_PAGE_SIZE, HOME_PAGE_SIZE, SEARCH_DEBOUNCE_MS, MAX_CUSTOM_MAKE_FOLDERS, DEMO_EXISTING_NICKNAMES, DEMO_EXISTING_USER_IDS, commentsByPrompt, demoCommentBackfill });
}

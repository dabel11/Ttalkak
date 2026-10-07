import { getDefaultBackendApiUrl } from "./config/backendConfig.js";

export const STORAGE = {
  SAVED: "pp_saved_prompts",
  RECENTS: "pp_recent_threads",
  CONFIG: "pp_backend_config",
  LEGACY_CONFIG: "pp_rag_config",
  AUTH: "pp_auth_session",
  SESSION_UUID: "pp_session_uuid",
};

export const DEFAULT_RAG_CONFIG = {
  backendApiUrl: getDefaultBackendApiUrl(),
};

export const API_TIMEOUT_MS = 60000;
export const IMPROVE_API_TIMEOUT_MS = 90000;

export const PRIVACY_POLICY_URL =
  "https://docs.google.com/document/d/e/2PACX-1vQtMHg_T33kpcCY1-5RApEsv3Wvg0KEnF_v5zfqBjnQMvwoLqBt2vRAhby39YGx2-2eIqlCrBhucIyK/pub";

export const TERMS_URL = PRIVACY_POLICY_URL;

export const EXAMPLE_QUERIES = [
  "역할과 목표가 분명한 프롬프트로 바꿔줘",
  "결과 형식과 제약 조건을 포함해서 개선해줘",
  "문제 상황과 기대 결과가 잘 드러나게 정리해줘",
  "마케팅 캠페인 기획 프롬프트로 다듬어줘",
];

export const PROMPT_LIBRARY = [
  {
    id: "library-marketing-campaign",
    title: "마케팅 캠페인 전략",
    preview: "제품과 고객 정보를 바탕으로 채널별 전략과 실행 단계를 구성합니다.",
    content:
      "당신은 전문 마케팅 전략가입니다. 제품 가치, 목표 고객, 예산과 일정을 바탕으로 채널별 캠페인 전략과 실행 일정을 제안하세요.",
    tags: ["마케팅", "캠페인", "전략"],
  },
  {
    id: "library-blog-seo",
    title: "SEO 블로그 작성",
    preview: "검색 의도와 제목, 글 구조, 행동 유도 방향을 제안합니다.",
    content:
      "당신은 SEO 콘텐츠 편집자입니다. 핵심 키워드를 바탕으로 검색 의도, 제목 후보, 소제목 구조, 본문 방향과 행동 유도 문구를 제안하세요.",
    tags: ["SEO", "블로그", "글쓰기"],
  },
  {
    id: "library-email",
    title: "비즈니스 이메일 초안",
    preview: "수신자와 목적에 맞는 간결하고 정중한 이메일을 작성합니다.",
    content:
      "당신은 비즈니스 커뮤니케이션 전문가입니다. 이메일 목적, 수신자와 원하는 결과를 바탕으로 간결하고 정중한 비즈니스 이메일 초안을 작성하세요.",
    tags: ["이메일", "비즈니스", "커뮤니케이션"],
  },
  {
    id: "library-code-question",
    title: "코딩 질문 구성",
    preview: "상황과 오류, 시도한 방법을 포함해 답변하기 쉬운 질문으로 정리합니다.",
    content:
      "당신은 개발 멘토입니다. 문제 상황, 기대 결과, 실제 결과, 오류 메시지와 시도한 방법을 답변하기 쉬운 명확한 질문으로 정리하세요.",
    tags: ["코딩", "질문", "디버깅"],
  },
  {
    id: "library-summary",
    title: "긴 글 요약",
    preview: "핵심 주장과 근거, 놓치기 쉬운 내용과 다음 행동으로 요약합니다.",
    content:
      "당신은 전문 요약가입니다. 입력한 글을 핵심 주장, 주요 근거, 놓치기 쉬운 내용과 다음 행동으로 나누어 요약하세요.",
    tags: ["요약", "분석", "정리"],
  },
];

export const TIPS = [
  { icon: "1", title: "명확한 목표 설정", description: "원하는 결과와 사용 맥락을 분명하게 설명하세요." },
  { icon: "2", title: "필요한 맥락 추가", description: "대상, 말투, 제약 조건과 판단 기준을 포함하세요." },
  { icon: "3", title: "결과 형식 지정", description: "글머리표, 표, 단계 등 구체적인 형식을 요청하세요." },
];

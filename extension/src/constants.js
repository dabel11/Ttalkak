export const STORAGE = {
  SAVED: "pp_saved_prompts",
  RECENTS: "pp_recent_threads",
  CONFIG: "pp_backend_config",
  LEGACY_CONFIG: "pp_rag_config",
  AUTH: "pp_auth_session",
  SESSION_UUID: "pp_session_uuid",
};

export const DEFAULT_RAG_CONFIG = {
  backendApiUrl: "http://localhost:8080",
  collectionName: "prompt_techniques",
  topK: 5,
  model: "gemini-2.0-flash",
};

export const API_TIMEOUT_MS = 15000;

export const MODE_META = {
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
      "논문 기반으로 메타 프롬프트 작성법을 알려줘",
    ],
  },
};

export const PROMPT_LIBRARY = [
  {
    id: "library-marketing-campaign",
    title: "Marketing Campaign Strategy",
    preview: "Plan campaign channels and execution steps from product and audience details.",
    content:
      "You are a professional marketing strategist. Based on the product value, target audience, budget, and timeline, propose channel-specific campaign strategies and an execution schedule.",
    tags: ["marketing", "campaign", "strategy"],
  },
  {
    id: "library-blog-seo",
    title: "SEO Blog Writing",
    preview: "Suggest keyword intent, title options, structure, and CTA direction.",
    content:
      "You are an SEO content editor. Based on the primary keyword, suggest search intent, title options, heading structure, body direction, and CTA.",
    tags: ["SEO", "blog", "writing"],
  },
  {
    id: "library-email",
    title: "Business Email Draft",
    preview: "Write a concise and polite email for the recipient and purpose.",
    content:
      "You are a business communication expert. Based on the email purpose, recipient, and desired outcome, draft a concise and polite business email.",
    tags: ["email", "business", "communication"],
  },
  {
    id: "library-code-question",
    title: "Coding Question Builder",
    preview: "Structure a coding question with context, error, and attempted solutions.",
    content:
      "You are a development mentor. Organize the problem, expected result, actual result, error message, and attempted solutions into a clear question that is easy to answer.",
    tags: ["coding", "question", "debugging"],
  },
  {
    id: "library-summary",
    title: "Long Text Summary",
    preview: "Summarize long text by claims, evidence, key points, and next actions.",
    content:
      "You are a professional summarizer. Summarize the text into core claims, key evidence, easily missed points, and next actions.",
    tags: ["summary", "analysis", "organizing"],
  },
];

export const TIPS = [
  { icon: "1", title: "Set A Clear Goal", description: "Describe the desired output and usage context clearly." },
  { icon: "2", title: "Add Context", description: "Include audience, tone, constraints, and output criteria." },
  { icon: "3", title: "Specify Format", description: "Ask for bullets, tables, steps, or another concrete format." },
];

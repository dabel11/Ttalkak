(function attachMakeMessageModel(global) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const normalizeText = (value) => String(value || "").trim();
  const normalizeKey = (value) => normalizeText(value).replace(/\s+/g, " ").toLocaleLowerCase();

  function normalizeQuestions(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map((item, index) => {
      const source = typeof item === "string" ? { question: item } : item;
      if (!source || typeof source !== "object") return null;
      const question = normalizeText(source.question || source.text || source.content || source.label);
      if (!question) return null;
      const field = normalizeText(source.field || source.key || source.name || `question_${index + 1}`);
      const normalized = {
        field,
        question,
        reason: normalizeText(source.reason || source.description || source.helpText),
        importance: String(source.importance || source.priority || "recommended").toLowerCase() === "required" ? "required" : "recommended",
      };
      const key = `${normalizeKey(field)}\u0000${normalizeKey(question)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return normalized;
    }).filter(Boolean);
  }

  function migrateMakeMessage(raw = {}, index = 0) {
    const rawMode = String(raw.mode || raw.type || "").toLowerCase();
    const mode = rawMode === "ask" || rawMode === "question" ? "ask" : "improve";
    const questions = normalizeQuestions(raw.questions || raw.followUpQuestions || raw.additionalQuestions);
    const improvedPrompt = mode === "ask" ? "" : normalizeText(raw.executablePrompt || raw.finalPrompt || raw.improvedPrompt || raw.improved_prompt);
    const answer = normalizeText(raw.answer);
    const summary = normalizeText(raw.summary);
    const content = normalizeText(raw.content || raw.text || raw.message || answer || summary || improvedPrompt || (questions.length ? "정확한 결과를 위해 추가 정보가 필요합니다." : ""));
    return {
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      id: String(raw.id || raw.messageId || `message-${index}`),
      role: raw.role || raw.sender || "assistant",
      mode,
      content,
      answer,
      summary,
      improvedPrompt,
      questions,
      fields: Array.isArray(raw.fields) ? raw.fields : [],
      changes: Array.isArray(raw.changes) ? raw.changes : [],
      techniques: Array.isArray(raw.techniques || raw.techniquesApplied) ? (raw.techniques || raw.techniquesApplied) : [],
      ragStatus: String(raw.ragStatus || raw.rag_status || "ok").toLowerCase(),
    };
  }

  function isRenderableMessage(message) {
    if (!message) return false;
    if (normalizeText(message.content || message.answer || message.summary || message.improvedPrompt)) return true;
    return [message.questions, message.fields, message.changes, message.techniques].some((value) => Array.isArray(value) && value.length);
  }

  function migrateMakeMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map(migrateMakeMessage).filter(isRenderableMessage);
  }

  function buildImproveHistory(messages) {
    return migrateMakeMessages(messages)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: normalizeText(message.role === "assistant" ? message.answer || message.content : message.content) }))
      .filter((message) => message.content);
  }

  function classifyMakeError(error) {
    const status = Number(error?.status || error?.payload?.status || 0);
    const code = String(error?.payload?.code || error?.code || "").toUpperCase();
    if (status === 401 || code.includes("AUTH") || code.includes("TOKEN")) return { kind: "auth", message: "로그인이 만료되었습니다. 다시 로그인해주세요.", retryable: false };
    if (code === "AI_INVALID_RESPONSE") return { kind: "contract", message: "AI 응답 형식을 처리하지 못했습니다. 다시 시도해주세요.", retryable: true };
    if (status === 429 || code.includes("RATE_LIMIT")) return { kind: "rate_limit", message: "요청이 많습니다. 잠시 후 다시 시도해주세요.", retryable: true };
    if (status === 503 || status === 504 || code.includes("AI_SERVICE") || code === "AI_TIMEOUT") return { kind: "ai", message: "AI 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.", retryable: true };
    if (!status) return { kind: "network", message: "백엔드에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.", retryable: true };
    return { kind: "server", message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.", retryable: true };
  }

  const fixtures = Object.freeze({
    ask: { mode: "ask", answer: "정확한 결과를 위해 추가 정보가 필요합니다.", summary: "목적과 대상 독자를 확인해주세요.", improvedPrompt: "", questions: [{ field: "purpose", question: "이 글의 목적은 무엇인가요?", reason: "결과의 방향을 정하는 데 필요합니다.", importance: "required" }, { field: "audience", question: "주요 독자는 누구인가요?", reason: "어휘 수준을 조정하는 데 필요합니다.", importance: "recommended" }], fields: [], ragStatus: "ok" },
    improve: { mode: "improve", answer: "요청을 구체화했습니다.", improvedPrompt: "신규 사용자를 대상으로 제품 출시 안내문을 작성하라.", questions: [], fields: [], ragStatus: "ok" },
  });

  const api = Object.freeze({ SCHEMA_VERSION, normalizeQuestions, migrateMakeMessage, migrateMakeMessages, isRenderableMessage, buildImproveHistory, classifyMakeError, fixtures });
  global.TtalkakMakeMessageModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

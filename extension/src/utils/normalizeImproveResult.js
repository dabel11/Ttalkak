export function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const mode = ["ask", "improve"].includes(String(result.mode || result.type || "").toLowerCase())
    ? String(result.mode || result.type).toLowerCase()
    : "improve";
  const questions = normalizeImproveQuestions(result.questions || result.followUpQuestions || result.additionalQuestions);
  const answer = result.answer || result.explanation || result.summary || "";
  const improvedText =
    mode === "ask"
      ? ""
      : result.improvedPrompt ||
        result.improved_prompt ||
        result.text ||
        result.content ||
        answer ||
        fallbackPrompt;

  return {
    mode,
    answer: answer || "프롬프트를 개선했습니다.",
    questions,
    summary: result.summary || "",
    techniquesApplied: result.techniquesApplied || result.techniques_applied || [],
    changes: result.changes || [],
    score: result.score ?? null,
    improvedPrompt: improvedText,
    sources: result.sources || result.references || result.documents || [],
    ragStatus: String(result.ragStatus || result.rag_status || result.status || "ok").toLowerCase(),
    ragMessage: result.ragMessage || result.rag_message || "",
    threadId: String(result.threadId || payload?.threadId || ""),
  };
}

export function normalizeImproveQuestion(item, index = 0) {
  if (typeof item === "string") {
    const question = item.trim();
    return question
      ? {
          field: "",
          question,
          reason: "",
          importance: "recommended",
        }
      : null;
  }

  if (!item || typeof item !== "object") return null;
  const question = String(item.question || item.text || item.content || item.label || "").trim();
  if (!question) return null;
  const importance = String(item.importance || item.priority || "recommended").toLowerCase();

  return {
    field: String(item.field || item.key || item.name || `question_${index + 1}`).trim(),
    question,
    reason: String(item.reason || item.description || item.effect || item.helpText || "").trim(),
    importance: importance === "required" ? "required" : "recommended",
  };
}

export function normalizeImproveQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeImproveQuestion).filter(Boolean);
}

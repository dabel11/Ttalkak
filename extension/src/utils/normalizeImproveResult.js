export function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const mode = ["ask", "improve"].includes(String(result.mode || result.type || "").toLowerCase())
    ? String(result.mode || result.type).toLowerCase()
    : "improve";
  const questions = Array.isArray(result.questions)
    ? result.questions.map((question) => String(question)).filter(Boolean)
    : [];
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

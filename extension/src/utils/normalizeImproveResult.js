export function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const answer = result.answer || result.explanation || result.summary || "";
  const improvedText =
    result.improvedPrompt ||
    result.improved_prompt ||
    result.text ||
    result.content ||
    answer ||
    fallbackPrompt;

  return {
    answer: answer || "프롬프트를 개선했습니다.",
    improvedPrompt: improvedText,
    sources: result.sources || result.references || result.documents || [],
    ragStatus: String(result.ragStatus || result.rag_status || result.status || "ok").toLowerCase(),
    ragMessage: result.ragMessage || result.rag_message || "",
    threadId: String(result.threadId || payload?.threadId || ""),
  };
}

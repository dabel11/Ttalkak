import { parseLegacyImproveAnswer } from "./legacyImproveAnswer";

export function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const legacy = parseLegacyImproveAnswer(result.answer || result.explanation || "");
  const rawMode = String(result.mode || result.type || "").toLowerCase();
  const mode = rawMode === "ask" || rawMode === "question" ? "ask" : "improve";
  const questions = normalizeImproveQuestions(
    firstNonEmptyArray(result.questions, result.followUpQuestions, result.additionalQuestions, legacy.questions),
  );
  const hasLegacySections = Boolean(
    legacy.improvedPrompt || legacy.questions.length || legacy.changes.length || legacy.techniques.length,
  );
  const answer = legacy.lead || (hasLegacySections ? result.summary || "" : result.answer || result.explanation || result.summary || "");
  const fields = normalizeImproveFields(result.fields || result.fieldState || result.missingFields);
  const techniques = normalizeImproveTechniques(
    firstNonEmptyArray(result.techniques, result.techniquesApplied, result.techniques_applied, legacy.techniques),
  );
  const changes = normalizeImproveChanges(firstNonEmptyArray(result.changes, legacy.changes));
  const improvedText =
    mode === "ask"
      ? ""
      : result.improvedPrompt ||
        result.improved_prompt ||
        result.finalPrompt ||
        result.final_prompt ||
        legacy.improvedPrompt ||
        "";

  return {
    mode,
    answer: answer || "프롬프트를 개선했습니다.",
    questions,
    summary: result.summary || "",
    fields,
    techniques,
    techniquesApplied: techniques,
    changes,
    score: result.score ?? null,
    improvedPrompt: improvedText,
    sources: result.sources || result.references || result.documents || [],
    ragStatus: String(result.ragStatus || result.rag_status || result.status || "ok").toLowerCase(),
    ragMessage: result.ragMessage || result.rag_message || "",
    threadId: String(result.threadId || payload?.threadId || ""),
  };
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
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

export function normalizeImproveFields(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, role: "fact", status: "empty", value: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || item.field || item.key || item.label || `field_${index + 1}`).trim();
      if (!name) return null;
      const role = String(item.role || item.type || item.importance || "fact").toLowerCase();
      const status = String(item.status || (item.value ? "filled" : "empty")).toLowerCase();
      return {
        name,
        role: ["required", "fact", "framing"].includes(role) ? role : "fact",
        status: ["filled", "empty", "missing"].includes(status) ? status : "empty",
        value: String(item.value || item.answer || "").trim(),
      };
    })
    .filter(Boolean);
}

export function normalizeImproveChanges(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      return String(item.text || item.message || item.description || item.change || item.reason || "").trim();
    })
    .filter(Boolean);
}

export function normalizeImproveTechniques(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, reason: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || item.technique || item.title || item.label || "").trim();
      if (!name) return null;
      return {
        name,
        reason: String(item.reason || item.description || item.effect || item.summary || "").trim(),
      };
    })
    .filter(Boolean);
}

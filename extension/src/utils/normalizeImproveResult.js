import { parseLegacyImproveAnswer } from "./legacyImproveAnswer.js";
import {
  normalizeChanges,
  normalizeFields,
  normalizeImproveResponse,
  normalizeQuestions,
  normalizeTechniques,
} from "../../../shared/make-message-model.js";

export function normalizeImproveResult(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  const legacy = parseLegacyImproveAnswer(result.answer || result.explanation || "");
  const enriched = {
    ...result,
    answer: legacy.lead || result.answer || result.explanation || result.summary || "",
    improvedPrompt: result.improvedPrompt || result.improved_prompt || result.finalPrompt || result.final_prompt || legacy.improvedPrompt || "",
    questions: firstNonEmptyArray(result.questions, result.followUpQuestions, result.additionalQuestions, legacy.questions),
    changes: firstNonEmptyArray(result.changes, legacy.changes),
    techniques: firstNonEmptyArray(result.techniques, result.techniquesApplied, result.techniques_applied, legacy.techniques),
  };
  const normalized = normalizeImproveResponse({ ...payload, result: enriched }, fallbackPrompt);
  return { ...normalized, answer: normalized.answer || "프롬프트를 개선했습니다.", techniquesApplied: normalized.techniques, score: result.score ?? null };
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length) || [];
}

export function normalizeImproveQuestion(item, index = 0) {
  const normalized = normalizeQuestions([item])[0] || null;
  if (normalized?.field === "question_1" && index > 0) normalized.field = `question_${index + 1}`;
  return normalized;
}

export function normalizeImproveQuestions(value) {
  return normalizeQuestions(value);
}

export function mergeImproveQuestions(...values) {
  return normalizeImproveQuestions(values.flatMap((value) => Array.isArray(value) ? value : []));
}

export function normalizeImproveFields(value) {
  return normalizeFields(value);
}

export function normalizeImproveChanges(value) {
  return normalizeChanges(value);
}

export function normalizeImproveTechniques(value) {
  return normalizeTechniques(value);
}

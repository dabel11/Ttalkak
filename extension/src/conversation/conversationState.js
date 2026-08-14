// @ts-check
import {
  buildAskMessage,
  buildNoEvidenceMessage,
  buildUnchangedNoEvidenceMessage,
  getExecutablePrompt,
  isUnchangedNoEvidence,
} from "../utils/conversationMessages.js";
import { isAskResponse } from "./askAnswers.js";

export function createUserMessage(prompt, base = {}) {
  return { id: `user-${Date.now()}`, role: "user", content: prompt, ...base };
}

export function createAssistantMessage(prompt, data) {
  const isAsk = isAskResponse(data);
  const ragStatus = String(data.ragStatus || "").toLowerCase();
  const noEvidence = ragStatus === "no_evidence";
  const unchangedNoEvidence = !isAsk && Boolean(data.isUnchanged || isUnchangedNoEvidence(prompt, data));
  const executablePrompt = isAsk || unchangedNoEvidence ? null : getExecutablePrompt(data);
  return {
    id: `assistant-${Date.now()}`, role: "assistant", mode: isAsk ? "ask" : data.mode || "improve",
    content: isAsk
      ? buildAskMessage(data)
      : unchangedNoEvidence
        ? buildUnchangedNoEvidenceMessage()
        : noEvidence
          ? buildNoEvidenceMessage(prompt, data)
          : data.improvedPrompt || data.answer,
    answer: data.answer || "", questions: data.questions || [], changes: data.changes || [], fields: data.fields || [],
    techniques: data.techniques || data.techniquesApplied || [], summary: data.summary || "",
    ragStatus,
    executablePrompt, sourcePrompt: prompt, sources: data.sources || [], saved: false,
    ...(unchangedNoEvidence ? { isUnchanged: true } : {}),
    ...(noEvidence ? { excludeFromHistory: true } : {}),
  };
}

export function createImproveErrorMessage(prompt, error) {
  const content = error instanceof TypeError
    ? "백엔드 API에 연결할 수 없습니다.\n\n잠시 후 다시 시도해주세요."
    : `오류가 발생했습니다.\n\n${error?.message || "알 수 없는 오류"}`;
  return { id: `assistant-${Date.now()}`, role: "assistant", content, executablePrompt: null, sourcePrompt: prompt, sources: [], saved: false, isError: true, excludeFromHistory: true };
}

export function upsertRecentThread(threads, { id, prompt, messages, makeTitle }) {
  return [{ id, title: makeTitle(prompt), time: "방금", messages }, ...threads.filter((thread) => thread.id !== id)].slice(0, 30);
}

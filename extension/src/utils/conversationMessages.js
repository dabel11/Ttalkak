import { EXAMPLE_QUERIES } from "../constants.js";
import {
  classifyMakeError,
  isExecutableMessage,
  isUnchangedNoEvidence,
  UNCHANGED_NO_EVIDENCE_MESSAGE,
} from "../../../shared/make-message-model.js";

export function buildNoEvidenceMessage(prompt, data) {
  const executablePrompt = getExecutablePrompt(data);
  if (executablePrompt) return executablePrompt;
  if (data.answer || data.ragMessage) return data.answer || data.ragMessage;
  const examples = EXAMPLE_QUERIES.map((example) => `- ${example}`).join("\n");
  return `관련 기법 근거 없이 기본 첨삭을 수행했습니다.\n\n"${prompt}"에 대한 직접 근거는 찾지 못했지만, 기본 개선 결과를 아래에 반영했습니다.\n\n이런 요청으로 다시 시도해볼 수 있습니다:\n${examples}`;
}

export function buildAskMessage(data) {
  if (Array.isArray(data.questions) && data.questions.length) {
    return [
      data.summary ? String(data.summary) : "정확한 프롬프트를 만들기 위해 아래 정보를 보완해주세요.",
      "",
      ...data.questions.map((question, index) => `${index + 1}. ${getQuestionText(question)}`),
    ].join("\n");
  }
  return data.answer || "정확한 프롬프트를 만들기 위해 추가 정보가 필요합니다.";
}

export { isUnchangedNoEvidence };

export function buildUnchangedNoEvidenceMessage() {
  return UNCHANGED_NO_EVIDENCE_MESSAGE;
}

export function hasPromptPlaceholders(text) {
  return /\[[^\]\n]{1,80}\]/.test(String(text || ""));
}

export function getExecutablePrompt(data) {
  const candidate = String(data?.improvedPrompt || "").trim();
  return isExecutableMessage({ ...data, executablePrompt: candidate }) ? candidate : null;
}

export function getServerEditErrorMessage(error) {
  const code = String(error?.code || error?.payload?.code || "").toUpperCase();
  if (code === "THREAD_ID_REQUIRED") return "대화 정보를 찾을 수 없어 수정할 수 없습니다. 최근 대화를 다시 열어주세요.";
  if (code === "MESSAGE_NOT_EDITABLE") return "수정할 수 없는 메시지입니다. 사용자 메시지만 수정할 수 있습니다.";
  if (code === "THREAD_NOT_FOUND") return "이미 삭제되었거나 접근할 수 없는 대화입니다.";
  if (code === "MESSAGE_NOT_FOUND") return "수정할 메시지를 찾을 수 없습니다. 대화를 다시 불러와 주세요.";
  if (code === "AI_INVALID_RESPONSE" || code === "AI_SERVICE_UNAVAILABLE" || code === "AI_RATE_LIMIT_EXCEEDED" || code === "AI_TIMEOUT") return classifyMakeError(error).message;
  return error?.message || "수정 실패: 잠시 후 다시 시도해주세요.";
}

function getQuestionText(question) {
  return String(question?.question || question || "").trim();
}

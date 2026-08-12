// GENERATED FILE. Edit shared/make-message-model.js and run node scripts/build-make-message-model.cjs.
export const SCHEMA_VERSION = 2;
const text = (value) => String(value || "").trim();
const key = (value) => text(value).replace(/\s+/g, " ").toLocaleLowerCase();

export function normalizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item, index) => {
    const source = typeof item === "string" ? { question: item } : item;
    if (!source || typeof source !== "object") return null;
    const question = text(source.question || source.text || source.content || source.label);
    if (!question) return null;
    const field = text(source.field || source.key || source.name || `question_${index + 1}`);
    if (/\(\s*예\s*$/u.test(field) && /\)\s*$/u.test(question)) return null;
    return { field, question, reason: text(source.reason || source.description || source.effect || source.helpText), importance: String(source.importance || source.priority || "recommended").toLowerCase() === "required" ? "required" : "recommended" };
  }).filter((item) => {
    if (!item) return false;
    const identity = `${key(item.field)}\u0000${key(item.question)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function normalizeFields(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => {
    if (typeof item === "string") return text(item) ? { name: text(item), role: "fact", status: "empty", value: "" } : null;
    if (!item || typeof item !== "object") return null;
    const name = text(item.name || item.field || item.key || item.label || `field_${index + 1}`);
    const role = String(item.role || item.type || item.importance || "fact").toLowerCase();
    const status = String(item.status || (item.value ? "filled" : "empty")).toLowerCase();
    return name ? { name, role: ["required", "fact", "framing"].includes(role) ? role : "fact", status: ["filled", "empty", "missing"].includes(status) ? status : "empty", value: text(item.value || item.answer) } : null;
  }).filter(Boolean);
}

export function normalizeChanges(value) {
  return (Array.isArray(value) ? value : []).map((item) => typeof item === "string" ? text(item) : text(item?.text || item?.message || item?.description || item?.change || item?.reason)).filter(Boolean);
}

export function normalizeTechniques(value) {
  return (Array.isArray(value) ? value : []).map((item) => {
    if (typeof item === "string") return text(item) ? { name: text(item), reason: "" } : null;
    const name = text(item?.name || item?.technique || item?.title || item?.label);
    return name ? { name, reason: text(item?.reason || item?.description || item?.effect || item?.summary) } : null;
  }).filter(Boolean);
}

export function parseLegacyQuestions(value) {
  const source = text(value);
  if (!source) return { leadText: "", questions: [] };
  const lead = [];
  const questions = [];
  let found = false;
  source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const pair = line.match(/^(?:[-*•]|\d+[.)])\s+([^:：?？()]{1,24})[:：]\s*(.+)$/)
      || line.match(/^([^:：?？()*]{1,24})[:：]\s*(.+[?？])$/);
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s*(.+[?？])$/);
    if (pair || bullet) {
      found = true;
      questions.push({ field: pair ? pair[1].replace(/\*\*/g, "").trim() : "", question: pair ? pair[2].trim() : bullet[1].trim(), reason: "", importance: "required" });
    } else if (!found) lead.push(line.replace(/\*\*/g, "").trim());
  });
  return { leadText: questions.length ? lead.join("\n") : source, questions: normalizeQuestions(questions) };
}

export function normalizeImproveResponse(payload, fallbackPrompt = "") {
  const result = payload?.result || payload?.data || payload || {};
  if (typeof result === "string") return { mode: "improve", answer: "", summary: "", improvedPrompt: result, text: result, questions: [], fields: [], changes: [], techniques: [], sources: [], ragStatus: "ok", ragMessage: "", threadId: "" };
  const mode = ["ask", "question"].includes(String(result.mode || result.type || "").toLowerCase()) ? "ask" : "improve";
  const answer = text(result.answer || result.explanation || result.summary);
  const legacy = parseLegacyQuestions(answer);
  const rawQuestions = result.questions || result.followUpQuestions || result.additionalQuestions;
  const questions = normalizeQuestions([...(Array.isArray(rawQuestions) ? rawQuestions : []), ...legacy.questions]);
  const improvedPrompt = mode === "ask" ? "" : text(result.improvedPrompt || result.improved_prompt || result.finalPrompt || result.final_prompt || fallbackPrompt);
  return { mode, answer: legacy.leadText || answer, summary: text(result.summary), improvedPrompt, text: mode === "ask" ? legacy.leadText || answer : improvedPrompt || answer, questions, fields: normalizeFields(result.fields || result.fieldState || result.missingFields), changes: normalizeChanges(result.changes || result.assumptions || result.assumedChanges), techniques: normalizeTechniques(result.techniques || result.techniquesApplied || result.techniques_applied), sources: result.sources || result.references || result.documents || [], ragStatus: String(result.ragStatus || result.rag_status || result.status || "ok").toLowerCase(), ragMessage: text(result.ragMessage || result.rag_message), threadId: String(result.threadId || payload?.threadId || "") };
}

export const migrateV0ToV1 = (/** @type {Record<string, *>} */ raw = {}) => ({ ...raw, schemaVersion: 1, mode: String(raw.mode || raw.type || "").toLowerCase() === "question" ? "ask" : raw.mode });
export const migrateV1ToV2 = (/** @type {Record<string, *>} */ raw = {}) => ({ ...raw, schemaVersion: 2, improvedPrompt: raw.improvedPrompt || raw.improved_prompt || raw.finalPrompt || "" });
export function runMessageMigrations(/** @type {Record<string, *>} */ raw = {}) { let value = { ...raw }; let version = Number(value.schemaVersion || 0); if (version < 1) { value = migrateV0ToV1(value); version = 1; } if (version < 2) value = migrateV1ToV2(value); return value; }

export function migrateMakeMessage(/** @type {Record<string, *>} */ input = {}, index = 0) {
  const raw = runMessageMigrations(input);
  const mode = ["ask", "question"].includes(String(raw.mode || raw.type || "").toLowerCase()) ? "ask" : "improve";
  const legacy = parseLegacyQuestions(raw.answer || raw.content);
  const structured = raw.questions || raw.followUpQuestions || raw.additionalQuestions;
  const questions = normalizeQuestions([...(Array.isArray(structured) ? structured : []), ...legacy.questions]);
  const improvedPrompt = mode === "ask" ? "" : text(raw.executablePrompt || raw.finalPrompt || raw.improvedPrompt || raw.improved_prompt);
  const answer = text(raw.answer);
  const summary = text(raw.summary);
  return { ...raw, schemaVersion: SCHEMA_VERSION, id: String(raw.id || raw.messageId || `message-${index}`), role: raw.role || raw.sender || "assistant", mode, content: text(raw.content || raw.text || raw.message || legacy.leadText || answer || summary || improvedPrompt || (questions.length ? "정확한 결과를 위해 추가 정보가 필요합니다." : "")), answer, summary, improvedPrompt, questions, fields: normalizeFields(raw.fields), changes: normalizeChanges(raw.changes), techniques: normalizeTechniques(raw.techniques || raw.techniquesApplied), ragStatus: String(raw.ragStatus || raw.rag_status || "ok").toLowerCase() };
}

export function isRenderableMessage(message) { const value = migrateMakeMessage(message); return Boolean(text(value.content || value.answer || value.summary || value.improvedPrompt) || [value.questions, value.fields, value.changes, value.techniques].some((items) => items.length)); }
export function migrateMakeMessages(messages) { return (Array.isArray(messages) ? messages : []).map(migrateMakeMessage).filter(isRenderableMessage); }
export function migratePersistedMakeState(/** @type {Record<string, *>} */ state = {}) { state.messages = migrateMakeMessages(state.messages); state.recentThreads = (Array.isArray(state.recentThreads) ? state.recentThreads : []).map((thread) => ({ ...thread, messages: migrateMakeMessages(thread?.messages) })); return state; }
export function buildImproveHistory(messages) { return migrateMakeMessages(messages).filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({ role: message.role, content: text(message.role === "assistant" ? message.answer || message.content : message.content) })).filter((message) => message.content); }
const NON_EXECUTABLE_PROMPT_FRAGMENTS = ["관련 프롬프트 기법 근거를 찾지 못했습니다", "관련 기법 근거 없이", "개선안을 만들 수 없", "확인이 필요"];
const ASK_ONLY_PATTERNS = [/확인이\s*필요/i, /답변이\s*필요/i, /추가\s*정보가\s*필요/i, /정보를\s*보완해\s*주세요/i, /개선안을?\s*만들\s*수\s*없/i, /만들\s*수\s*없어/i, /아래\s*정보를\s*알려주시면/i, /어떤\s*주제/i, /무엇에\s*대한\s*글/i];
function isUtilityOnlyPrompt(value) { const normalized = text(value).replace(/\s+/g, " "); return !normalized || NON_EXECUTABLE_PROMPT_FRAGMENTS.some((fragment) => normalized.includes(fragment)); }
function isAskOnlyResponse(value) { const normalized = text(value); return !normalized || isUtilityOnlyPrompt(normalized) || ASK_ONLY_PATTERNS.some((pattern) => pattern.test(normalized)); }
export function isExecutableMessage(message) { const value = migrateMakeMessage(message); const prompt = text(message?.executablePrompt || message?.finalPrompt || value.improvedPrompt || value.content); return !message?.isCancelled && !message?.isError && !message?.isThinking && value.mode !== "ask" && !(value.questions.length && !value.improvedPrompt) && Boolean(prompt) && !isUtilityOnlyPrompt(prompt) && !isAskOnlyResponse(prompt); }
export function composeAskAnswers(questions, values = {}) { const normalized = normalizeQuestions(questions); const missingFields = normalized.filter((item) => item.importance === "required" && !text(values[item.field])).map((item) => item.field); const lines = normalized.map((item) => text(values[item.field]) ? `- ${item.question}: ${text(values[item.field])}` : "").filter(Boolean); return { missingFields, message: lines.length ? `추가 정보:\n${lines.join("\n")}` : "" }; }
export function classifyMakeError(error) { const status = Number(error?.status || error?.payload?.status || 0); const code = String(error?.payload?.code || error?.code || "").toUpperCase(); const result = (kind, message, retryable, requiresLogin = false) => ({ kind, code, status, message, retryable, requiresLogin }); if (status === 401 || code.includes("AUTH") || code.includes("TOKEN")) return result("auth", "로그인이 만료되었습니다. 다시 로그인해주세요.", false, true); if (code === "AI_INVALID_RESPONSE") return result("contract", "AI 응답 형식을 처리하지 못했습니다. 다시 시도해주세요.", true); if (status === 429 || code.includes("RATE_LIMIT")) return result("rate_limit", "요청이 많습니다. 잠시 후 다시 시도해주세요.", true); if (code === "REQUEST_ABORTED") return result("cancelled", "요청이 취소되었습니다.", false); if (code === "REQUEST_TIMEOUT") return result("timeout", "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.", true); if (status === 503 || status === 504 || code.includes("AI_SERVICE") || code === "AI_TIMEOUT") return result("ai", "AI 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.", true); if (!status) return result("network", "백엔드에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.", true); return result("server", "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.", true); }

const MakeMessageModel = Object.freeze({ SCHEMA_VERSION, normalizeQuestions, normalizeFields, normalizeChanges, normalizeTechniques, normalizeImproveResponse, parseLegacyQuestions, migrateV0ToV1, migrateV1ToV2, runMessageMigrations, migrateMakeMessage, migrateMakeMessages, migratePersistedMakeState, isRenderableMessage, isExecutableMessage, buildImproveHistory, classifyMakeError, composeAskAnswers });
export default MakeMessageModel;

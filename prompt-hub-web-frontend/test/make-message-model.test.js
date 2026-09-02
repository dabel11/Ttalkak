const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/utils/make-message-model.js");
const fixtures = require("./fixtures/make-responses.js");
const fs = require("node:fs");
const vm = require("node:vm");
const { transform, sourcePath } = require("../../scripts/build-make-message-model.cjs");

function loadCanonicalSharedModel() {
  const filename = require.resolve("../../shared/make-message-model.js");
  const source = fs.readFileSync(filename, "utf8")
    .replace(/export default MakeMessageModel;?/g, "")
    .replace(/export\s+(?=(const|function)\s)/g, "")
    .concat("\nthis.__model = MakeMessageModel;");
  const context = {};
  vm.runInNewContext(source, context, { filename });
  return context.__model;
}

test("shared UX policy keeps progress, failure actions, and recent groups identical", () => {
  assert.equal(model.getMakeProgressStatus(0).label, "요청을 분석하고 있습니다");
  assert.equal(model.getMakeProgressStatus(9000).label, "참고 자료를 확인하고 있습니다");
  assert.equal(model.getMakeProgressStatus(30000).label, "평소보다 시간이 걸리고 있습니다");
  assert.deepEqual(model.getMakeFailureAction({ kind: "auth", requiresLogin: true }), { id: "login", label: "로그인" });
  assert.deepEqual(model.getMakeFailureAction({ kind: "network", retryable: true }), { id: "retry", label: "연결 확인 후 다시 시도" });
  assert.deepEqual(model.getMakeFailureAction({ kind: "concurrency", retryMode: "edit" }), { id: "retry-after-refresh", label: "수정한 내용 다시 보내기" });
  assert.equal(model.getMakeFailurePresentation({ kind: "concurrency_refresh" }).title, "다른 곳에서 대화가 업데이트됐습니다");
  assert.match(model.getMakeFailurePresentation({ kind: "concurrency_refresh", repeated: true }).description, /새 대화/);
  assert.equal(model.getMakeFailurePresentation({ kind: "concurrency", retryMode: "edit" }).tone, "recovered");
  assert.equal(model.getMakeRecentDateGroup("2026-08-15T09:00:00+09:00", new Date("2026-08-15T12:00:00+09:00").getTime()), "오늘");
});

test("question aliases migrate to ask and disable executable prompt", () => {
  const message = model.migrateMakeMessage({ type: "question", improvedPrompt: "실행 금지", questions: ["목적은 무엇인가요?"] });
  assert.equal(message.mode, "ask");
  assert.equal(message.improvedPrompt, "");
  assert.equal(message.questions.length, 1);
});

test("browser distribution stays in parity with the canonical shared model", () => {
  const shared = loadCanonicalSharedModel();
  const samples = [
    { role: "assistant", type: "question", answer: "추가 정보가 필요합니다.\n- 목적: 무엇을 만들까요?", questions: [{ field: "purpose", question: "무엇을 만들까요?" }] },
    { role: "assistant", mode: "improve", improvedPrompt: "정리된 프롬프트", fields: { tone: "professional" }, changes: ["구조 개선"] },
  ];
  for (const sample of samples) {
    assert.deepEqual(model.migrateMakeMessage(sample), JSON.parse(JSON.stringify(shared.migrateMakeMessage(sample))));
  }
  assert.deepEqual(model.classifyMakeError({ code: "AI_RATE_LIMIT_EXCEEDED", status: 429 }), JSON.parse(JSON.stringify(shared.classifyMakeError({ code: "AI_RATE_LIMIT_EXCEEDED", status: 429 }))));
});

test("browser message model is generated exactly from the canonical shared source", () => {
  const generated = fs.readFileSync(require.resolve("../src/utils/make-message-model.js"), "utf8");
  assert.equal(generated, transform(fs.readFileSync(sourcePath, "utf8")));
});

test("legacy assistant content is restored and empty messages are removed", () => {
  assert.equal(model.migrateMakeMessage({ role: "assistant", improvedPrompt: "복원된 본문" }).content, "복원된 본문");
  assert.deepEqual(model.migrateMakeMessages([{ role: "assistant" }]), []);
});

test("legacy answer questions migrate into structured ask data", () => {
  const message = model.migrateMakeMessage({ role: "assistant", mode: "ask", answer: "추가 정보가 필요합니다.\n- 목적: 무엇을 만들까요?\n- 대상: 누가 읽나요?" });
  assert.equal(message.questions.length, 2);
  assert.equal(message.questions[0].field, "목적");
  assert.equal(message.content, "추가 정보가 필요합니다.");
});

test("example colons inside a question do not create fake legacy questions", () => {
  const source = "무엇에 대한 캡션을 작성하고 싶으신가요? (예: 여행, 음식, 제품)";
  const parsed = model.parseLegacyQuestions(source);
  assert.equal(parsed.questions.length, 0);
  assert.equal(parsed.leadText, source);
  assert.equal(model.normalizeQuestions([{ field: "무엇을 작성할까요? (예", question: "여행, 음식, 제품)" }]).length, 0);
  assert.equal(model.parseLegacyQuestions("**대상**: 일반인에게 설명하기 위해").questions.length, 0);
});

test("question duplicates and history are normalized", () => {
  assert.equal(model.normalizeQuestions([{ field: "purpose", question: "목적은?" }, { field: " purpose ", question: " 목적은? " }]).length, 1);
  assert.deepEqual(model.buildImproveHistory([{ role: "user", content: "글 써줘" }, { role: "assistant", mode: "ask", answer: "목적은?" }]), [{ role: "user", content: "글 써줘" }, { role: "assistant", content: "목적은?" }]);
});

test("errors are separated into actionable states", () => {
  assert.equal(model.classifyMakeError({ code: "AI_INVALID_RESPONSE" }).kind, "contract");
  assert.equal(model.classifyMakeError({ status: 503 }).kind, "ai");
  assert.equal(model.classifyMakeError({ code: "AI_SERVICE_UNAVAILABLE" }).kind, "ai");
  assert.equal(model.classifyMakeError({ code: "AI_RATE_LIMIT_EXCEEDED" }).kind, "rate_limit");
  assert.equal(model.classifyMakeError({ status: 401 }).kind, "auth");
  assert.equal(model.classifyMakeError({ status: 500 }).kind, "server");
  assert.equal(model.classifyMakeError({}).kind, "network");
});

test("user cancellation is not reported as a retryable timeout", () => {
  const failure = model.classifyMakeError({ code: "REQUEST_ABORTED" });
  assert.equal(failure.kind, "cancelled");
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /취소/);
});

test("executable policy rejects ask-only and utility-only responses", () => {
  assert.equal(model.isExecutableMessage({ role: "assistant", mode: "improve", executablePrompt: "관련 기법 근거 없이 기본 방식으로 다듬었습니다." }), false);
  assert.equal(model.isExecutableMessage({ role: "assistant", mode: "improve", executablePrompt: "추가 정보가 필요합니다. 대상 독자는 누구인가요?" }), false);
  assert.equal(model.isExecutableMessage({ role: "assistant", mode: "improve", executablePrompt: "신규 사용자를 위한 출시 안내문을 작성하세요." }), true);
});

test("ask fixture contains required and optional questions", () => {
  assert.equal(fixtures.ask.mode, "ask");
  assert.deepEqual(fixtures.ask.questions.map((item) => item.importance), ["required", "recommended"]);
});

test("ask fixture validates required answers and composes the follow-up message", () => {
  const missing = model.composeAskAnswers(fixtures.ask.questions, { audience: "신규 사용자" });
  assert.deepEqual(missing.missingFields, ["purpose"]);
  const complete = model.composeAskAnswers(fixtures.ask.questions, { purpose: "제품 출시 안내", audience: "신규 사용자" });
  assert.deepEqual(complete.missingFields, []);
  assert.equal(complete.message, "추가 정보:\n- 이 글의 목적은 무엇인가요?: 제품 출시 안내\n- 주요 독자는 누구인가요?: 신규 사용자");
  assert.equal(fixtures.improve.mode, "improve");
});

test("persisted make state receives schema versions and removes empty messages", () => {
  const state = {
    messages: [{ role: "assistant", improvedPrompt: "복원 본문" }, { role: "assistant" }],
    recentThreads: [{ id: "thread-1", messages: [{ role: "assistant", answer: "질문\n- 목적: 무엇인가요?", mode: "ask" }] }],
  };
  model.migratePersistedMakeState(state);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].schemaVersion, model.SCHEMA_VERSION);
  assert.equal(state.recentThreads[0].messages[0].questions.length, 1);
});

test("message migrations advance version-by-version and keep v2 stable", () => {
  const v1 = model.migrateV0ToV1({ type: "question" });
  assert.equal(v1.schemaVersion, 1);
  assert.equal(v1.mode, "ask");
  const v2 = model.migrateV1ToV2({ ...v1, finalPrompt: "결과" });
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.improvedPrompt, "결과");
  assert.deepEqual(model.runMessageMigrations(v2), v2);
});

test("shared response normalization covers fields changes techniques and executable policy", () => {
  const result = model.normalizeImproveResponse({ mode: "improve", improvedPrompt: "실행 프롬프트", fields: ["대상"], changes: [{ text: "구체화" }], techniques: [{ name: "역할 부여" }] });
  assert.equal(result.fields[0].name, "대상");
  assert.deepEqual(result.changes, ["구체화"]);
  assert.equal(result.techniques[0].name, "역할 부여");
  assert.equal(model.isExecutableMessage(result), true);
});

test("shared no-evidence policy marks unchanged results as non-executable", () => {
  const result = model.normalizeImproveResponse({
    mode: "improve",
    improvedPrompt: "신규   서비스 안내문",
    ragStatus: "NO_EVIDENCE",
  }, "  신규 서비스 안내문  ");

  assert.equal(result.ragStatus, "no_evidence");
  assert.equal(result.isUnchanged, true);
  assert.equal(result.excludeFromHistory, true);
  assert.equal(result.improvedPrompt, "");
  assert.equal(result.text, model.UNCHANGED_NO_EVIDENCE_MESSAGE);
  assert.equal(model.isExecutableMessage(result), false);
  assert.deepEqual(model.buildImproveHistory([
    { role: "user", content: "신규 서비스 안내문" },
    { role: "assistant", ...result, content: result.text },
  ]), [{ role: "user", content: "신규 서비스 안내문" }]);
});

test("shared compatibility fixtures normalize consistently in the web client", () => {
  for (const name of ["missingOptionalFields", "unknownAdditionalField", "emptyCollections", "noEvidence"]) {
    const result = model.normalizeImproveResponse(fixtures[name]);
    assert.equal(result.mode, "improve");
    assert.ok(result.improvedPrompt);
  }

  assert.equal(model.normalizeImproveResponse(fixtures.noEvidence).ragStatus, "no_evidence");
  assert.equal(model.classifyMakeError(fixtures.aiUnavailable).kind, "ai");
  assert.equal(model.classifyMakeError(fixtures.timeout).kind, "timeout");

  const cancelled = model.migrateMakeMessage(fixtures.cancelled);
  assert.equal(cancelled.isCancelled, true);
  assert.equal(cancelled.isError, false);
  assert.equal(cancelled.excludeFromHistory, true);
  assert.equal(model.isExecutableMessage(cancelled), false);

  const legacy = model.migrateMakeMessage(fixtures.legacyAssistant);
  assert.match(legacy.content, /구형 저장 응답/);
});

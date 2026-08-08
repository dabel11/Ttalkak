const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/utils/make-message-model.js");

test("question aliases migrate to ask and disable executable prompt", () => {
  const message = model.migrateMakeMessage({ type: "question", improvedPrompt: "실행 금지", questions: ["목적은 무엇인가요?"] });
  assert.equal(message.mode, "ask");
  assert.equal(message.improvedPrompt, "");
  assert.equal(message.questions.length, 1);
});

test("legacy assistant content is restored and empty messages are removed", () => {
  assert.equal(model.migrateMakeMessage({ role: "assistant", improvedPrompt: "복원된 본문" }).content, "복원된 본문");
  assert.deepEqual(model.migrateMakeMessages([{ role: "assistant" }]), []);
});

test("question duplicates and history are normalized", () => {
  assert.equal(model.normalizeQuestions([{ field: "purpose", question: "목적은?" }, { field: " purpose ", question: " 목적은? " }]).length, 1);
  assert.deepEqual(model.buildImproveHistory([{ role: "user", content: "글 써줘" }, { role: "assistant", mode: "ask", answer: "목적은?" }]), [{ role: "user", content: "글 써줘" }, { role: "assistant", content: "목적은?" }]);
});

test("errors are separated into actionable states", () => {
  assert.equal(model.classifyMakeError({ code: "AI_INVALID_RESPONSE" }).kind, "contract");
  assert.equal(model.classifyMakeError({ status: 503 }).kind, "ai");
  assert.equal(model.classifyMakeError({}).kind, "network");
});

test("ask fixture contains required and optional questions", () => {
  assert.equal(model.fixtures.ask.mode, "ask");
  assert.deepEqual(model.fixtures.ask.questions.map((item) => item.importance), ["required", "recommended"]);
});

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../src/renderers/pages/make-message-parts.js");
require("../src/renderers/pages/make-page.js");

const { MessageQuestionsView } = global.window.TtalkakMakeMessageParts;
const { MessageBubbleView } = global.window.TtalkakRenderers;
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttr = escapeHtml;

test("ask questions render accessible required and optional inputs", () => {
  const html = MessageQuestionsView({ escapeAttr, escapeHtml }, {
    isAsk: true,
    messageId: "assistant-1",
    questions: [
      { field: "purpose", question: "목적은 무엇인가요?", importance: "required", reason: "결과 방향을 정합니다." },
      { field: "audience", question: "대상은 누구인가요?", importance: "recommended", reason: "표현을 조정합니다." },
    ],
  });

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /required aria-required="true"/);
  assert.match(html, />필수</);
  assert.match(html, />선택</);
  assert.match(html, /data-ask-answer-form="assistant-1"/);
  assert.match(html, /type="submit">답변 제출/);
});

test("improve suggestions do not render answer inputs", () => {
  const html = MessageQuestionsView({ escapeAttr, escapeHtml }, {
    isAsk: false,
    messageId: "assistant-2",
    questions: [{ field: "tone", question: "문체는 무엇인가요?", importance: "recommended" }],
  });

  assert.doesNotMatch(html, /data-ask-answer-input/);
  assert.doesNotMatch(html, /data-ask-answer-form/);
});

test("ask messages hide copy and execute actions", () => {
  const html = MessageBubbleView({
    icons: { check: "check", copy: "copy", bookmark: "save", share: "share", play: "play", edit: "edit" },
    escapeAttr,
    escapeHtml,
  }, {
    id: "assistant-ask",
    role: "assistant",
    mode: "ask",
    answer: "추가 정보가 필요합니다.",
    content: "추가 정보가 필요합니다.",
    questions: [{ field: "purpose", question: "목적은 무엇인가요?", importance: "required" }],
    fields: [], changes: [], techniques: [],
    hasExecutablePrompt: false,
  });

  assert.match(html, /data-ask-answer-form/);
  assert.doesNotMatch(html, /data-copy-message/);
  assert.doesNotMatch(html, /data-execute-message/);
});

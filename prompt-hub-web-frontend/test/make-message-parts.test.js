const test = require("node:test");
const assert = require("node:assert/strict");
const fixtures = require("./fixtures/make-responses.js");
const fixtureMatrix = require("../../fixtures/prompt-improve-responses.json");
const messageModel = require("../src/utils/make-message-model.js");

let MessageQuestionsView; let MakeFeedView; let MakeFolderButtonView; let MakeTemplateBarView; let MessageBubbleView;
test.before(async () => {
  const { parts } = await import("../src/renderers/pages/make-message-parts.mjs");
  const { renderers } = await import("../src/renderers/pages/make-page.mjs");
  ({ MessageQuestionsView } = parts);
  ({ MakeFeedView, MakeFolderButtonView, MakeTemplateBarView, MessageBubbleView } = renderers);
});
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
  assert.match(html, /aria-describedby="ask-assistant-1-purpose-reason ask-assistant-1-progress"/);
  assert.match(html, />필수</);
  assert.match(html, />선택</);
  assert.match(html, /data-ask-answer-form="assistant-1"/);
  assert.match(html, /필수 답변 0\/1개 입력/);
  assert.match(html, /<details class="ask-optional-questions">/);
  assert.match(html, /type="submit"\s*>답변 제출/);
});

test("ask answer controls expose a busy and disabled state while sending", () => {
  const html = MessageQuestionsView({ escapeAttr, escapeHtml }, {
    isAsk: true,
    isThinking: true,
    messageId: "assistant-busy",
    questions: [{ field: "purpose", question: "목적은 무엇인가요?", importance: "required" }],
  });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /data-ask-answer-input[^>]*disabled/);
  assert.match(html, /type="submit" disabled>전송 중/);
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

test("executable improve messages do not expose non-actionable question lists", () => {
  const html = MessageBubbleView({
    icons: { check: "check", copy: "copy", bookmark: "save", share: "share", play: "play", edit: "edit" },
    escapeAttr,
    escapeHtml,
  }, {
    id: "assistant-improve",
    role: "assistant",
    mode: "improve",
    content: "Improved prompt",
    improvedPrompt: "Improved prompt",
    questions: [{ field: "audience", question: "Who is the audience?", importance: "required" }],
    fields: [{ name: "Audience", role: "fact", status: "empty" }],
    changes: ["Assumed a professional tone"],
    techniques: [{ name: "Role prompting" }],
    hasExecutablePrompt: true,
  });

  assert.doesNotMatch(html, /message-question-section/);
  assert.match(html, /message-result-prompt/);
  assert.match(html, />개선된 프롬프트</);
  assert.match(html, /<details class="message-detail-section message-field-section">/);
  assert.match(html, /<details class="message-detail-section message-changes-section">/);
  assert.match(html, /<details class="message-detail-section message-technique-section">/);
  assert.ok(html.indexOf("message-result-prompt") < html.indexOf("message-actions"));
  assert.ok(html.indexOf("message-actions") < html.indexOf("message-field-section"));
  assert.match(html, /data-execute-message/);
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

test("unchanged no-evidence results render guidance without result actions", () => {
  const result = messageModel.normalizeImproveResponse({
    mode: "improve",
    improvedPrompt: "same prompt",
    ragStatus: "no_evidence",
  }, "same prompt");
  const html = MessageBubbleView({
    icons: { check: "check", copy: "copy", bookmark: "save", share: "share", play: "play", edit: "edit" },
    escapeAttr,
    escapeHtml,
  }, { id: "assistant-unchanged", role: "assistant", ...result, content: result.text, hasExecutablePrompt: messageModel.isExecutableMessage(result) });

  assert.match(html, new RegExp(messageModel.UNCHANGED_NO_EVIDENCE_MESSAGE));
  assert.match(html, /evidence-notice/);
  assert.match(html, /data-refine-unchanged="assistant-unchanged"/);
  assert.match(html, /내용을 구체화하기/);
  assert.doesNotMatch(html, /message-result-prompt|message-actions|data-execute-message/);
});

test("thinking messages expose an accessible request cancellation control", () => {
  const html = MakeFeedView({ icons: { make: "make", send: "send" } }, {
    hasMessages: true,
    isThinking: true,
    messages: [],
    renderMessageBubble: () => "",
    templateBarHtml: "",
  });
  assert.match(html, /data-cancel-make-request/);
  assert.match(html, /aria-label="요청 취소"/);
  assert.match(html, /aria-live="polite"/);
});

test("empty Make state offers focused template starters", () => {
  const html = MakeFeedView({ icons: { make: "make", send: "send" }, escapeAttr, escapeHtml }, {
    hasMessages: false,
    isThinking: false,
    messages: [],
    promptTemplates: [
      { id: "writing", label: "글쓰기", prompt: "글쓰기 템플릿" },
      { id: "summary", label: "요약", prompt: "요약 템플릿" },
    ],
    renderMessageBubble: () => "",
    templateBarHtml: "",
  });
  assert.match(html, /make-empty-starters/);
  assert.match(html, /data-template="writing"/);
  assert.match(html, /글쓰기 예시로 시작하기/);
});

test("template selection explains its effect and exposes pressed state", () => {
  const html = MakeTemplateBarView({ escapeAttr, escapeHtml }, {
    promptTemplates: [{ id: "writing", label: "글쓰기", description: "글의 뼈대를 만듭니다." }],
    selectedTemplateId: "writing",
    templateCollapsed: false,
  });
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /template-guidance/);
  assert.match(html, /글의 뼈대를 만듭니다/);
});

test("folder action names identify their owning folder", () => {
  const html = MakeFolderButtonView({ icons: { bookmark: "bookmark", more: "more" }, escapeAttr, escapeHtml, formatNumber: String }, {
    canManage: true, count: 2, folderId: "folder-1", isActive: false, isEditing: false, isMenuOpen: false, isUserFolder: true, name: "업무 자료",
  });
  assert.match(html, /aria-label="업무 자료 폴더 더보기"/);
});

test("conversation turns group a user request with its reply and highlight pending work", () => {
  const messages = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }, { id: "u2", role: "user" }];
  const html = MakeFeedView({ icons: { make: "make", send: "send" } }, { hasMessages: true, isThinking: true, messages, renderMessageBubble: (message) => `<i>${message.id}</i>`, templateBarHtml: "" });
  assert.equal((html.match(/class="conversation-turn/g) || []).length, 2);
  assert.match(html, /conversation-turn is-processing/);
  assert.ok(html.indexOf("u1") < html.indexOf("a1"));
  assert.ok(html.indexOf("u2") < html.indexOf("data-make-thinking-indicator"));
});

test("real response regressions keep ask inputs and executable results distinct", () => {
  const ask = messageModel.normalizeImproveResponse(fixtureMatrix.regressions.exampleInQuestion);
  const askHtml = MessageBubbleView({
    icons: { check: "check", copy: "copy", bookmark: "save", share: "share", play: "play", edit: "edit" },
    escapeAttr,
    escapeHtml,
  }, { id: "regression-ask", role: "assistant", ...ask, hasExecutablePrompt: false });
  assert.equal(ask.questions.length, 1);
  assert.match(ask.questions[0].question, /예: 여행, 음식, 제품/);
  assert.match(askHtml, /data-ask-answer-input/);

  const improve = messageModel.normalizeImproveResponse(fixtureMatrix.regressions.improveWithNonActionableQuestions);
  const improveHtml = MessageBubbleView({
    icons: { check: "check", copy: "copy", bookmark: "save", share: "share", play: "play", edit: "edit" },
    escapeAttr,
    escapeHtml,
  }, { id: "regression-improve", role: "assistant", ...improve, hasExecutablePrompt: true });
  assert.doesNotMatch(improveHtml, /message-question-section/);
  assert.match(improveHtml, /message-result-prompt/);
  assert.match(improveHtml, /data-execute-message/);
});

test("markdown descriptions in improve responses are not parsed as questions", () => {
  const regression = fixtureMatrix.regressions.markdownDescription;
  const parsed = messageModel.parseLegacyQuestions(regression.answer);
  assert.equal(parsed.questions.length, 0);
  assert.equal(fixtures.improve.mode, "improve");
});

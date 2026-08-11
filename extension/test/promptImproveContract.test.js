import test from "node:test";
import assert from "node:assert/strict";

import { buildImproveHistory } from "../src/utils/conversationHistory.js";
import { getMessageActionVisibility } from "../src/utils/messageActions.js";
import { mergeImproveQuestions, normalizeImproveResult } from "../src/utils/normalizeImproveResult.js";

test("ask and question modes normalize to a non-executable ask response", () => {
  for (const rawMode of ["ask", "question"]) {
    const result = normalizeImproveResult({
      mode: rawMode,
      answer: "추가 정보가 필요합니다.",
      improvedPrompt: "실행되면 안 됨",
      questions: ["대상 독자는 누구인가요?"],
      ragStatus: "no_evidence",
    });
    assert.equal(result.mode, "ask");
    assert.equal(result.improvedPrompt, "");
    assert.equal(result.questions.length, 1);
    assert.equal(result.ragStatus, "no_evidence");
  }
});

test("structured and legacy questions are deduplicated", () => {
  const questions = mergeImproveQuestions(
    [{ field: "audience", question: "대상 독자는 누구인가요?", importance: "required" }],
    [{ field: " audience ", question: "  대상   독자는 누구인가요? " }],
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0].importance, "required");
});

test("ask hides copy and execute while improve keeps both actions", () => {
  assert.deepEqual(
    getMessageActionVisibility({ role: "assistant", mode: "ask", executablePrompt: "실행 금지" }),
    { copy: false, save: true, execute: false },
  );
  assert.deepEqual(
    getMessageActionVisibility({ role: "assistant", mode: "improve", executablePrompt: "개선된 프롬프트" }),
    { copy: true, save: true, execute: true },
  );
});

test("cancelled status messages never expose assistant actions", () => {
  assert.deepEqual(
    getMessageActionVisibility({ role: "assistant", isCancelled: true, content: "cancelled" }),
    { copy: false, save: false, execute: false },
  );
});

test("extension uses the shared executable policy for utility-only responses", () => {
  assert.equal(getMessageActionVisibility({ role: "assistant", mode: "improve", executablePrompt: "관련 기법 근거 없이 기본 방식으로 다듬었습니다." }).execute, false);
  assert.equal(getMessageActionVisibility({ role: "assistant", mode: "improve", executablePrompt: "신규 사용자를 위한 안내문을 작성하세요." }).execute, true);
});

test("ask turn and user clarification are preserved in guest history", () => {
  const history = buildImproveHistory([
    { role: "user", content: "글을 써줘" },
    { role: "assistant", mode: "ask", answer: "대상 독자는 누구인가요?" },
    { role: "user", content: "신입 개발자입니다." },
    { role: "assistant", content: "제외", excludeFromHistory: true },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "글을 써줘" },
    { role: "assistant", content: "대상 독자는 누구인가요?" },
    { role: "user", content: "신입 개발자입니다." },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createAssistantMessage, createImproveErrorMessage, createUserMessage, upsertRecentThread } from "../src/conversation/conversationState.js";
import { getRequiredAskQuestions, isAskResponse } from "../src/conversation/askAnswers.js";
import { createGuestRetryContext } from "../src/conversation/messageRetry.js";

test("conversation state creates normalized ask and improve messages", () => {
  const ask = createAssistantMessage("draft", { mode: "ask", questions: [{ question: "Audience?" }] });
  const improve = createAssistantMessage("draft", { mode: "improve", improvedPrompt: "result" });
  assert.equal(ask.executablePrompt, null);
  assert.equal(improve.executablePrompt, "result");
  assert.equal(createUserMessage("draft").role, "user");
});

test("conversation state preserves no-evidence status for assistant rendering", () => {
  const message = createAssistantMessage("draft", {
    mode: "improve",
    improvedPrompt: "fallback result",
    ragStatus: "no_evidence",
  });

  assert.equal(message.ragStatus, "no_evidence");
  assert.equal(message.content, "fallback result");
  assert.equal(message.executablePrompt, "fallback result");
  assert.equal(message.excludeFromHistory, true);
});

test("ask and retry policies are pure and preserve prior history", () => {
  const questions = [{ question: "Required", importance: "required" }, { question: "Optional" }];
  assert.equal(isAskResponse({ mode: "ask" }), true);
  assert.deepEqual(getRequiredAskQuestions({ questions }), [questions[0]]);
  const retry = createGuestRetryContext([{ id: "u1", role: "user", content: "old" }, { id: "a1", role: "assistant", content: "answer" }], "u1", "new");
  assert.equal(retry.editedUserMessage.content, "new");
  assert.deepEqual(retry.baseMessages, []);
});

test("recent and error state transitions stay deterministic", () => {
  const recent = upsertRecentThread([{ id: "old" }], { id: "new", prompt: "draft", messages: [], makeTitle: (value) => value });
  assert.deepEqual(recent.map((item) => item.id), ["new", "old"]);
  assert.equal(createImproveErrorMessage("draft", new TypeError("offline")).excludeFromHistory, true);
});

test("conversation orchestration keeps request ask and retry ownership in focused hooks", () => {
  const src = path.resolve(import.meta.dirname, "../src");
  const conversation = fs.readFileSync(path.join(src, "hooks/useConversation.js"), "utf8");
  const request = fs.readFileSync(path.join(src, "hooks/useMakeRequest.js"), "utf8");
  const main = fs.readFileSync(path.join(src, "main.jsx"), "utf8");
  assert.doesNotMatch(conversation, /requestPromptImprove/);
  assert.match(request, /requestPromptImprove/);
  assert.match(conversation, /useMessageRetry/);
  assert.match(main, /useAskAnswers/);
});

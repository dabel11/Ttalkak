import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { AssistantResponse } from "../src/components/AssistantResponse";
import { createAssistantMessage } from "../src/conversation/conversationState";
import { getMessageActionVisibility } from "../src/utils/messageActions";

afterEach(() => cleanup());

function example(extra = {}) {
  return {
    role: "assistant",
    mode: "improve",
    content: "지원자의 판단 과정을 설명하도록 요청하라.",
    improvedPrompt: "지원자의 판단 근거를 바탕으로 600자 자기소개서를 작성하라.",
    executablePrompt: "지원자의 판단 근거를 바탕으로 600자 자기소개서를 작성하라.",
    questions: [],
    fields: [],
    changes: [],
    techniques: [],
    ...extra,
  };
}

describe("graduation demo: actionable improvement and natural optional follow-up", () => {
  test("shows the already-generated question visibly rather than only inside details", () => {
    const message = example({
      questions: [{
        field: "cache_rationale",
        question: "여러 대안 중 캐시를 선택한 이유는 무엇인가요?",
        importance: "recommended",
      }],
    });
    render(createElement(AssistantResponse, { message, isAsk: false }));
    expect(screen.getByText("여러 대안 중 캐시를 선택한 이유는 무엇인가요?")).toBeTruthy();
    expect(screen.getByText(/기존 개선안도 그대로 사용할 수 있습니다/)).toBeTruthy();
  });

  test("shows an existing model-authored question from improvement notes when structured questions are missing", () => {
    const message = example({
      changes: ["왜 Redis 대신 인메모리 캐시를 선택했나요?"],
    });
    render(createElement(AssistantResponse, { message, isAsk: false }));
    expect(screen.getByText("왜 Redis 대신 인메모리 캐시를 선택했나요?")).toBeTruthy();
  });

  test("prompts for one missing factual field without inventing an answer", () => {
    const message = example({
      fields: [{ name: "지원자 판단 과정 및 근거", role: "fact", status: "empty" }],
    });
    render(createElement(AssistantResponse, { message, isAsk: false }));
    expect(screen.getByText("지원자 판단 과정 및 근거에 대해 조금 더 구체적으로 설명해 주시겠어요?")).toBeTruthy();
    expect(screen.getByText("지원자 판단 과정 및 근거")).toBeTruthy();
  });

  test("explicitly improved prompt remains copyable and executable even if it mentions 확인이 필요", () => {
    const prompt = "작성되지 않은 성과 수치는 확인이 필요하므로 지어내지 말고, 기존 사실을 활용해 자기소개서 작성하라.";
    const result = createAssistantMessage("자기소개서 써줘", {
      mode: "improve", improvedPrompt: prompt, answer: "프롬프트를 개선했습니다.",
      questions: [{ field: "evidence", question: "이 방법을 고른 이유는?", importance: "recommended" }],
      fields: [{ name: "경험", status: "empty", role: "fact" }],
    });
    expect(result.executablePrompt).toBe(prompt);
    expect(result.improvedPrompt).toBe(prompt);
    expect(getMessageActionVisibility(result)).toEqual({ copy: true, save: true, execute: true });
  });

  test("ask-only and text-only messages never advertise an unusable copy or execute button", () => {
    expect(getMessageActionVisibility(example({
      mode: "ask", improvedPrompt: "", executablePrompt: "",
      questions: [{ field: "reason", question: "왜 캐시를 선택했나요?", importance: "required" }],
    }))).toEqual({ copy: false, save: true, execute: false });
    expect(getMessageActionVisibility(example({
      improvedPrompt: "", executablePrompt: "", content: "추가 정보가 필요합니다.",
    }))).toEqual({ copy: false, save: true, execute: false });
  });
});

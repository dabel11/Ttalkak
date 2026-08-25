import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement, Fragment } from "react";

const api = vi.hoisted(() => ({
  improve: vi.fn(),
  deleteThread: vi.fn(),
  getThread: vi.fn(),
  getThreads: vi.fn(),
}));

vi.mock("../src/api/prompts", () => ({ requestPromptImprove: api.improve }));
vi.mock("../src/api/make", () => ({
  deleteMakeThread: api.deleteThread,
  requestMakeThread: api.getThread,
  requestMakeThreads: api.getThreads,
}));
vi.mock("../src/storage/extensionStorage", () => ({
  getOrCreateSessionUuid: vi.fn(async () => "session-test"),
  loadStorage: vi.fn((_key, fallback) => fallback),
  saveStorage: vi.fn(),
}));

import { useConversation } from "../src/hooks/useConversation";
import { AssistantResponse } from "../src/components/AssistantResponse";
import { Composer } from "../src/components/Composer";
import { useAskAnswers } from "../src/hooks/useAskAnswers";
import { ChatFeed } from "../src/components/ChatFeed";
import { RecentList } from "../src/components/SavedList";
import { createDelayedImproveFixture } from "./fixtures/delayedImprove";
import { createAssistantMessage } from "../src/conversation/conversationState";

function createProps(overrides = {}) {
  return {
    authSession: null,
    executeTarget: "chatgpt",
    ragConfig: { backendApiUrl: "https://api.example.test" },
    sessionUuid: "session-test",
    setAuthMode: vi.fn(),
    setSavedItems: vi.fn(),
    setSessionUuid: vi.fn(),
    showNotice: vi.fn(),
    onAuthExpired: vi.fn(),
    ...overrides,
  };
}

function improveResponse(answer = "improved") {
  return {
    mode: "improve",
    answer,
    improvedPrompt: answer,
    questions: [],
    fields: [],
    changes: [],
    techniques: [],
    sources: [],
    ragStatus: "connected",
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  api.improve.mockReset();
  api.getThread.mockReset();
  api.getThreads.mockReset();
  api.deleteThread.mockReset();
  api.getThreads.mockResolvedValue([]);
});

describe("Extension improve request behavior", () => {
  test("logged-in follow-up retries reuse one request id without duplicating the user turn", async () => {
    api.getThreads.mockResolvedValue([]);
    const unavailable = Object.assign(new Error("unavailable"), { status: 503, code: "AI_SERVICE_UNAVAILABLE" });
    api.improve.mockRejectedValueOnce(unavailable).mockResolvedValueOnce({
      ...improveResponse("stored response"), requestId: "server-echo", replayed: true, threadId: "42",
    });
    api.getThread.mockRejectedValueOnce(unavailable).mockResolvedValue({
      id: "42", serverId: "42", messages: [
        { id: "user-original", role: "user", content: "original" },
        { id: "user-follow-up", role: "user", content: "follow up" },
        { id: "assistant-follow-up", role: "assistant", content: "stored response" },
      ],
    });
    const { result } = renderHook(() => useConversation(createProps({ authSession: { accessToken: "token" } })));
    act(() => result.current.openRecentThread({ id: "42", messages: [{ id: "user-original", role: "user", content: "original" }] }));
    act(() => result.current.setComposerValue("follow up"));
    await act(async () => { await result.current.submitPrompt(); });
    const errorMessage = result.current.messages.find((message) => message.isError);
    expect(errorMessage?.requestId).toBeTruthy();

    act(() => expect(result.current.prepareFailedRetry(errorMessage)).toBe(true));
    await act(async () => { await result.current.submitPrompt(); });

    expect(api.improve.mock.calls[0][1].requestId).toBe(errorMessage.requestId);
    expect(api.improve.mock.calls[1][1].requestId).toBe(errorMessage.requestId);
    expect(result.current.messages.filter((message) => message.role === "user" && message.content === "follow up")).toHaveLength(1);
  });

  test("ask follow-up requests on a server thread receive a bounded request id", async () => {
    api.getThreads.mockResolvedValue([]);
    api.improve.mockResolvedValue({ ...improveResponse("answer result"), threadId: "42" });
    api.getThread.mockResolvedValue({ id: "42", serverId: "42", messages: [] });
    const { result } = renderHook(() => useConversation(createProps({ authSession: { accessToken: "token" } })));
    act(() => result.current.openRecentThread({ id: "42", messages: [{ id: "ask-1", role: "assistant", mode: "ask", content: "질문" }] }));
    act(() => result.current.setComposerValue("추가 정보 답변"));
    await act(async () => { await result.current.submitPrompt(); });
    expect(api.improve.mock.calls[0][1]).toMatchObject({ threadId: 42, prompt: "추가 정보 답변" });
    expect(api.improve.mock.calls[0][1].requestId.length).toBeLessThanOrEqual(128);
  });

  test("server edit retries preserve the id for identical content and rotate it after another edit", async () => {
    const unavailable = Object.assign(new Error("unavailable"), { status: 503, code: "AI_SERVICE_UNAVAILABLE" });
    api.improve.mockRejectedValueOnce(unavailable).mockRejectedValueOnce(unavailable).mockResolvedValueOnce(improveResponse("done"));
    api.getThread.mockRejectedValue(unavailable);
    const { result } = renderHook(() => useConversation(createProps({ authSession: { accessToken: "token" } })));
    const user = { id: "31", role: "user", content: "old" };
    act(() => result.current.openRecentThread({ id: "42", messages: [user] }));

    for (const value of ["edited", "edited", "edited again"]) {
      act(() => result.current.startEditMessage(user));
      act(() => result.current.setEditingDraft(value));
      await act(async () => { await result.current.submitEditedMessage({ preventDefault() {} }, user.id); });
    }

    const ids = api.improve.mock.calls.map((call) => call[1].requestId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  test("request-id conflicts refresh the server conversation and do not add retryable errors", async () => {
    api.getThreads.mockResolvedValue([]);
    api.improve.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409, code: "REQUEST_ID_REUSED" }));
    api.getThread.mockResolvedValue({ id: "42", serverId: "42", messages: [{ id: "server-user", role: "user", content: "canonical" }] });
    const props = createProps({ authSession: { accessToken: "token" } });
    const { result } = renderHook(() => useConversation(props));
    act(() => result.current.openRecentThread({ id: "42", messages: [] }));
    act(() => result.current.setComposerValue("conflicting prompt"));
    await act(async () => { await result.current.submitPrompt(); });
    expect(api.getThread).toHaveBeenCalledWith(props.ragConfig, "42", "token");
    expect(result.current.messages.some((message) => message.isError)).toBe(false);
    expect(props.showNotice).toHaveBeenCalledWith(expect.stringMatching(/새로고침/));
  });

  test("opening and clearing a restored recent thread keeps the active selection in conversation state", () => {
    const { result } = renderHook(() => useConversation(createProps()));
    const restored = { id: "restored-thread", messages: [{ id: "user-restored", role: "user", content: "restored" }] };

    act(() => result.current.openRecentThread(restored));
    expect(result.current.activeRecentId).toBe(restored.id);
    expect(result.current.messages).toEqual(restored.messages);

    act(() => result.current.startNewChat());
    expect(result.current.activeRecentId).toBe("");
  });

  test("deleting an active numeric local recent thread clears its normalized selection and restored messages", () => {
    const { result } = renderHook(() => useConversation(createProps()));
    const restored = { id: 12, messages: [{ id: "user-restored", role: "user", content: "restored" }] };
    let confirmation;

    act(() => result.current.openRecentThread(restored));
    act(() => result.current.requestDeleteRecentThread(restored.id, (value) => { confirmation = value; }));
    act(() => confirmation.onConfirm());

    expect(result.current.activeRecentId).toBe("");
    expect(result.current.messages).toEqual([]);
  });

  test("the actual improve API applies 90 seconds and composes the caller signal", async () => {
    const { requestPromptImprove: requestPromptImproveActual } = await vi.importActual("../src/api/prompts.js");
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const external = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(improveResponse()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await requestPromptImproveActual(
      { backendApiUrl: "https://api.example.test" },
      { prompt: "draft", requestId: "request-api-boundary" },
      { signal: external.signal },
    );

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 90_000);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/prompts/improve",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
      prompt: "draft",
      requestId: "request-api-boundary",
    });
  });

  test("initial and ask follow-up cancellation immediately restores input and ignores a late response", async () => {
    const metrics = [];
    const collectMetric = (event) => metrics.push(event.detail);
    globalThis.window.addEventListener("ttalkak:observability", collectMetric);
    const request = createDelayedImproveFixture();
    api.improve.mockReturnValue(request.promise);
    const props = createProps();
    const { result } = renderHook(() => useConversation(props));

    act(() => result.current.setComposerValue("follow-up answer"));
    let submission;
    act(() => { submission = result.current.submitPrompt(); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    expect(api.improve.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);

    act(() => expect(result.current.cancelImproveRequest()).toBe(true));
    expect(metrics.filter((metric) => metric.code === "REQUEST_ABORTED")).toHaveLength(1);
    expect(metrics.find((metric) => metric.code === "REQUEST_ABORTED")).toMatchObject({
      outcome: "cancel", retryable: false,
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("follow-up answer");
    expect(props.showNotice).toHaveBeenCalledWith(
      "요청을 취소했습니다. 입력한 내용은 입력란에 복원되었습니다.",
    );
    expect(result.current.messages.at(-1)).toMatchObject({
      content: "요청을 취소했습니다. 입력한 내용은 입력란에 복원되었습니다.",
      isCancelled: true,
      isError: false,
      excludeFromHistory: true,
    });

    request.resolve(improveResponse("late response"));
    await act(async () => { await submission; });
    expect(result.current.messages.some((message) => message.content === "late response")).toBe(false);
    expect(metrics.filter((metric) => metric.code === "REQUEST_ABORTED")).toHaveLength(1);
    globalThis.window.removeEventListener("ttalkak:observability", collectMetric);
  });

  test("guest edited resend uses a signal and restores the edited prompt when cancelled", async () => {
    const metrics = [];
    const collectMetric = (event) => metrics.push(event.detail);
    globalThis.window.addEventListener("ttalkak:observability", collectMetric);
    const request = createDelayedImproveFixture();
    api.improve.mockReturnValue(request.promise);
    const { result } = renderHook(() => useConversation(createProps()));
    const userMessage = { id: "user-1", role: "user", content: "old" };

    act(() => result.current.openRecentThread({ id: "local-1", messages: [userMessage] }));
    act(() => result.current.startEditMessage(userMessage));
    act(() => result.current.setEditingDraft("edited guest prompt"));
    let submission;
    act(() => { submission = result.current.submitEditedMessage({ preventDefault() {} }, "user-1"); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    expect(metrics.filter((metric) => metric.code === "USER_RETRY")).toHaveLength(1);
    expect(api.improve.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);

    act(() => result.current.cancelImproveRequest());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("edited guest prompt");
    request.resolve(improveResponse("late guest response"));
    await act(async () => { await submission; });
    expect(result.current.messages.some((message) => message.content === "late guest response")).toBe(false);
    globalThis.window.removeEventListener("ttalkak:observability", collectMetric);
  });

  test("guest edited resend creates and selects its new recent thread through the shared setter", async () => {
    api.improve.mockResolvedValue(improveResponse("edited response"));
    const { result } = renderHook(() => useConversation(createProps()));
    const userMessage = { id: "user-new-thread", role: "user", content: "old" };

    act(() => result.current.openPrompt({ messages: [userMessage] }));
    act(() => result.current.startEditMessage(userMessage));
    act(() => result.current.setEditingDraft("edited into a new thread"));
    await act(async () => { await result.current.submitEditedMessage({ preventDefault() {} }, userMessage.id); });

    expect(result.current.activeRecentId).toMatch(/^thread-/);
    expect(result.current.messages.at(-1)?.content).toBe("edited response");
  });

  test("server refresh canonicalizes the selected recent thread through the shared setter", async () => {
    api.improve.mockResolvedValue(improveResponse("server edited response"));
    api.getThreads.mockResolvedValue([]);
    api.getThread.mockResolvedValue({
      id: "server-record",
      serverId: "44",
      messages: [{ id: "server-user", role: "user", content: "server edit" }],
    });
    const { result } = renderHook(() => useConversation(createProps({ authSession: { accessToken: "token" } })));
    const userMessage = { id: "31", role: "user", content: "old server prompt" };

    act(() => result.current.openRecentThread({ id: "12", messages: [userMessage] }));
    act(() => result.current.startEditMessage(userMessage));
    act(() => result.current.setEditingDraft("server edit"));
    await act(async () => { await result.current.submitEditedMessage({ preventDefault() {} }, userMessage.id); });

    expect(result.current.activeRecentId).toBe("44");
    expect(result.current.messages).toEqual([{ id: "server-user", role: "user", content: "server edit" }]);
  });

  test("logged-in edited resend uses the same cancellable lifecycle", async () => {
    const request = createDelayedImproveFixture();
    api.improve.mockReturnValue(request.promise);
    api.getThreads.mockResolvedValue([]);
    const props = createProps({ authSession: { accessToken: "token" } });
    const { result } = renderHook(() => useConversation(props));
    const userMessage = { id: "31", role: "user", content: "old server prompt" };

    act(() => result.current.openRecentThread({ id: "12", messages: [userMessage] }));
    act(() => result.current.startEditMessage(userMessage));
    act(() => result.current.setEditingDraft("edited server prompt"));
    let submission;
    act(() => { submission = result.current.submitEditedMessage({ preventDefault() {} }, "31"); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    expect(api.improve.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);

    act(() => result.current.cancelImproveRequest());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("edited server prompt");
    request.resolve(improveResponse("late server response"));
    await act(async () => { await submission; });
    expect(api.getThread).not.toHaveBeenCalled();
  });

  test("failed assistant messages are excluded from the next guest history", async () => {
    api.improve.mockRejectedValueOnce(Object.assign(new Error("unavailable"), {
      status: 503,
      code: "AI_SERVICE_UNAVAILABLE",
    }));
    const nextRequest = createDelayedImproveFixture();
    api.improve.mockReturnValueOnce(nextRequest.promise);
    const { result } = renderHook(() => useConversation(createProps()));

    act(() => result.current.setComposerValue("first"));
    await act(async () => { await result.current.submitPrompt(); });
    expect(result.current.messages.some((message) => message.isError)).toBe(true);

    act(() => result.current.setComposerValue("second"));
    let submission;
    act(() => { submission = result.current.submitPrompt(); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledTimes(2));
    const history = api.improve.mock.calls[1][1].history;
    expect(history.some((message) => message.role === "assistant" && /unavailable/i.test(message.content))).toBe(false);

    act(() => result.current.cancelImproveRequest());
    nextRequest.resolve(improveResponse());
    await act(async () => { await submission; });
  });

  test("closing the side panel aborts the active request and rejects its late response", async () => {
    const request = createDelayedImproveFixture();
    api.improve.mockReturnValue(request.promise);
    const { result, unmount } = renderHook(() => useConversation(createProps()));

    act(() => result.current.setComposerValue("close while waiting"));
    let submission;
    act(() => { submission = result.current.submitPrompt(); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    const signal = api.improve.mock.calls[0][2].signal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);

    request.resolve(improveResponse("response after close"));
    await act(async () => { await submission; });
  });
});

describe("Extension clarification UI", () => {
  test("recent conversations remain selected through either their client id or server id", () => {
    render(createElement(RecentList, {
      items: [{ id: "client-record", serverId: 44, title: "Server conversation", createdAt: Date.now(), time: "방금" }],
      activeId: "44",
      onOpenThread() {},
      onDelete() {},
    }));

    expect(screen.getByRole("button", { name: /Server conversation/ }).getAttribute("aria-current")).toBe("true");
  });

  test("long-running progress exposes its changing stage and elapsed time to assistive technology", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
    globalThis.HTMLElement.prototype.scrollTo = vi.fn();
    render(createElement(ChatFeed, {
      messages: [], isLoading: true, copiedId: null, canEditUserMessages: true,
      editingMessageId: null, editingDraft: "", onCopy() {}, onSave() {}, onExecute() {},
      onStartEdit() {}, onChangeEditDraft() {}, onCancelEdit() {}, onSubmitEdit() {},
      onCancelRequest() {}, onSelectExample() {}, onResolveError() {},
    }));
    const status = screen.getByRole("status");
    expect(status.hasAttribute("aria-label")).toBe(false);
    expect(status.textContent).toContain("요청을 분석하고 있습니다0초");

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(status.textContent).toContain("참고 자료를 확인하고 있습니다9초");
  });

  test.each([
    [{ kind: "network", retryable: true }, "연결 확인 후 다시 시도"],
    [{ kind: "auth", requiresLogin: true, retryable: false }, "로그인"],
  ])("error actions render from the shared UX policy", (failure, label) => {
    globalThis.HTMLElement.prototype.scrollTo = vi.fn();
    const onResolveError = vi.fn();
    const message = {
      id: `error-${failure.kind}`,
      role: "assistant",
      content: "요청을 처리하지 못했습니다.",
      isError: true,
      failure,
    };
    render(createElement(ChatFeed, {
      messages: [message], isLoading: false, copiedId: null, canEditUserMessages: true,
      editingMessageId: null, editingDraft: "", onCopy() {}, onSave() {}, onExecute() {},
      onStartEdit() {}, onChangeEditDraft() {}, onCancelEdit() {}, onSubmitEdit() {},
      onCancelRequest() {}, onSelectExample() {}, onResolveError,
    }));

    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onResolveError).toHaveBeenCalledWith(message);
  });

  test("ask answer state focuses the composer through its dedicated hook", async () => {
    const focus = vi.fn();
    renderHook(() => useAskAnswers({
      messages: [{ id: "ask-1", role: "assistant", mode: "ask" }],
      isLoading: false,
      composerRef: { current: { focus } },
    }));
    await waitFor(() => expect(focus).toHaveBeenCalledOnce());
  });

  test("a delayed fixture exposes cancellation and permits an immediate resend", async () => {
    globalThis.HTMLElement.prototype.scrollTo = vi.fn();
    const firstRequest = createDelayedImproveFixture();
    api.improve
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(improveResponse("second response"));
    const props = createProps();
    const { result } = renderHook(() => useConversation(props));

    act(() => result.current.setComposerValue("first prompt"));
    let firstSubmission;
    act(() => { firstSubmission = result.current.submitPrompt(); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    render(createElement(ChatFeed, {
      messages: result.current.messages,
      isLoading: result.current.isLoading,
      copiedId: null,
      canEditUserMessages: true,
      editingMessageId: null,
      editingDraft: "",
      onCopy() {}, onSave() {}, onExecute() {}, onStartEdit() {}, onChangeEditDraft() {},
      onCancelEdit() {}, onSubmitEdit() {}, onCancelRequest: result.current.cancelImproveRequest,
      onSelectExample() {},
    }));
    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("first prompt");

    act(() => result.current.setComposerValue("second prompt"));
    await act(async () => { await result.current.submitPrompt(); });
    expect(api.improve).toHaveBeenCalledTimes(2);
    expect(result.current.messages.some((message) => message.content === "second response")).toBe(true);

    firstRequest.resolve(improveResponse("late first response"));
    await act(async () => { await firstSubmission; });
    expect(result.current.messages.some((message) => message.content === "late first response")).toBe(false);
  });

  test("an unchanged no-evidence result renders guidance without an empty action area", () => {
    globalThis.HTMLElement.prototype.scrollTo = vi.fn();
    const message = createAssistantMessage("same prompt", {
      mode: "improve",
      improvedPrompt: "same prompt",
      ragStatus: "no_evidence",
    });
    const onRefineUnchanged = vi.fn();
    const { container } = render(createElement(ChatFeed, {
      messages: [message],
      isLoading: false,
      copiedId: null,
      canEditUserMessages: true,
      editingMessageId: null,
      editingDraft: "",
      onCopy() {}, onSave() {}, onExecute() {}, onStartEdit() {}, onChangeEditDraft() {},
      onCancelEdit() {}, onSubmitEdit() {}, onCancelRequest() {}, onSelectExample() {},
      onRefineUnchanged,
    }));

    expect(screen.getByText("적용할 수 있는 변경 사항을 찾지 못했습니다. 내용을 구체화해서 다시 요청해 주세요.")).toBeTruthy();
    expect(container.querySelector(".card-actions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내용을 구체화하기" }));
    expect(onRefineUnchanged).toHaveBeenCalledWith(message);
  });

  test("ask guidance labels required questions and points the composer at the answer", () => {
    render(createElement(
      Fragment,
      null,
      createElement(AssistantResponse, {
        isAsk: true,
        message: {
          mode: "ask",
          summary: "추가 정보가 필요합니다.",
          questions: [{ question: "대상 독자는 누구인가요?", importance: "required" }],
        },
      }),
      createElement(Composer, {
        value: "",
        onChange() {},
        onSubmit() {},
        disabled: false,
        onNewChat() {},
        hasMessages: true,
        answeringQuestions: true,
      }),
    ));

    expect(screen.getByText("아래 질문을 확인한 뒤 하단 입력란에 답변해 주세요.")).toBeTruthy();
    expect(screen.getByLabelText("필수 질문: 대상 독자는 누구인가요?")).toBeTruthy();
    expect(screen.getByLabelText("추가 질문 답변 입력").getAttribute("placeholder"))
      .toBe("위 질문에 대한 답변을 입력하세요...");
  });
});

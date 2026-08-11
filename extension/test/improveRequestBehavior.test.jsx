import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
  api.improve.mockReset();
  api.getThread.mockReset();
  api.getThreads.mockReset();
  api.deleteThread.mockReset();
  api.getThreads.mockResolvedValue([]);
});

describe("Extension improve request behavior", () => {
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
      { prompt: "draft" },
      { signal: external.signal },
    );

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 90_000);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/prompts/improve",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("initial and ask follow-up cancellation immediately restores input and ignores a late response", async () => {
    const request = deferred();
    api.improve.mockReturnValue(request.promise);
    const { result } = renderHook(() => useConversation(createProps()));

    act(() => result.current.setComposerValue("follow-up answer"));
    let submission;
    act(() => { submission = result.current.submitPrompt(); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    expect(api.improve.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);

    act(() => expect(result.current.cancelImproveRequest()).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("follow-up answer");
    expect(result.current.messages.at(-1)).toMatchObject({ isCancelled: true, excludeFromHistory: true });

    request.resolve(improveResponse("late response"));
    await act(async () => { await submission; });
    expect(result.current.messages.some((message) => message.content === "late response")).toBe(false);
  });

  test("guest edited resend uses a signal and restores the edited prompt when cancelled", async () => {
    const request = deferred();
    api.improve.mockReturnValue(request.promise);
    const { result } = renderHook(() => useConversation(createProps()));
    const userMessage = { id: "user-1", role: "user", content: "old" };

    act(() => result.current.openRecentThread({ id: "local-1", messages: [userMessage] }));
    act(() => result.current.startEditMessage(userMessage));
    act(() => result.current.setEditingDraft("edited guest prompt"));
    let submission;
    act(() => { submission = result.current.submitEditedMessage({ preventDefault() {} }, "user-1"); });
    await waitFor(() => expect(api.improve).toHaveBeenCalledOnce());
    expect(api.improve.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);

    act(() => result.current.cancelImproveRequest());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.composerValue).toBe("edited guest prompt");
    request.resolve(improveResponse("late guest response"));
    await act(async () => { await submission; });
    expect(result.current.messages.some((message) => message.content === "late guest response")).toBe(false);
  });

  test("logged-in edited resend uses the same cancellable lifecycle", async () => {
    const request = deferred();
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
    const nextRequest = deferred();
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
    const request = deferred();
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

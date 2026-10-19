import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";

const savedApi = vi.hoisted(() => ({
  request: vi.fn(),
  save: vi.fn(),
  unsave: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  load: vi.fn((_key, fallback) => fallback),
  save: vi.fn(),
}));

vi.mock("../src/api/saved", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requestSavedPrompts: savedApi.request,
    savePrompt: savedApi.save,
    unsavePrompt: savedApi.unsave,
  };
});
vi.mock("../src/storage/extensionStorage", () => ({
  loadStorage: storage.load,
  saveStorage: storage.save,
}));

import { Sidebar } from "../src/components/Sidebar";
import { PromptList } from "../src/components/SavedList";
import { PROMPT_LIBRARY, STORAGE } from "../src/constants";
import { useSavedLibrary } from "../src/hooks/useSavedLibrary";

function createLibraryProps(overrides = {}) {
  return {
    authSession: { accessToken: "token" },
    query: "",
    ragConfig: { backendApiUrl: "http://localhost:8080" },
    showNotice: vi.fn(),
    setConfirmAction: vi.fn(),
    onAuthExpired: vi.fn(),
    ...overrides,
  };
}

function createSidebarProps(overrides = {}) {
  return {
    activeTab: "saved",
    setActiveTab: vi.fn(),
    collapsed: false,
    setCollapsed: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    searchItems: [],
    savedItems: [],
    recentItems: [],
    activeRecentId: "",
    savedStatus: "server",
    isSaved: vi.fn(() => false),
    isSavePending: vi.fn(() => false),
    onOpenPrompt: vi.fn(),
    onSavePrompt: vi.fn(),
    onRetrySaved: vi.fn(),
    onOpenRecentThread: vi.fn(),
    onDeleteSaved: vi.fn(),
    onDeleteRecent: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  savedApi.request.mockResolvedValue([]);
  savedApi.save.mockResolvedValue({});
  savedApi.unsave.mockResolvedValue({});
  storage.load.mockImplementation((_key, fallback) => fallback);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("extension saved library states", () => {
  test("signed-in members can keep built-in library prompts on this device", async () => {
    const props = createLibraryProps();
    const { result } = renderHook(() => useSavedLibrary(props));
    await waitFor(() => expect(result.current.savedStatus).toBe("server"));

    await act(async () => { await result.current.saveLibraryPrompt(PROMPT_LIBRARY[0]); });

    expect(savedApi.save).not.toHaveBeenCalled();
    expect(result.current.isSaved(PROMPT_LIBRARY[0])).toBe(true);
    expect(result.current.filteredSavedItems.map((item) => item.id)).toContain(PROMPT_LIBRARY[0].id);
    expect(props.showNotice).toHaveBeenCalledWith("이 기기 보관함에 저장했습니다.");
    expect(storage.save).toHaveBeenLastCalledWith(STORAGE.SAVED, expect.arrayContaining([
      expect.objectContaining({ id: PROMPT_LIBRARY[0].id }),
    ]));
  });

  test("server save operations expose a pending state and reject duplicate clicks", async () => {
    let releaseSave;
    const deferredSave = new Promise((resolve) => { releaseSave = resolve; });
    const item = { id: "42", promptId: "42", title: "서버 프롬프트", content: "내용" };
    savedApi.save.mockReturnValueOnce(deferredSave);
    savedApi.request.mockResolvedValueOnce([]).mockResolvedValueOnce([item]);
    const { result } = renderHook(() => useSavedLibrary(createLibraryProps()));
    await waitFor(() => expect(result.current.savedStatus).toBe("server"));

    let operation;
    act(() => { operation = result.current.saveLibraryPrompt(item); });
    await waitFor(() => expect(result.current.isSavePending(item)).toBe(true));
    await act(async () => { await result.current.saveLibraryPrompt(item); });
    expect(savedApi.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseSave({});
      await operation;
    });
    expect(result.current.isSavePending(item)).toBe(false);
    expect(result.current.isSaved(item)).toBe(true);
  });

  test("collapsed sidebar content is removed from keyboard and accessibility navigation", () => {
    const { container, rerender } = render(createElement(Sidebar, createSidebarProps({ collapsed: true })));
    const content = container.querySelector(".sidebar-content");
    expect(content.hasAttribute("inert")).toBe(true);
    expect(content.getAttribute("aria-hidden")).toBe("true");

    rerender(createElement(Sidebar, createSidebarProps({ collapsed: false })));
    expect(content.hasAttribute("inert")).toBe(false);
    expect(content.hasAttribute("aria-hidden")).toBe(false);
  });

  test("saved library reports loading and errors and lets the member retry", () => {
    const onRetrySaved = vi.fn();
    const view = render(createElement(Sidebar, createSidebarProps({ savedStatus: "loading", onRetrySaved })));
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");

    view.rerender(createElement(Sidebar, createSidebarProps({ savedStatus: "error", onRetrySaved })));
    expect(screen.getByRole("alert").textContent).toContain("불러오지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetrySaved).toHaveBeenCalledOnce();
  });

  test("prompt save buttons announce and block an in-progress mutation", () => {
    const item = { id: "42", title: "서버 프롬프트", preview: "미리보기" };
    render(createElement(PromptList, {
      items: [item], emptyText: "없음", mode: "search", isSavePending: () => true,
      onOpenPrompt: vi.fn(), onSavePrompt: vi.fn(),
    }));

    const pending = screen.getByRole("button", { name: "처리 중" });
    expect(pending.disabled).toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(pending.textContent).toContain("처리 중");
  });
});

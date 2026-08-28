const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const API_PATTERN = "http://localhost:8080/**";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

async function stabilizeVisuals(page) {
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition: none !important;
      caret-color: transparent !important;
    }
  ` });
}

async function expectComponentScreenshot(locator, name) {
  await expect(locator).toHaveScreenshot(name, {
    animations: "disabled",
    maxDiffPixelRatio: 0.08,
    threshold: 0.3,
  });
}

async function setVisualFrame(locator, { width, height = "auto" }) {
  await locator.evaluate((element, frame) => {
    element.style.width = frame.width;
    element.style.height = frame.height;
    element.style.overflow = "hidden";
    element.style.boxSizing = "border-box";
  }, { width, height });
}

const askMessage = {
  id: "assistant-ask",
  role: "assistant",
  mode: "ask",
  summary: "Please provide a little more information.",
  questions: [
    { field: "purpose", question: "What is the purpose?", importance: "required", reason: "This determines the output structure." },
    { field: "audience", question: "Who is the audience?", importance: "recommended" },
  ],
};

function persistedState(messages = [], extra = {}) {
  const threadId = extra.activeThreadId || (messages.length ? "fixture-thread" : null);
  const recentThreads = extra.recentThreads || (threadId
    ? [{ id: threadId, title: "Fixture conversation", preview: "Fixture", folderId: "uncategorized", createdAt: 1, messages }]
    : []);
  return JSON.stringify({
    state: {
      guestImproveCount: 0,
      messages,
      recentThreads,
      activeThreadId: threadId,
      activeFolderId: "all",
      makeFolders: [{ id: "uncategorized", name: "Uncategorized" }],
      ...extra,
    },
  });
}

async function seedStorage(page, messages = [], extra = {}) {
  const value = persistedState(messages, extra);
  const token = String(extra.authToken || extra.token || "");
  await page.addInitScript(({ key, tokenKey, stored, token }) => {
    if (window.sessionStorage.getItem("__ttalkak_e2e_seeded__")) return;
    window.localStorage.clear();
    window.localStorage.setItem(key, stored);
    if (token) window.localStorage.setItem(tokenKey, token);
    window.sessionStorage.setItem("__ttalkak_e2e_seeded__", "true");
  }, { key: STORAGE_KEY, tokenKey: TOKEN_KEY, stored: value, token });
}

async function mockBackend(page, improveHandler = async (route) => route.fulfill({
  status: 200,
  headers: CORS_HEADERS,
  body: JSON.stringify({ mode: "improve", improvedPrompt: "A production-ready improved prompt." }),
}), fixtures = {}) {
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/prompts/improve") {
      await improveHandler(route);
      return;
    }
    const threadMatch = pathname.match(/^\/api\/make\/threads\/(\d+)$/);
    if (threadMatch && request.method() === "GET" && fixtures.threads) {
      if (fixtures.threadHandler) {
        await fixtures.threadHandler(route, threadMatch[1]);
        return;
      }
      const thread = fixtures.threads.find((item) => String(item.serverId || item.id) === threadMatch[1]);
      await route.fulfill({ status: thread ? 200 : 404, headers: CORS_HEADERS, body: JSON.stringify(thread || { code: "NOT_FOUND" }) });
      return;
    }
    if (pathname === "/api/make/threads" && request.method() === "GET" && fixtures.threads) {
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: fixtures.threads }) });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: [] }) });
  });
}

async function openMake(page, messages = [], extra = {}, improveHandler) {
  await seedStorage(page, messages, extra);
  await mockBackend(page, improveHandler, { threads: extra.backendThreads, threadHandler: extra.threadHandler });
  await gotoApp(page);
  await page.locator('[data-route="make"]').click();
  await expect(page.locator(".make-page")).toBeVisible();
}

test("ask questions render with required state and hide executable actions", async ({ page }) => {
  await openMake(page, [askMessage]);

  await expect(page.locator("[data-ask-answer-form]")).toBeVisible();
  await expect(page.locator("[data-ask-answer-input]")).toHaveCount(2);
  await expect(page.locator('[data-ask-answer-input][name="purpose"]')).toHaveAttribute("required", "");
  await expect(page.locator('[data-ask-answer-input][name="purpose"]')).toHaveAttribute("aria-required", "true");
  await expect(page.locator("[data-copy-message]")).toHaveCount(0);
  await expect(page.locator("[data-execute-message]")).toHaveCount(0);
});

test("required answers are validated and a complete answer transitions to improve", async ({ page }) => {
  await openMake(page, [askMessage]);
  const form = page.locator("[data-ask-answer-form]");
  const requiredInput = form.locator('[name="purpose"]');

  await form.locator('button[type="submit"]').press("Enter");
  await expect(requiredInput).toHaveAttribute("aria-invalid", "true");
  await expect(requiredInput).toBeFocused();

  await requiredInput.fill("Prepare a release announcement");
  await form.locator(".ask-optional-questions summary").click();
  await form.locator('[name="audience"]').fill("New users");
  const requestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/prompts/improve"));
  await form.locator('button[type="submit"]').press("Enter");
  const request = await requestPromise;
  const payload = request.postDataJSON();

  expect(payload.prompt).toContain("Prepare a release announcement");
  expect(payload.prompt).toContain("New users");
  await expect(page.locator("[data-copy-message]")).toHaveCount(1);
  await expect(page.locator("[data-execute-message]")).toHaveCount(1);
});

test("unchanged no-evidence response explains the outcome without result actions", async ({ page }) => {
  const prompt = "Create a detailed product launch strategy";
  await openMake(page, [], {}, async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mode: "improve", improvedPrompt: payload.prompt, ragStatus: "no_evidence" }),
    });
  });

  await page.locator('[data-composer] textarea[name="prompt"]').fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();

  await expect(page.getByText("적용할 수 있는 변경 사항을 찾지 못했습니다. 내용을 구체화해서 다시 요청해 주세요.")).toBeVisible();
  await expect(page.locator(".message-evidence-notice")).toBeVisible();
  await expect(page.locator(".message-result-prompt")).toHaveCount(0);
  await expect(page.locator(".message-actions")).toHaveCount(0);
  await page.getByRole("button", { name: "내용을 구체화하기" }).click();
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toHaveValue(prompt);
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
});

test("legacy questions migrate, empty messages disappear, and restored data survives reload", async ({ page }) => {
  const legacyMessages = [
    { id: "legacy-question", role: "assistant", type: "question", answer: "Please clarify\n- **Audience**: Who is the audience?" },
    { id: "legacy-empty", role: "assistant", content: "" },
  ];
  await openMake(page, legacyMessages);

  await expect(page.locator('[data-message-id="legacy-question"]')).toBeVisible();
  await expect(page.locator('[data-message-id="legacy-empty"]')).toHaveCount(0);
  await expect(page.locator("[data-ask-answer-input]")).toHaveCount(1);

  await page.reload();
  await page.locator('[data-route="make"]').click();
  await expect(page.locator('[data-message-id="legacy-question"]')).toBeVisible();
  await expect(page.locator('[data-message-id="legacy-empty"]')).toHaveCount(0);
});

test("recent conversation menu opens and closes through delegated events", async ({ page }) => {
  const messages = [{ id: "user-one", role: "user", content: "Fixture prompt" }];
  await openMake(page, messages);

  const menuButton = page.locator("[data-thread-menu]");
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".recent-thread-menu")).toBeVisible();

  await page.locator(".chat-feed").click({ position: { x: 10, y: 10 } });
  await expect(page.locator(".recent-thread-menu")).toHaveCount(0);
});

test("compact Make sidebar removes duplicate previews and exposes consistent create controls", async ({ page }) => {
  const messages = [{ id: "user-compact", role: "user", content: "중복 없는 대화" }];
  const thread = {
    id: "compact-thread",
    title: "중복 없는 대화",
    preview: "중복 없는 대화",
    folderId: "uncategorized",
    createdAt: Date.now(),
    messages,
  };
  await openMake(page, messages, { activeThreadId: thread.id, recentThreads: [thread] });

  const folderCreate = page.getByRole("button", { name: "새 폴더" });
  const chatCreate = page.getByRole("button", { name: "새 대화" });
  await expect(folderCreate).toHaveText("+");
  await expect(chatCreate).toHaveText("+");

  const recent = page.locator('[data-thread-item="compact-thread"]');
  await expect(recent.locator(".recent-thread-main span")).toHaveCount(0);
  await expect(recent.locator("small")).toContainText("오늘");
  await expect(recent).toHaveClass(/active/);
  await expect(page.locator(".make-side-title").first().locator("small")).toHaveText("2");
});

test("recent conversation search hides unmatched threads and empty date groups", async ({ page }) => {
  const now = Date.now();
  const threads = [
    { id: "today-thread", title: "Needle conversation", preview: "Today", folderId: "uncategorized", createdAt: now, messages: [] },
    { id: "yesterday-thread", title: "Yesterday conversation", preview: "Yesterday", folderId: "uncategorized", createdAt: now - 86_400_000, messages: [] },
    { id: "previous-thread", title: "Previous conversation", preview: "Previous", folderId: "uncategorized", createdAt: now - 172_800_000, messages: [] },
  ];
  await openMake(page, [], { recentThreads: threads, activeThreadId: null });

  await expect(page.locator(".recent-thread-group")).toHaveCount(3);
  await page.locator("[data-recent-thread-search]").fill("Needle");
  await expect(page.locator('[data-thread-item="today-thread"]')).toBeVisible();
  await expect(page.locator('[data-thread-item="yesterday-thread"]')).toBeHidden();
  await expect(page.locator('[data-thread-item="previous-thread"]')).toBeHidden();
  await expect(page.locator(".recent-thread-group:visible")).toHaveCount(1);
  await expect(page.locator(".recent-thread-group:visible")).toHaveText("오늘");
  await expect(page.locator("[data-recent-thread-search-status]")).toHaveText("검색 결과 1개");
  await expect(page.locator("[data-clear-recent-thread-search]").first()).toBeVisible();
  await page.locator("[data-clear-recent-thread-search]").first().click();
  await expect(page.locator("[data-recent-thread-search]")).toHaveValue("");
  await expect(page.locator("[data-recent-thread-search-status]")).toHaveText("전체 3개");

  await page.locator("[data-recent-thread-search]").fill("not found");
  await expect(page.locator("[data-recent-thread-search-empty]")).toBeVisible();
  await expect(page.locator("[data-recent-thread-search-status]")).toHaveText("검색 결과 0개");
  await page.locator("[data-recent-thread-search]").press("Escape");
  await expect(page.locator("[data-recent-thread-search]")).toHaveValue("");
  await expect(page.locator("[data-recent-thread-search-status]")).toHaveText("전체 3개");
  await expect(page.locator(".recent-thread")).toHaveCount(3);
});

test("long-running request status advances while the cancel action remains available", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-15T00:00:00Z") });
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  await openMake(page, [], {}, async (route) => {
    requestStarted();
    await release;
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ mode: "improve", improvedPrompt: "Completed" }) });
  });

  await page.locator('[data-composer] textarea[name="prompt"]').fill("Wait for staged status");
  await page.locator('[data-composer] button[type="submit"]').click();
  await started;
  await expect(page.locator("[data-make-progress-label]")).toHaveText("요청을 분석하고 있습니다");
  await page.clock.fastForward(9_000);
  await expect(page.locator("[data-make-progress-label]")).toHaveText("참고 자료를 확인하고 있습니다");
  await expect(page.locator("[data-make-progress-elapsed]")).toHaveText("9초");
  await expect(page.locator("[data-cancel-make-request]")).toBeVisible();
  releaseResponse();
});

test("template categories collapse immediately without a layout-animation state", async ({ page }) => {
  await openMake(page);

  const toggle = page.locator("[data-toggle-templates]");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".template-list")).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".template-list")).toHaveCount(0);
  await expect(page.locator(".make-template-bar.collapsing")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".template-list")).toBeVisible();
});

test("template selection starts a new conversation by default while preserving the previous thread", async ({ page }) => {
  const messages = [{ id: "existing-topic", role: "user", content: "Existing Instagram topic" }];
  await openMake(page, messages);

  await page.locator("[data-template]").first().click();
  await expect(page.getByRole("dialog")).toContainText("템플릿을 어디에 적용할까요?");
  await expect(page.locator("[data-confirm-action]")).toBeFocused();
  await page.locator("[data-confirm-action]").click();

  await expect(page.locator(".message-group")).toHaveCount(0);
  await expect(page.locator("[data-composer] textarea")).not.toHaveValue("");
  await expect(page.locator('[data-thread-item="fixture-thread"]')).toBeVisible();
});

test("template selection can explicitly keep the current conversation", async ({ page }) => {
  const messages = [{ id: "existing-topic", role: "user", content: "Existing Instagram topic" }];
  await openMake(page, messages);

  await page.locator("[data-template]").first().click();
  await page.locator("[data-confirm-alternative]").click();

  await expect(page.locator('[data-message-id="existing-topic"]')).toBeVisible();
  await expect(page.locator("[data-composer] textarea")).not.toHaveValue("");
});

test("a later user message can be split into a new local conversation", async ({ page }) => {
  const messages = [
    { id: "topic-one", role: "user", content: "Instagram campaign" },
    { id: "reply-one", role: "assistant", mode: "improve", content: "Instagram result", improvedPrompt: "Instagram result" },
    { id: "topic-two", role: "user", content: "Explain machine learning" },
    { id: "reply-two", role: "assistant", mode: "improve", content: "Machine learning result", improvedPrompt: "Machine learning result" },
  ];
  await openMake(page, messages);

  await page.locator('[data-split-thread-from="topic-two"]').click();
  await expect(page.locator('[data-message-id="topic-one"]')).toHaveCount(0);
  await expect(page.locator('[data-message-id="topic-two"]')).toBeVisible();
  await expect(page.locator(".recent-thread")).toHaveCount(2);

  await page.locator('[data-thread-item="fixture-thread"] [data-open-thread]').click();
  await expect(page.locator('[data-message-id="topic-one"]')).toBeVisible();
  await expect(page.locator('[data-message-id="topic-two"]')).toHaveCount(0);

  await page.reload();
  await page.locator('[data-route="make"]').click();
  await expect(page.locator(".make-page")).toBeVisible();
  await expect(page.locator('[data-message-id="topic-one"]')).toBeVisible();
  await expect(page.locator('[data-message-id="topic-two"]')).toHaveCount(0);
  await expect(page.locator(".recent-thread")).toHaveCount(2);
});

test("empty composer hides its scrollbar and enables it only after reaching the height cap", async ({ page }) => {
  await openMake(page);
  const composer = page.locator("[data-composer] textarea");
  await expect(composer).toHaveCSS("overflow-y", "hidden");
  await composer.fill(Array.from({ length: 16 }, (_, index) => `긴 입력 ${index}`).join("\n"));
  await expect(composer).toHaveCSS("overflow-y", "auto");
});

for (const threadIdentity of [
  { label: "explicit serverId", id: "server-thread-77", serverId: "77" },
  { label: "legacy numeric id", id: 77 },
]) test(`server-synced conversations with ${threadIdentity.label} do not expose local-only message splitting`, async ({ page }) => {
  const messages = [
    { id: "server-topic-one", role: "user", content: "Server topic one" },
    { id: "server-reply-one", role: "assistant", mode: "improve", content: "Server result one", improvedPrompt: "Server result one" },
    { id: "server-topic-two", role: "user", content: "Server topic two" },
  ];
  const thread = {
    ...threadIdentity,
    title: "Server conversation",
    preview: "Server topic two",
    folderId: "uncategorized",
    createdAt: 1,
    messages,
  };
  await openMake(page, messages, { activeThreadId: thread.id, recentThreads: [thread] });

  await expect(page.locator('[data-message-id="server-topic-two"]')).toBeVisible();
  await expect(page.locator('[data-split-thread-from]')).toHaveCount(0);
  await expect(page.getByText("이 대화는 서버에 저장되어 메시지를 분리할 수 없습니다.", { exact: true })).toBeVisible();
});

test("leaving Make aborts an in-flight request and preserves a non-retryable cancellation state", async ({ page }) => {
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  await openMake(page, [], {}, async (route) => {
    requestStarted();
    await release;
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mode: "improve", improvedPrompt: "This response must be ignored." }),
    }).catch(() => {});
  });

  await page.locator('[data-composer] textarea[name="prompt"]').fill("Cancel this request by leaving Make");
  await page.locator('[data-composer] button[type="submit"]').click();
  await started;
  await page.locator('[data-route="home"]').first().click();
  await expect(page.locator(".home-page")).toBeVisible();
  releaseResponse();

  await page.locator('[data-route="make"]').first().click();
  await expect(page.locator(".message-failure-status")).toContainText("취소");
  await expect(page.locator(".message-failure-status [data-retry-message]")).toHaveCount(0);
  await expect(page.getByText("This response must be ignored.")).toHaveCount(0);
});

test("the explicit cancel button aborts the request, preserves the prompt, and ignores a late response", async ({ page }) => {
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  await openMake(page, [], {}, async (route) => {
    requestStarted();
    await release;
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mode: "improve", improvedPrompt: "Cancelled late response" }),
    }).catch(() => {});
  });

  const prompt = "Preserve this prompt after cancellation";
  await page.locator('[data-composer] textarea[name="prompt"]').fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();
  await started;
  const cancel = page.locator("[data-cancel-make-request]");
  await expect(cancel).toBeVisible();
  await cancel.press("Enter");

  const failure = page.locator(".message-failure-status");
  await expect(failure).toHaveAttribute("role", "status");
  await expect(failure).toContainText("취소");
  await expect(failure.locator("[data-retry-message]")).toHaveCount(0);
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
  releaseResponse();
  await expect(page.getByText("Cancelled late response", { exact: true })).toHaveCount(0);
});

test("cancelling an edited-message resend preserves the edit and clears the thinking UI", async ({ page }) => {
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  const messages = [
    { id: "user-edit", role: "user", content: "Original editable prompt" },
    { id: "assistant-edit", role: "assistant", mode: "improve", improvedPrompt: "Original result" },
  ];
  await openMake(page, messages, {}, async (route) => {
    requestStarted();
    await release;
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mode: "improve", improvedPrompt: "Late edited response" }),
    }).catch(() => {});
  });

  await page.locator('[data-edit-message="user-edit"]').click();
  const editForm = page.locator('[data-edit-message-form="user-edit"]');
  await editForm.locator('textarea[name="message"]').fill("Preserved edited prompt");
  await editForm.locator('button[type="submit"]').click();
  await started;
  await page.locator("[data-cancel-make-request]").click();

  await expect(page.locator("[data-cancel-make-request]")).toHaveCount(0);
  await expect(page.locator('[data-message-id="user-edit"] p')).toHaveText("Preserved edited prompt");
  await expect(page.locator(".message-failure-status")).toContainText("취소");
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
  releaseResponse();
  await expect(page.getByText("Late edited response", { exact: true })).toHaveCount(0);
});

test("a signed-in server-thread edit exposes cancellation and preserves its draft", async ({ page }) => {
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  const messages = [
    { id: "server-user-edit", role: "user", content: "Server original prompt" },
    { id: "server-assistant-edit", role: "assistant", mode: "improve", improvedPrompt: "Server original result" },
  ];
  const thread = { id: 77, serverId: 77, title: "Server fixture", preview: "Server original prompt", folderId: "uncategorized", createdAt: 1, messages };
  await openMake(page, messages, {
    isLoggedIn: true,
    currentUser: "Fixture User",
    currentUserId: 7,
    currentUserRole: "user",
    authToken: "fixture-token",
    token: "fixture-token",
    activeThreadId: 77,
    recentThreads: [thread],
    backendThreads: [thread],
  }, async (route) => {
    requestStarted();
    await release;
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ mode: "improve", improvedPrompt: "Late server response" }) }).catch(() => {});
  });

  await page.locator('[data-edit-message="server-user-edit"]').click();
  const editForm = page.locator('[data-edit-message-form="server-user-edit"]');
  await editForm.locator('textarea[name="message"]').fill("Preserved server edit");
  await editForm.locator('button[type="submit"]').click();
  await started;
  await expect(page.locator("[data-cancel-make-request]")).toBeVisible();
  await page.locator("[data-cancel-make-request]").click();

  await expect(page.locator("[data-cancel-make-request]")).toHaveCount(0);
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toHaveValue("Preserved server edit");
  await expect(page.locator(".message-failure-status")).toContainText("취소");
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
  releaseResponse();
  await expect(page.getByText("Late server response", { exact: true })).toHaveCount(0);
});

function serverThreadFixture(messages) {
  return {
    id: "77",
    serverId: "77",
    title: "Idempotency fixture",
    preview: messages.at(-1)?.content || "Fixture",
    folderId: "uncategorized",
    createdAt: 1,
    messages,
  };
}

test("Make groups turns and keeps one recent-list scrollbar with a labeled field toggle", async ({ page }) => {
  const messages = [
    { id: "user-1", role: "user", content: "첫 요청" },
    { id: "assistant-1", role: "assistant", content: "첫 응답", improvedPrompt: "첫 응답", mode: "improve" },
    { id: "user-2", role: "user", content: "후속 요청" },
  ];
  await openMake(page, messages);
  await expect(page.getByText("이 대화는 서버에 저장되어 메시지를 분리할 수 없습니다.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".conversation-turn")).toHaveCount(2);
  const fieldToggle = page.locator("[data-toggle-templates]");
  await expect(fieldToggle).toContainText("분야");
  expect(await fieldToggle.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(62);
  const toolbarColumns = await page.locator(".make-template-bar").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").map(Number.parseFloat));
  expect(toolbarColumns[0]).toBeGreaterThanOrEqual(62);
  expect(await page.locator(".make-side-panel").evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden");
  expect(await page.locator(".recent-thread-list").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
});

function signedInThreadState(thread) {
  return {
    isLoggedIn: true,
    currentUser: "Fixture User",
    currentUserId: 7,
    currentUserRole: "user",
    authToken: "fixture-token",
    token: "fixture-token",
    activeThreadId: String(thread.id),
    recentThreads: [thread],
    backendThreads: [thread],
  };
}

test("server follow-up retry reuses its request id and replay does not duplicate messages", async ({ page }) => {
  const initialMessages = [
    { id: "server-user-initial", role: "user", content: "Initial prompt" },
    { id: "server-assistant-initial", role: "assistant", mode: "improve", improvedPrompt: "Initial result", content: "Initial result" },
  ];
  const thread = serverThreadFixture(initialMessages);
  const requests = [];
  const prompt = "Retry this server follow-up";
  await openMake(page, initialMessages, signedInThreadState(thread), async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 1) {
      await route.fulfill({ status: 503, headers: CORS_HEADERS, body: JSON.stringify({ code: "AI_SERVICE_UNAVAILABLE" }) });
      return;
    }
    thread.messages = [
      ...initialMessages,
      { id: "server-user-replayed", role: "user", content: prompt, requestId: payload.requestId },
      { id: "server-assistant-replayed", role: "assistant", mode: "improve", content: "Stored replay result", improvedPrompt: "Stored replay result", requestId: payload.requestId },
    ];
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mode: "improve", improvedPrompt: "Stored replay result", threadId: 77, requestId: payload.requestId, replayed: true }),
    });
  });

  await page.locator('[data-composer] textarea[name="prompt"]').fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();
  const retry = page.locator(".message-failure-status [data-retry-message]");
  await expect(retry).toBeVisible();
  await retry.click();

  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].requestId).toBeTruthy();
  expect(requests[0].requestId.length).toBeLessThanOrEqual(128);
  expect(requests[1].requestId).toBe(requests[0].requestId);
  await expect(page.locator(".message.user").getByText(prompt, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Stored replay result", { exact: true })).toHaveCount(1);
});

test("ask answers and edited server prompts receive the correct request-id ownership", async ({ page }) => {
  const messages = [{ ...askMessage, requestId: "request-for-ask-turn" }];
  const thread = serverThreadFixture(messages);
  const requests = [];
  await openMake(page, messages, signedInThreadState(thread), async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    thread.messages = [
      ...messages,
      { id: `server-user-${requests.length}`, role: "user", content: payload.prompt, requestId: payload.requestId },
      { id: `server-assistant-${requests.length}`, role: "assistant", mode: "improve", content: "Answer result", improvedPrompt: "Answer result", requestId: payload.requestId },
    ];
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ mode: "improve", improvedPrompt: "Answer result", threadId: 77, requestId: payload.requestId, replayed: false }) });
  });

  const form = page.locator("[data-ask-answer-form]");
  await form.locator('[name="purpose"]').fill("Explain the release");
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].requestId).toBeTruthy();
  expect(requests[0].requestId).not.toBe("request-for-ask-turn");
});

test("server edit reuses an unchanged request id, rotates it after editing, and conflict is non-retryable", async ({ page }) => {
  const messages = [
    { id: "server-user-idempotent", role: "user", content: "Original server prompt", requestId: "request-original" },
    { id: "server-assistant-idempotent", role: "assistant", mode: "improve", content: "Original result", improvedPrompt: "Original result" },
  ];
  const thread = serverThreadFixture(messages);
  const requests = [];
  await openMake(page, messages, signedInThreadState(thread), async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 2) {
      await route.fulfill({ status: 409, headers: CORS_HEADERS, body: JSON.stringify({ code: "REQUEST_ID_REUSED" }) });
      return;
    }
    thread.messages = [
      { ...messages[0], requestId: payload.requestId },
      { id: "server-assistant-idempotent-updated", role: "assistant", mode: "improve", content: "Unchanged edit result", improvedPrompt: "Unchanged edit result", requestId: payload.requestId },
    ];
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ mode: "improve", improvedPrompt: "Unchanged edit result", threadId: 77, requestId: payload.requestId, replayed: true }) });
  });

  await page.locator('[data-edit-message="server-user-idempotent"]').click();
  await page.locator('[data-edit-message-form="server-user-idempotent"] button[type="submit"]').click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].requestId).toBe("request-original");

  await page.locator('[data-edit-message="server-user-idempotent"]').click();
  const editForm = page.locator('[data-edit-message-form="server-user-idempotent"]');
  await editForm.locator('textarea[name="message"]').fill("Changed server prompt");
  await editForm.locator('button[type="submit"]').click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].requestId).toBeTruthy();
  expect(requests[1].requestId).not.toBe("request-original");
  await expect(page.getByText("요청 상태가 변경되어 서버 대화를 새로고침했습니다. 내용을 확인한 뒤 다시 요청해주세요.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-retry-message]")).toHaveCount(0);
});

test("thread concurrency reloads canonical messages before an explicit preserved-prompt retry", async ({ page }) => {
  const initialMessages = [
    { id: "server-user-initial", role: "user", content: "Initial prompt" },
    { id: "server-assistant-initial", role: "assistant", mode: "improve", content: "Initial result", improvedPrompt: "Initial result" },
  ];
  const thread = serverThreadFixture(initialMessages);
  const requests = [];
  let threadReads = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().endsWith("/api/make/threads/77")) threadReads += 1;
  });
  await openMake(page, initialMessages, signedInThreadState(thread), async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 1) {
      thread.messages = [
        ...initialMessages,
        { id: "server-user-other", role: "user", content: "Other client prompt" },
        { id: "server-assistant-other", role: "assistant", mode: "improve", content: "Latest canonical result", improvedPrompt: "Latest canonical result" },
      ];
      await route.fulfill({ status: 409, headers: CORS_HEADERS, body: JSON.stringify({
        code: "THREAD_CONCURRENTLY_UPDATED",
        message: "대화가 다른 요청에 의해 변경되었습니다. 최신 대화를 불러온 뒤 다시 시도해 주세요.",
      }) });
      return;
    }
    thread.messages = [
      ...thread.messages,
      { id: "server-user-retry", role: "user", content: payload.prompt, requestId: payload.requestId },
      { id: "server-assistant-retry", role: "assistant", mode: "improve", content: "Concurrent retry result", improvedPrompt: "Concurrent retry result", requestId: payload.requestId },
    ];
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({
      mode: "improve", improvedPrompt: "Concurrent retry result", threadId: 77,
      requestId: payload.requestId, replayed: false,
    }) });
  });

  const prompt = "Preserve this concurrent prompt";
  await page.locator('[data-composer] textarea[name="prompt"]').fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();

  await expect.poll(() => threadReads).toBeGreaterThan(0);
  await expect(page.locator(".message.assistant").getByText("Latest canonical result", { exact: true })).toBeVisible();
  await expect(page.locator(".message.user").getByText(prompt, { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toHaveValue(prompt);
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
  await expect(page.getByText("최신 대화를 불러왔습니다", { exact: true })).toBeVisible();
  await expect(page.getByText("입력한 내용은 입력란에 복원되어 있습니다.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-retry-concurrent]")).toBeVisible();
  await expect(page.locator(".message-failure-status")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  await expect(page.getByText("Concurrent retry result", { exact: true })).toHaveCount(0);

  await page.locator("[data-retry-concurrent]").click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByText("Concurrent retry result", { exact: true })).toHaveCount(1);
});

test("thread concurrency preserves the server edit route after an explicit retry", async ({ page }) => {
  const initialMessages = [
    { id: "server-user-edit-conflict", role: "user", content: "Original edit prompt", requestId: "request-before-edit" },
    { id: "server-assistant-edit-conflict", role: "assistant", mode: "improve", content: "Original edit result", improvedPrompt: "Original edit result" },
  ];
  const thread = serverThreadFixture(initialMessages);
  const requests = [];
  await openMake(page, initialMessages, signedInThreadState(thread), async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 1) {
      thread.messages = initialMessages;
      await route.fulfill({ status: 409, headers: CORS_HEADERS, body: JSON.stringify({
        code: "THREAD_CONCURRENTLY_UPDATED",
        message: "대화가 다른 요청에 의해 변경되었습니다. 최신 대화를 불러온 뒤 다시 시도해 주세요.",
      }) });
      return;
    }
    thread.messages = [
      { ...initialMessages[0], content: payload.prompt, requestId: payload.requestId },
      { id: "server-assistant-edit-retry", role: "assistant", mode: "improve", content: "Edited retry result", improvedPrompt: "Edited retry result", requestId: payload.requestId },
    ];
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({
      mode: "improve", improvedPrompt: "Edited retry result", threadId: 77,
      requestId: payload.requestId, replayed: false,
    }) });
  });

  await page.locator('[data-edit-message="server-user-edit-conflict"]').click();
  const editForm = page.locator('[data-edit-message-form="server-user-edit-conflict"]');
  await editForm.locator('textarea[name="message"]').fill("Edited concurrent prompt");
  await editForm.locator('button[type="submit"]').click();

  await expect(page.locator("[data-retry-concurrent]")).toBeVisible();
  await expect(page.locator("[data-retry-concurrent]")).toHaveText("수정한 내용 다시 보내기");
  const comparison = page.locator(".concurrency-compare");
  await expect(comparison).toContainText("수정한 내용");
  await expect(comparison).toContainText("Edited concurrent prompt");
  await expect(comparison).toContainText("서버 최신 내용");
  await expect(comparison).toContainText("Original edit prompt");
  await expect(comparison).toContainText("두 내용이 다릅니다");
  await expect(page.locator('[data-composer] textarea[name="prompt"]')).toBeFocused();
  await expect(page.locator('[data-message-id^="concurrency-"]')).toBeInViewport();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ messageId: "server-user-edit-conflict", prompt: "Edited concurrent prompt" });

  await page.locator("[data-retry-concurrent]").click();
  await expect(page.locator("[data-retry-concurrent]")).toBeDisabled();
  await expect(page.locator("[data-retry-concurrent]")).toHaveText("보내는 중…");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ messageId: "server-user-edit-conflict", prompt: "Edited concurrent prompt" });
  await expect(page.getByText("Edited retry result", { exact: true })).toHaveCount(1);
});

test("failed concurrency refresh offers reload before any request retry", async ({ page }) => {
  const initialMessages = [
    { id: "server-user-refresh", role: "user", content: "Initial prompt" },
    { id: "server-assistant-refresh", role: "assistant", mode: "improve", content: "Initial result", improvedPrompt: "Initial result" },
  ];
  const thread = serverThreadFixture(initialMessages);
  const requests = [];
  let conflictReturned = false;
  let refreshAttempts = 0;
  const state = signedInThreadState(thread);
  state.threadHandler = async (route) => {
    if (conflictReturned) refreshAttempts += 1;
    if (conflictReturned && refreshAttempts === 1) {
      await route.fulfill({ status: 503, headers: CORS_HEADERS, body: JSON.stringify({ code: "SERVER_UNAVAILABLE" }) });
      return;
    }
    if (conflictReturned && refreshAttempts === 2) await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify(thread) });
  };
  await openMake(page, initialMessages, state, async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 1) {
      conflictReturned = true;
      await route.fulfill({ status: 409, headers: CORS_HEADERS, body: JSON.stringify({ code: "THREAD_CONCURRENTLY_UPDATED" }) });
      return;
    }
    thread.messages = [
      ...initialMessages,
      { id: "server-user-reloaded-retry", role: "user", content: payload.prompt, requestId: payload.requestId },
      { id: "server-assistant-reloaded-retry", role: "assistant", mode: "improve", content: "Reloaded retry result", improvedPrompt: "Reloaded retry result", requestId: payload.requestId },
    ];
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({
      mode: "improve", improvedPrompt: "Reloaded retry result", threadId: 77,
      requestId: payload.requestId, replayed: false,
    }) });
  });

  const prompt = "Preserve prompt across reload failure";
  await page.locator('[data-composer] textarea[name="prompt"]').fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();

  await expect(page.locator("[data-refresh-concurrent]")).toBeVisible();
  await expect(page.locator("[data-refresh-concurrent]")).toHaveText("최신 대화 불러오기");
  await expect(page.getByText("다른 곳에서 대화가 업데이트됐습니다", { exact: true })).toBeVisible();
  const recoveryCard = page.locator(".message-failure-status");
  await expect(recoveryCard).toHaveCount(1);
  await expect(page.locator("[data-retry-concurrent]")).toHaveCount(0);
  expect(requests).toHaveLength(1);

  await page.locator("[data-refresh-concurrent]").click();
  await expect(page.locator("[data-refresh-concurrent]")).toBeDisabled();
  await expect(page.locator("[data-refresh-concurrent]")).toHaveText("불러오는 중…");
  await expect(page.locator("[data-retry-concurrent]")).toBeVisible();
  await expect(recoveryCard).toHaveCount(1);
  expect(requests).toHaveLength(1);

  await page.locator("[data-retry-concurrent]").click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByText("Reloaded retry result", { exact: true })).toHaveCount(1);
});

const errorCases = [
  { name: "network", expected: "백엔드에 연결할 수 없습니다", action: "연결 확인 후 다시 시도", reply: (route) => route.abort("failed") },
  { name: "AI service", expected: "AI 서비스가 일시적으로 응답하지 않습니다", action: "잠시 후 다시 시도", status: 503, code: "AI_SERVICE_UNAVAILABLE" },
  { name: "contract", expected: "AI 응답 형식을 처리하지 못했습니다", action: "잠시 후 다시 시도", status: 500, code: "AI_INVALID_RESPONSE" },
  { name: "authentication", expected: "로그인이 만료되었습니다", action: "로그인", status: 401, code: "AUTH_EXPIRED" },
];

for (const scenario of errorCases) {
  test(`${scenario.name} failure renders an actionable error state`, async ({ page }) => {
    const improveHandler = scenario.reply || ((route) => route.fulfill({
      status: scenario.status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: scenario.code }),
    }));
    await openMake(page, [], {}, improveHandler);

    await page.locator('[data-composer] textarea[name="prompt"]').fill("Improve this fixture prompt");
    await page.locator('[data-composer] button[type="submit"]').click();

    const failure = page.locator(".message-failure-status");
    await expect(failure).toContainText(scenario.expected);
    const action = failure.getByRole("button", { name: scenario.action });
    await expect(action).toBeVisible();
    if (scenario.name === "authentication") {
      await action.click();
      await expect(page.locator("[data-auth-form]")).toBeVisible();
    } else {
      await expect(failure.locator("[data-retry-message]")).toHaveCount(1);
      const retryRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/prompts/improve"));
      await action.click();
      const payload = (await retryRequest).postDataJSON();
      expect(payload.prompt).toBe("Improve this fixture prompt");
    }
  });
}

test.describe("Make component visual regressions", () => {
  test("selected folder and recent conversation", async ({ page }) => {
    const messages = [{ id: "visual-user", role: "user", content: "Visual fixture prompt" }];
    const thread = { id: "visual-thread", title: "Visual conversation", preview: "Visual fixture prompt", folderId: "uncategorized", createdAt: 1, messages };
    await openMake(page, messages, { activeThreadId: thread.id, recentThreads: [thread] });
    await stabilizeVisuals(page);
    await expectComponentScreenshot(page.locator(".make-side-panel"), "make-sidebar-selection.png");
  });

  test("ask question card", async ({ page }) => {
    await openMake(page, [askMessage]);
    await stabilizeVisuals(page);
    await expectComponentScreenshot(page.locator('[data-message-id="assistant-ask"] .message'), "make-ask-question-card.png");
  });

  test("improved prompt with collapsed details", async ({ page }) => {
    const result = {
      id: "visual-result",
      role: "assistant",
      mode: "improve",
      answer: "The request was refined for a product announcement.",
      improvedPrompt: "Write a concise product announcement for new customers.",
      fields: [{ name: "Audience", role: "optional", status: "empty" }],
      changes: ["Clarified the audience and output format."],
      techniques: [{ name: "Audience targeting" }],
    };
    await openMake(page, [result]);
    await stabilizeVisuals(page);
    await expect(page.locator(".message-detail-section[open]")).toHaveCount(0);
    const resultCard = page.locator('[data-message-id="visual-result"] .message');
    await setVisualFrame(resultCard, { width: "474px", height: "520px" });
    await expectComponentScreenshot(resultCard, "make-result-collapsed-details.png");
  });

  test("template conversation choice dialog", async ({ page }) => {
    await openMake(page, [{ id: "visual-existing", role: "user", content: "Existing conversation" }]);
    await page.locator("[data-template]").first().click();
    await stabilizeVisuals(page);
    await expectComponentScreenshot(page.getByRole("dialog"), "make-template-choice-dialog.png");
  });

  test("retry status card", async ({ page }) => {
    await openMake(page, [], {}, async (route) => route.fulfill({
      status: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ code: "AI_SERVICE_UNAVAILABLE", message: "AI unavailable" }),
    }));
    await page.locator('[data-composer] textarea[name="prompt"]').fill("Visual retry request");
    await page.locator('[data-composer] button[type="submit"]').click();
    await expect(page.locator(".message-failure-status")).toBeVisible();
    await stabilizeVisuals(page);
    await expectComponentScreenshot(page.locator(".message.user").last(), "make-retry-status-card.png");
  });

  test("cancellation status card", async ({ page }) => {
    let requestStarted;
    let releaseResponse;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    const release = new Promise((resolve) => { releaseResponse = resolve; });
    await openMake(page, [], {}, async (route) => {
      requestStarted();
      await release;
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ mode: "improve", improvedPrompt: "Late visual response" }) }).catch(() => {});
    });
    await page.locator('[data-composer] textarea[name="prompt"]').fill("Visual cancellation request");
    await page.locator('[data-composer] button[type="submit"]').click();
    await started;
    await page.locator("[data-cancel-make-request]").click();
    await expect(page.locator(".message-failure-status")).toBeVisible();
    await stabilizeVisuals(page);
    const cancellationCard = page.locator(".message.user").last();
    await setVisualFrame(cancellationCard, { width: "300px" });
    await expectComponentScreenshot(cancellationCard, "make-cancellation-status-card.png");
    releaseResponse();
  });
});

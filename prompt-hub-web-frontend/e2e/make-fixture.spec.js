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
    if (pathname === "/api/make/threads" && request.method() === "GET" && fixtures.threads) {
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: fixtures.threads }) });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: [] }) });
  });
}

async function openMake(page, messages = [], extra = {}, improveHandler) {
  await seedStorage(page, messages, extra);
  await mockBackend(page, improveHandler, { threads: extra.backendThreads });
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
  await expect(page.getByText("대화 분리는 로컬 대화에서 사용할 수 있습니다.", { exact: true })).toBeVisible();
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

const errorCases = [
  { name: "network", expected: "백엔드에 연결할 수 없습니다", reply: (route) => route.abort("failed") },
  { name: "AI service", expected: "AI 서비스가 일시적으로 응답하지 않습니다", status: 503, code: "AI_SERVICE_UNAVAILABLE" },
  { name: "contract", expected: "AI 응답 형식을 처리하지 못했습니다", status: 500, code: "AI_INVALID_RESPONSE" },
  { name: "authentication", expected: "로그인이 만료되었습니다", status: 401, code: "AUTH_EXPIRED", retryable: false },
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
    await expect(failure.locator("[data-retry-message]")).toHaveCount(scenario.retryable === false ? 0 : 1);
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

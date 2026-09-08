const { test, expect } = require("@playwright/test");
const { gotoApp } = require("./support/app-ready.js");

const BACKEND_URL = process.env.TTALKAK_INTEGRATION_BACKEND_URL || "http://127.0.0.1:8080";
const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const REMOTE_SMOKE_OPT_IN = process.env.TTALKAK_ALLOW_REMOTE_INTEGRATION_SMOKE === "true";
let disposableAccount = null;

test.beforeAll(() => {
  const hostname = new URL(BACKEND_URL).hostname;
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  if (!isLoopback && !REMOTE_SMOKE_OPT_IN) {
    throw new Error("Integration smoke may only create disposable data on a loopback backend. Set TTALKAK_ALLOW_REMOTE_INTEGRATION_SMOKE=true only for an explicitly approved disposable environment.");
  }
});

test.afterEach(async ({ request }) => {
  if (!disposableAccount) return;
  const { password, token } = disposableAccount;
  disposableAccount = null;
  const cleanup = await request.delete(`${BACKEND_URL}/api/auth/withdraw`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { password },
  });
  expect(cleanup.ok(), "the integration smoke account must be withdrawn during cleanup").toBeTruthy();
});

test("web Make completes through the real Spring backend and persists the turn", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const userId = `smoke-${suffix}`;
  const password = "SmokePassword123!";
  const prompt = `통합 연동 확인 ${suffix}`;

  const signup = await request.post(`${BACKEND_URL}/api/auth/signup`, {
    data: {
      userId,
      password,
      passwordConfirm: password,
      nickname: `smoke-${suffix}`,
      name: "통합 테스트",
      birth: "",
      phone: "",
      email: "",
      agreeTerms: true,
      agreePrivacy: true,
    },
  });
  expect(signup.ok()).toBeTruthy();
  const session = await signup.json();
  const token = session.accessToken;
  const member = session.member || session.user;
  expect(token).toBeTruthy();
  expect(member?.memberId || member?.id).toBeTruthy();
  disposableAccount = { password, token };

  await page.addInitScript(({ storageKey, tokenKey, accessToken, identity, backendUrl }) => {
    window.TTALKAK_API_BASE_URL = backendUrl;
    localStorage.setItem(tokenKey, accessToken);
    localStorage.setItem(storageKey, JSON.stringify({
      state: {
        route: "home",
        isLoggedIn: true,
        currentUser: identity.nickname,
        currentUserId: String(identity.memberId || identity.id),
        currentUserRole: "user",
        authToken: accessToken,
        token: accessToken,
      },
      savedPrompts: [],
      popularPrompts: [],
    }));
  }, { storageKey: STORAGE_KEY, tokenKey: TOKEN_KEY, accessToken: token, identity: member, backendUrl: BACKEND_URL });

  await gotoApp(page);
  await page.locator('[data-route="make"]').first().click();
  const composer = page.locator('[data-composer] textarea[name="prompt"]');
  await composer.fill(prompt);
  await page.locator('[data-composer] button[type="submit"]').click();

  await expect(page.locator(".message.assistant").last()).toContainText(`개선된 ${prompt}`, { timeout: 90_000 });

  const threadsResponse = await request.get(`${BACKEND_URL}/api/make/threads?size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(threadsResponse.ok()).toBeTruthy();
  const threadsBody = await threadsResponse.json();
  const threads = threadsBody.items || threadsBody.content || [];
  const saved = threads.find((thread) => thread.messages?.some((message) => message.role === "user" && message.content === prompt));
  expect(saved).toBeTruthy();
  expect(saved.messages.filter((message) => message.role === "user" && message.content === prompt)).toHaveLength(1);
  expect(saved.messages.some((message) => message.role === "assistant" && String(message.improvedPrompt || "").includes(prompt))).toBeTruthy();

  const requestId = saved.messages.find((message) => message.role === "user" && message.content === prompt)?.requestId;
  expect(requestId).toBeTruthy();
  const replayResponse = await request.post(`${BACKEND_URL}/api/prompts/improve`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { prompt, category: "prompt_techniques", requestId },
  });
  expect(replayResponse.ok()).toBeTruthy();
  const replay = await replayResponse.json();
  expect(replay.replayed).toBe(true);
  expect(String(replay.threadId)).toBe(String(saved.threadId || saved.id));

  const afterReplayResponse = await request.get(`${BACKEND_URL}/api/make/threads?size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const afterReplayBody = await afterReplayResponse.json();
  const matchingThreads = (afterReplayBody.items || afterReplayBody.content || [])
    .filter((thread) => thread.messages?.some((message) => message.role === "user" && message.content === prompt));
  expect(matchingThreads).toHaveLength(1);
});

const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "prompt_hub_web_state_v2";
const TOKEN_KEY = "ttalkak_access_token";
const API_PATTERN = "http://localhost:8080/**";
const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

async function seed(page, { state = {}, savedPrompts = [], popularPrompts = [] } = {}) {
  await page.addInitScript(({ storageKey, tokenKey, payload }) => {
    if (window.sessionStorage.getItem("ttalkak-workflow-fixture-seeded")) return;
    window.localStorage.clear();
    window.localStorage.setItem(tokenKey, "fixture-real-token");
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.sessionStorage.setItem("ttalkak-workflow-fixture-seeded", "true");
  }, {
    storageKey: STORAGE_KEY,
    tokenKey: TOKEN_KEY,
    payload: {
      state: {
        isLoggedIn: true,
        currentUser: "Fixture User",
        currentUserId: "fixture-user",
        currentUserRole: "user",
        authToken: "fixture-real-token",
        token: "fixture-real-token",
        route: "home",
        activeFolderId: "all",
        makeFolders: [{ id: "uncategorized", name: "미분류" }],
        recentThreads: [],
        ...state,
      },
      savedPrompts,
      popularPrompts,
    },
  });
}

async function mockBackend(page, handler) {
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS, body: "" });
    if (handler && await handler(route, request)) return;
    return route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) });
  });
}

test("folder lifecycle persists through reload and deletes through confirmation", async ({ page }) => {
  let folders = [];
  await seed(page);
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/make/folders" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: folders }) });
      return true;
    }
    if (url.pathname === "/api/make/threads" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [] }) });
      return true;
    }
    if (url.pathname === "/api/make/folders" && request.method() === "POST") {
      const payload = request.postDataJSON();
      folders = [{ id: 101, name: payload.name }];
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(folders[0]) });
      return true;
    }
    if (url.pathname === "/api/make/folders/101" && request.method() === "PATCH") {
      folders[0].name = request.postDataJSON().name;
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(folders[0]) });
      return true;
    }
    if (url.pathname === "/api/make/folders/101" && request.method() === "DELETE") {
      folders = [];
      await route.fulfill({ status: 204, headers: HEADERS, body: "" });
      return true;
    }
    return false;
  });

  await page.goto("/");
  await page.locator('[data-route="make"]').click();
  await page.locator("[data-show-folder-form]").click();
  await page.locator('[data-folder-create-form] input[name="folderName"]').fill("업무");
  await page.locator('[data-folder-create-form] button[type="submit"]').click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "업무" })).toBeVisible();

  const folder = page.locator("[data-folder-item]").filter({ hasText: "업무" });
  await folder.locator("[data-folder-menu]").click();
  await folder.locator("[data-edit-folder]").click();
  const editForm = page.locator('[data-folder-edit-form]');
  await editForm.locator('input[name="folderName"]').fill("프로젝트");
  await editForm.locator('button[type="submit"]').click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "프로젝트" })).toBeVisible();

  await page.reload();
  await page.locator('[data-route="make"]').click();
  const restored = page.locator("[data-folder-item]").filter({ hasText: "프로젝트" });
  await expect(restored).toBeVisible();
  await restored.hover();
  await restored.locator("[data-folder-menu]").click();
  await restored.locator("[data-delete-folder]").click();
  await page.locator("[data-confirm-action]").click();
  await expect(page.locator("[data-folder-item]").filter({ hasText: "프로젝트" })).toHaveCount(0);
});

test("thread folder move rolls back on failure and recent conversation restores after reload", async ({ page }) => {
  const folders = [{ id: 10, name: "기존" }, { id: 20, name: "이동 대상" }];
  const thread = {
    id: 7,
    title: "복원할 대화",
    preview: "브라우저 복원 확인",
    folderId: 10,
    createdAt: 1,
    messages: [
      { id: "user-1", role: "user", content: "초기 요청" },
      { id: "assistant-1", role: "assistant", mode: "improve", answer: "복원된 개선안" },
    ],
  };
  let failMove = true;
  await seed(page);
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/make/folders" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: folders }) });
      return true;
    }
    if (url.pathname === "/api/make/threads" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [thread] }) });
      return true;
    }
    if (url.pathname === "/api/make/threads/7/folder" && request.method() === "PATCH") {
      if (failMove) {
        failMove = false;
        await route.fulfill({ status: 500, headers: HEADERS, body: JSON.stringify({ code: "SERVER_ERROR" }) });
      } else {
        thread.folderId = request.postDataJSON().folderId;
        await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify(thread) });
      }
      return true;
    }
    return false;
  });

  await page.goto("/");
  await page.locator('[data-route="make"]').click();
  const row = page.locator('[data-open-thread="7"]').locator("..");
  await row.locator('[data-thread-menu="7"]').click();
  const select = page.locator('[data-thread-folder="7"]');
  await select.selectOption("20");
  await expect(page.locator(".toast")).toContainText("변경을 취소");

  await page.locator('[data-thread-menu="7"]').click();
  await page.locator('[data-thread-folder="7"]').selectOption("20");
  await expect(page.locator(".toast")).toContainText("변경했습니다");

  await page.reload();
  await page.locator('[data-route="make"]').click();
  await page.locator('[data-open-thread="7"]').click();
  await expect(page.getByText("복원된 개선안")).toBeVisible();
});

test("owned prompt can be edited, unshared, and deleted", async ({ page }) => {
  const prompt = { id: "fixture-prompt", title: "기존 제목", text: "기존 내용", tags: ["fixture"], source: "mine", owner: "Fixture User", author: "Fixture User", isShared: true, savedByMe: true };
  await seed(page, { savedPrompts: [prompt], popularPrompts: [prompt] });
  await mockBackend(page);
  await page.goto("/");
  await page.locator('[data-route="saved"]').click();

  let card = page.locator('[data-open-prompt="fixture-prompt"]');
  await card.locator("[data-prompt-card-menu]").click();
  await card.locator("[data-edit-prompt]").click();
  await page.locator('[data-prompt-edit-form] input[name="title"]').fill("수정된 제목");
  await page.locator('[data-prompt-edit-form] textarea[name="text"]').fill("수정된 내용");
  await page.locator('[data-prompt-edit-form] button[type="submit"]').click();
  card = page.locator('[data-open-prompt="fixture-prompt"]');
  await expect(card).toContainText("수정된 제목");

  await card.locator("[data-prompt-card-menu]").click();
  await card.locator("[data-unshare-prompt]").click();
  await page.locator("[data-confirm-action]").click();
  await expect(card).toContainText("비공개");

  await card.locator("[data-prompt-card-menu]").click();
  await card.locator("[data-delete-prompt]").click();
  await page.locator("[data-confirm-action]").click();
  await expect(page.locator('[data-open-prompt="fixture-prompt"]')).toHaveCount(0);
});

test("report failure preserves the dialog and success prevents duplicate reporting", async ({ page }) => {
  const prompt = { id: 88, title: "신고 대상", text: "신고 대상 내용", tags: [], source: "community", owner: "Other", author: "Other", isShared: true };
  let shouldFail = true;
  await seed(page, { popularPrompts: [prompt] });
  await mockBackend(page, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/prompts" && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: [prompt] }) });
      return true;
    }
    if (url.pathname === "/api/reports/prompts/88" && request.method() === "POST") {
      await route.fulfill({ status: shouldFail ? 500 : 200, headers: HEADERS, body: JSON.stringify(shouldFail ? { code: "SERVER_ERROR" } : { id: 1 }) });
      shouldFail = false;
      return true;
    }
    return false;
  });

  await page.goto("/");
  await page.locator('[data-open-prompt="88"]').click();
  await page.locator('[data-report-prompt="88"]').click();
  const reportForm = page.locator('[data-report-form="88"]');
  await reportForm.locator('textarea[name="reason"]').fill("스팸입니다");
  await reportForm.locator('button[type="submit"]').click();
  await expect(reportForm).toBeVisible();

  await reportForm.locator('textarea[name="reason"]').fill("스팸입니다");
  await reportForm.locator('button[type="submit"]').click();
  await expect(reportForm).toHaveCount(0);
  await page.locator('[data-report-prompt="88"]').click();
  await expect(page.locator(".toast")).toContainText("이미 신고");
});

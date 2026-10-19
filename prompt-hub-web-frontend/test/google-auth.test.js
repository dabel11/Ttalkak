const { test } = require("node:test");
const assert = require("node:assert/strict");

test("Google signup consent reaches the server and a subsequent login uses the real account", async () => {
  const { createAuthController } = await import("../src/auth/auth-controller.mjs");
  const previousGoogle = global.google;
  const previousFormData = global.FormData;
  let callback;
  let consent = true;
  global.google = { accounts: { id: { initialize(options) { callback = options.callback; }, renderButton() {} } } };
  global.FormData = class { has() { return consent; } };
  const host = { isConnected: true, replaceChildren() {} };
  const requests = [];
  const applied = [];
  const state = { authView: "signup", authDraft: {}, authError: "" };
  const ctx = {
    state, root: { querySelector() { return null; } }, document: {},
    api: { googleConfig: async () => ({ clientId: "configured.apps.googleusercontent.com" }),
      googleLogin: async (credential, agreement) => { requests.push({ credential, agreement }); return { accessToken: "real-token", user: { id: 7, provider: "google" }, newMember: requests.length === 1 }; } },
    normalizeResult: (response) => ({ token: response.accessToken, user: response.user }),
    applyUser: (identity) => applied.push(identity), notice() {}, render() {}, warn() {},
    hydrateMake: async () => {},
  };
  try {
    const controller = createAuthController(ctx);
    await controller.mountGoogle(host);
    await callback({ credential: "verified-signup-token" });
    assert.deepEqual(requests[0].agreement, { agreeTerms: true, agreePrivacy: true });
    assert.equal(state.authView, null);
    consent = false;
    state.authView = "login";
    await controller.mountGoogle(host);
    await callback({ credential: "fresh-login-token" });
    assert.deepEqual(requests[1].agreement, { agreeTerms: false, agreePrivacy: false });
    assert.deepEqual(applied.map((identity) => identity.user.id), [7, 7]);
    assert.ok(applied.every((identity) => identity.token === "real-token"));
  } finally { global.google = previousGoogle; global.FormData = previousFormData; }
});

test("Google errors, missing configuration and closed dialogs never grant a demo session", async () => {
  const { createAuthController } = await import("../src/auth/auth-controller.mjs");
  const previousGoogle = global.google;
  const previousFormData = global.FormData;
  let callback;
  let applied = 0;
  global.google = { accounts: { id: { initialize(options) { callback = options.callback; }, renderButton() {} } } };
  global.FormData = class { has() { return false; } };
  const state = { authView: "login", authError: "" };
  const host = { isConnected: true, replaceChildren() {}, textContent: "" };
  const ctx = { state, root: { querySelector() { return null; } }, document: {},
    api: { googleConfig: async () => ({ clientId: "configured" }), googleLogin: async () => { throw { payload: { code: "AUTH_TERMS_REQUIRED", message: "먼저 약관에 동의해주세요." } }; } },
    applyUser() { applied += 1; }, render() {},
  };
  try {
    const controller = createAuthController(ctx);
    await controller.mountGoogle(host);
    await callback({ credential: "new-account-token" });
    assert.equal(state.authView, "signup");
    assert.match(state.authError, /약관/);
    ctx.api.googleLogin = async () => { throw new Error("인증 실패"); };
    state.authView = "login";
    await callback({ credential: "invalid-token" });
    assert.equal(state.authView, "login");
    assert.equal(state.authError, "인증 실패");
    host.isConnected = false;
    await callback({ credential: "late-token" });
    host.isConnected = true;
    ctx.api.googleConfig = async () => ({ clientId: "" });
    await controller.mountGoogle(host);
    assert.match(host.textContent, /준비 중/);
    assert.equal(applied, 0);
  } finally { global.google = previousGoogle; global.FormData = previousFormData; }
});

test("Google API sends credentials and explicit signup consent without putting tokens in URLs", async () => {
  const { createAuthApi } = await import("../src/api/auth-api.mjs");
  const calls = [];
  const api = createAuthApi({ request: async (...args) => { calls.push(args); } });
  await api.googleConfig();
  await api.googleLogin("private-token", { agreeTerms: true, agreePrivacy: true });
  assert.equal(calls[0][0], "/api/auth/google/config");
  assert.equal(calls[1][0], "/api/auth/google");
  assert.deepEqual(JSON.parse(calls[1][1].body), { credential: "private-token", agreeTerms: true, agreePrivacy: true });
});


test("Google withdrawal requires fresh identity and explicit confirmation without logging in again", async () => {
  const { createAuthController } = await import("../src/auth/auth-controller.mjs");
  const previousGoogle = global.google;
  let callback;
  let confirmed;
  let submitted;
  let cleared = false;
  global.google = { accounts: { id: { initialize(options) { callback = options.callback; }, renderButton() {} } } };
  const ctx = { state: { authView: "withdraw" },
    api: { googleConfig: async () => ({ clientId: "configured" }),
      googleLogin() { throw new Error("Withdrawal must not log in again"); },
      withdrawAccount: async (payload, token) => { submitted = { payload, token }; return { ok: true }; } },
    confirm: (action) => { confirmed = action; }, getToken: () => "existing-session",
    clearSession() { cleared = true; }, notice() {},
  };
  try {
    const controller = createAuthController(ctx);
    await controller.mountGoogle({ isConnected: true, replaceChildren() {} });
    await callback({ credential: "fresh-google-proof" });
    assert.equal(submitted, undefined);
    assert.equal(confirmed.type, "withdraw");
    await controller.withdraw(confirmed);
    assert.deepEqual(submitted, { payload: { password: "", googleCredential: "fresh-google-proof" }, token: "existing-session" });
    assert.equal(cleared, true);
  } finally { global.google = previousGoogle; }
});

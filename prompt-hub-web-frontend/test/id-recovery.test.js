const test = require("node:test");
const assert = require("node:assert/strict");

let createAuthApi;
let createAuthController;
let renderers;
let policy;

test.before(async () => {
  ({ createAuthApi } = await import("../src/api/auth-api.mjs"));
  ({ createAuthController } = await import("../src/auth/auth-controller.mjs"));
  ({ renderers } = await import("../src/renderers/auth-modal.mjs"));
  policy = await import("../src/policies/id-recovery-policy.mjs");
});

function withFormData(values, callback) {
  const PreviousFormData = global.FormData;
  global.FormData = class {
    get(name) { return values[name] || ""; }
    has(name) { return Boolean(values[name]); }
  };
  return Promise.resolve(callback()).finally(() => { global.FormData = PreviousFormData; });
}

function controllerFixture(requestIdRecovery, emailValid = () => true) {
  const state = { authView: "find-id", authError: "", authDraft: {}, authDuplicateChecks: {} };
  const notices = [];
  let renders = 0;
  const controller = createAuthController({
    state,
    root: { querySelector: () => null },
    document: {},
    render() { renders += 1; },
    normalizeText: String,
    existingNicknames: [],
    existingUserIds: [],
    userIdError: () => "",
    emailValid,
    phoneValid: () => true,
    api: { requestIdRecovery },
    notice(message) { notices.push(message); },
  });
  return { controller, notices, state, renders: () => renders };
}

test("web ID recovery uses the email endpoint and strips legacy fields", async () => {
  const calls = [];
  const api = createAuthApi({ request: async (...args) => { calls.push(args); return { ok: true }; } });
  assert.equal(api.findId, undefined);
  await api.requestIdRecovery({
    name: "Member",
    email: "member@example.com",
    method: "email",
    phone: "010-0000-0000",
  });
  assert.equal(calls[0][0], "/api/auth/id-recovery/request");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    name: "Member",
    email: "member@example.com",
  });
});

for (const [label, response] of [
  ["accepted", { ok: true }],
  ["no-match-shaped", {}],
  ["legacy-masked-shaped", { maskedUserId: "m***r" }],
]) {
  test(`web shows one privacy-safe result for ${label} responses`, async () => {
    let payload;
    const fixture = controllerFixture(async (value) => { payload = value; return response; });
    await withFormData({
      name: " Member ",
      email: " member@example.com ",
      phone: "010-0000-0000",
    }, () => fixture.controller.submit({}));
    assert.deepEqual(payload, { name: "Member", email: "member@example.com" });
    assert.deepEqual(fixture.notices, [policy.ID_RECOVERY_ACCEPTED_NOTICE]);
    assert.equal(fixture.state.authView, "login");
    assert.equal(fixture.renders(), 1);
  });
}

test("web maps ID recovery failures without exposing backend account details", async () => {
  for (const [error, expected] of [
    [Object.assign(new Error("backend detail"), { status: 429, code: "AUTH_RATE_LIMITED" }), policy.ID_RECOVERY_RATE_LIMIT_NOTICE],
    [Object.assign(new Error("mailer detail"), { status: 503, code: "PASSWORD_RESET_UNAVAILABLE" }), policy.ID_RECOVERY_UNAVAILABLE_NOTICE],
    [new Error("sensitive backend detail"), policy.ID_RECOVERY_FAILURE_NOTICE],
  ]) {
    const fixture = controllerFixture(async () => { throw error; });
    await withFormData({ name: "Member", email: "member@example.com" }, () => fixture.controller.submit({}));
    assert.equal(fixture.state.authError, expected);
    assert.equal(fixture.state.authView, "find-id");
  }
});

test("web validates email before sending an ID recovery request", async () => {
  let calls = 0;
  const fixture = controllerFixture(async () => { calls += 1; }, () => false);
  await withFormData({ name: "Member", email: "invalid" }, () => fixture.controller.submit({}));
  assert.equal(calls, 0);
  assert.equal(fixture.state.authError, "이메일 형식을 확인해주세요.");
});

test("web ID recovery view removes phone and explains email and Google recovery", () => {
  const ctx = {
    icons: { close: "x", eye: "eye" },
    escapeAttr: String,
    escapeHtml: String,
    accountWithdrawalNotice: "",
  };
  const base = {
    title: "아이디 찾기",
    authError: "",
    isSignup: false,
    isFindPassword: false,
    isWithdraw: false,
    isGoogleWithdraw: false,
    isLoggedIn: false,
    nicknameChecked: false,
    userIdChecked: false,
    authDraft: {},
    authUserIdWarning: "",
  };
  const findId = renderers.AuthModalView(ctx, { ...base, isFindId: true });
  assert.match(findId, new RegExp(policy.ID_RECOVERY_HELP));
  assert.match(findId, new RegExp(policy.ID_RECOVERY_GOOGLE_NOTICE));
  assert.match(findId, /이메일로 아이디 받기/);
  assert.doesNotMatch(findId, /name="phone"/);

  const findPassword = renderers.AuthModalView(ctx, {
    ...base,
    title: "비밀번호 찾기",
    isFindId: false,
    isFindPassword: true,
  });
  assert.match(findPassword, /name="phone"/);
});

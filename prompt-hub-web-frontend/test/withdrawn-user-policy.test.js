const test = require("node:test");
const assert = require("node:assert/strict");

let normalizers;
let getAdminUserActivityPresentation;
let normalizeDisplayAuthorName;

test.before(async () => {
  ({ normalizers } = await import("../src/api/normalizers.mjs"));
  ({ getAdminUserActivityPresentation } = await import("../src/admin/admin-view.mjs"));
  ({ normalizeDisplayAuthorName } = await import("../src/runtime/app-helpers.mjs"));
});

test("withdrawn members use a stable anonymous presentation", () => {
  const user = normalizers.normalizeAdminUser({ id: 7, nickname: "withdrawn_user_7", active: false });
  assert.equal(user.nickname, "탈퇴한 사용자");
  assert.equal(user.active, false);
});

test("active members keep their nickname and management actions", () => {
  const user = normalizers.normalizeAdminUser({ id: 8, nickname: "활성 사용자", active: true });
  assert.equal(user.nickname, "활성 사용자");
  assert.equal(user.active, true);
});

test("withdrawn activity never exposes the internal anonymized nickname", () => {
  const activity = normalizers.normalizeAdminUserActivity({ member: { id: 9, nickname: "withdrawn_user_9", active: false }, activities: [] });
  assert.equal(activity.nickname, "탈퇴한 사용자");
  assert.equal(activity.active, false);
});

test("past prompts and comments normalize withdrawn authors before rendering", () => {
  const prompt = normalizers.normalizePrompt({ id: 10, title: "과거 글", author: { id: 9, nickname: "withdrawn_user_9", active: false } });
  const comment = normalizers.normalizeComment({ id: 11, content: "과거 댓글", author: { id: 9, nickname: "withdrawn_user_9", active: false } });
  assert.equal(prompt.author, "탈퇴한 사용자");
  assert.equal(comment.author, "탈퇴한 사용자");
});

test("legacy persisted author shapes are anonymized at the display boundary", () => {
  assert.equal(normalizeDisplayAuthorName("withdrawn_user_12", "탈퇴한 사용자"), "탈퇴한 사용자");
  assert.equal(normalizeDisplayAuthorName({ nickname: "legacy", active: false }, "탈퇴한 사용자"), "탈퇴한 사용자");
  assert.equal(normalizeDisplayAuthorName({ nickname: "active", active: true }, "탈퇴한 사용자"), "active");
});

test("a demo author without a member id is not mislabeled as withdrawn", () => {
  const presentation = getAdminUserActivityPresentation({ nickname: "데모 작성자", active: true }, "");
  assert.equal(presentation.displayNickname, "데모 작성자");
  assert.equal(presentation.isWithdrawn, false);
  assert.equal(presentation.canManage, false);
  assert.match(presentation.unavailableMessage, /샘플 작성자/);
});

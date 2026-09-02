const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const policyModule = import(pathToFileURL(path.resolve(__dirname, "../src/prompts/prompt-display-policy.mjs")));

const identity = (value, fallback) => String(value || fallback);
const html = (value) => String(value).replaceAll("<", "&lt;");
const attr = (value) => html(value).replaceAll('"', "&quot;");

test("prompt display policy owns author identity and withdrawn controls", async () => {
  const { getDisplayPromptAuthor, getPromptAuthorId, renderAuthorControl } = await policyModule;
  assert.equal(getDisplayPromptAuthor({ author: "member" }, { currentUser: "member", isLoggedIn: true, normalizeAuthor: identity, withdrawnLabel: "탈퇴한 사용자" }), "나");
  assert.equal(getDisplayPromptAuthor({ author: "탈퇴한 사용자" }, { normalizeAuthor: identity, withdrawnLabel: "탈퇴한 사용자" }), "탈퇴한 사용자");
  assert.equal(getPromptAuthorId({ raw: { memberId: 42 } }), "42");
  assert.match(renderAuthorControl({}, { author: "탈퇴한 사용자", authorId: "", withdrawn: true, escapeHtml: html, escapeAttr: attr }), /aria-disabled="true"/);
  assert.match(renderAuthorControl({}, { admin: true, author: "member", authorId: "7", withdrawn: false, escapeHtml: html, escapeAttr: attr }), /data-admin-user-id="7"/);
});

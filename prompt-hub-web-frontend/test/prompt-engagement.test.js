const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPromptEngagementController } = require("../src/interactions/prompt-engagement-controller.js");
const { bindPromptEngagementEvents } = require("../src/interactions/prompt-engagement-events.js");
const commentModel = require("../src/interactions/comment-model.js");

function createContext(overrides = {}) {
  const calls = [];
  const state = { isLoggedIn: true, likedPromptIds: new Set(), likedCommentIds: new Set(), pendingUnsaveIds: new Set(), route: "home" };
  return {
    calls,
    ctx: {
      state, savedPrompts: [], guard: () => false, notice: (message) => calls.push(`notice:${message}`), render: () => calls.push("render"),
      findPrompt: (id) => ({ id }), findComment: () => null, findPromptIdByComment: () => "", getCommentLikes: () => 0, canDeleteComment: () => false,
      getPromptMutationContext: () => ({}), getCommentMutationContext: () => ({}), runMutation: async (action) => { calls.push(action); return true; },
      isHiddenDemoPrompt: () => false, isBackendId: () => false, refreshMyPage: () => calls.push("refresh"), callApi: () => Promise.resolve(), hasBackendToken: () => false,
      hydrateComments() {}, revisionKey: () => "revision", applyExistingSaved() {}, applyBackendUnsaved() {}, togglePendingUnsave() {}, applyUnsaved() {}, applyNewSaved() {},
      applyPromptLiked: () => calls.push("liked"), applyPromptUnliked: () => calls.push("unliked"), toggleCommentLiked() {}, addPromptCommentState() {}, addReplyState() {},
      toggleReplyState() {}, toggleEditState() {}, updateCommentState: () => false, ...overrides,
    },
  };
}

test("prompt like controller performs backend mutation and state transition", async () => {
  const { ctx, calls } = createContext();
  await createPromptEngagementController(ctx).toggleLikePrompt("42");
  assert.deepEqual(calls.slice(0, 3), ["likePrompt", "liked", "refresh"]);
});

test("engagement controller redirects guests before mutations", async () => {
  const { ctx, calls } = createContext();
  ctx.state.isLoggedIn = false;
  await createPromptEngagementController(ctx).toggleSavedPrompt("42");
  assert.equal(ctx.state.authView, "login");
  assert.equal(calls.some((item) => item === "savePrompt"), false);
});

test("engagement event binder delegates save and like controls", () => {
  const listeners = {};
  const button = (name, dataset) => ({ dataset, addEventListener(type, handler) { listeners[`${name}:${type}`] = handler; } });
  const save = button("save", { savePrompt: "1" });
  const like = button("like", { likePrompt: "2" });
  const calls = [];
  bindPromptEngagementEvents({ querySelectorAll(selector) { return selector === "[data-save-prompt]" ? [save] : selector === "[data-like-prompt]" ? [like] : []; } }, {
    toggleSavedPrompt: (id) => calls.push(`save:${id}`), toggleLikePrompt: (id) => calls.push(`like:${id}`),
  });
  const event = { preventDefault() {}, stopPropagation() {} };
  listeners["save:click"](event); listeners["like:click"](event);
  assert.deepEqual(calls, ["save:1", "like:2"]);
});

test("app delegates engagement workflows without duplicate controller functions", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(frontendRoot, "src", "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(frontendRoot, "index.html"), "utf8");
  assert.match(indexHtml, /interactions\/prompt-engagement-controller\.js/);
  assert.match(appSource, /createPromptEngagementController/);
  ["toggleSavedPrompt", "toggleLikePrompt", "toggleLikeComment", "addPromptComment", "addCommentReply", "updateOwnComment"].forEach((name) => {
    assert.doesNotMatch(appSource, new RegExp(`function ${name}\\s*\\(`));
  });
});

test("comment model recursively finds, counts and stably sorts threads", () => {
  const comments = [{ id: "a", likes: 1, replies: [{ id: "b", likes: 3 }] }, { id: "c", likes: 3 }, { id: "d", deleted: true }];
  assert.equal(commentModel.findCommentInList(comments, "b").id, "b");
  assert.equal(commentModel.countCommentThread(comments), 3);
  assert.deepEqual(commentModel.sortComments(comments).map((item) => item.id), ["c", "a", "d"]);
});

test("comment model synchronizes counts across prompt collections", () => {
  const shared = { id: "p" };
  const other = { id: "p" };
  const count = commentModel.syncPromptCommentCount("p", [{ id: "a", replies: [{ id: "b" }] }], [[shared], [other]]);
  assert.equal(count, 2);
  assert.equal(shared.commentCount, 2);
  assert.equal(other.comments, 2);
});

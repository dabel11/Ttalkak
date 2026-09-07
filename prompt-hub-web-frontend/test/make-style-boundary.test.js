const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const globalStyles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const makeStyles = fs.readFileSync(path.join(root, "src", "styles", "make.css"), "utf8");

test("Make feature overrides remain owned by the Make stylesheet", () => {
  const ownedSelectors = [
    ".message-result-prompt",
    ".message-question-section label",
    ".make-info-disclosure",
    ".recent-thread.active .recent-thread-main strong::before",
  ];

  ownedSelectors.forEach((selector) => {
    assert.match(makeStyles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(globalStyles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("shared styles contain no Make route selectors", () => {
  const makeOnlySelector = /^\s*\.(?:make-|chat-feed|composer|message(?:\b|-)|assistant-group|user-group|recent-thread|template-|thinking-|send-button|newchat-button|user-message|thread-folder|cancel-edit-message)/m;
  assert.doesNotMatch(globalStyles, makeOnlySelector);
  assert.match(makeStyles, /\.make-page/);
  assert.match(makeStyles, /\.composer/);
  assert.match(makeStyles, /\.recent-thread/);
});

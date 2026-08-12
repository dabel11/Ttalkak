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

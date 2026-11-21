import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const extensionRoot = path.resolve(import.meta.dirname, "..");
const chatFeed = fs.readFileSync(path.join(extensionRoot, "src/components/ChatFeed.jsx"), "utf8");
const css = fs.readFileSync(path.join(extensionRoot, "src/styles.css"), "utf8");

test("typing indicator dots have their own class, distinct from progress text", () => {
  const dotElements = chatFeed.match(/<span className="typing-dot" aria-hidden="true" \/>/g) || [];
  assert.equal(dotElements.length, 3);
  assert.match(chatFeed, /<span className="typing-progress">/);
});

test("dot dimensions and animation cannot apply to the progress label", () => {
  assert.match(css, /\.typing-message\s*>\s*\.typing-dot\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;[^}]*animation:/s);
  assert.match(css, /\.typing-message\s*>\s*\.typing-dot:nth-child\(2\)/);
  assert.match(css, /\.typing-message\s*>\s*\.typing-dot:nth-child\(3\)/);
  assert.doesNotMatch(css, /\.typing-message\s+span\s*\{/);
  assert.doesNotMatch(css, /\.typing-progress\s*\{[^}]*\bwidth:\s*7px/s);
});

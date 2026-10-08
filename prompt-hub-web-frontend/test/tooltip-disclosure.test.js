const test = require("node:test");
const assert = require("node:assert/strict");

let bindTooltipDisclosure;
let setTooltipExpanded;

test.before(async () => {
  ({ bindTooltipDisclosure, setTooltipExpanded } = await import("../src/interactions/tooltip-disclosure.mjs"));
});

function createButton() {
  const listeners = new Map();
  const attributes = new Map([["aria-expanded", "false"]]);
  const classes = new Set();
  const button = {
    ownerDocument: { activeElement: null },
    addEventListener(type, handler) { listeners.set(type, handler); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    matches(selector) { return selector === ":focus-visible" && this.ownerDocument.activeElement === this; },
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.({ preventDefault() {}, stopPropagation() {}, ...event });
    },
  };
  return button;
}

test("tooltip disclosure toggles repeatedly and Escape closes without moving focus", () => {
  const changes = [];
  const button = createButton();
  bindTooltipDisclosure(button, { onChange: (expanded) => changes.push(expanded) });

  button.dispatch("click");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(button.classList.contains("show-tip"), true);

  button.dispatch("click");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(button.classList.contains("tooltip-dismissed"), true);

  button.dispatch("click");
  button.ownerDocument.activeElement = button;
  button.dispatch("keydown", { key: "Escape" });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(button.ownerDocument.activeElement, button);
  button.dispatch("keydown", { key: "Enter" });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  button.dispatch("keydown", { key: " " });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.deepEqual(changes, [true, false, true, false, true, false]);
});

test("keyboard focus opens the tooltip and blur closes it", () => {
  const button = createButton();
  bindTooltipDisclosure(button);
  button.ownerDocument.activeElement = button;
  button.dispatch("focus");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  button.ownerDocument.activeElement = null;
  button.dispatch("blur");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("hover opens the tooltip and Escape keeps it dismissed until the pointer leaves", () => {
  const button = createButton();
  bindTooltipDisclosure(button);
  button.dispatch("pointerenter", { pointerType: "mouse" });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  button.ownerDocument.activeElement = button;
  button.dispatch("keydown", { key: "Escape" });
  button.dispatch("pointerenter", { pointerType: "mouse" });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  button.dispatch("pointerleave", { pointerType: "mouse" });
  button.dispatch("pointerenter", { pointerType: "mouse" });
  assert.equal(button.getAttribute("aria-expanded"), "true");
});

test("touch pointer entry waits for the explicit click", () => {
  const button = createButton();
  bindTooltipDisclosure(button);
  button.dispatch("pointerenter", { pointerType: "touch" });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  button.dispatch("click", { detail: 1 });
  assert.equal(button.getAttribute("aria-expanded"), "true");
});

test("the pointer click that focuses a tooltip opens it and a second click closes it", () => {
  const button = createButton();
  bindTooltipDisclosure(button);
  button.dispatch("pointerdown");
  button.ownerDocument.activeElement = button;
  button.dispatch("focus");
  button.dispatch("click", { detail: 1 });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  button.dispatch("pointerdown");
  button.dispatch("click", { detail: 1 });
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("setTooltipExpanded keeps class and ARIA state synchronized", () => {
  const button = createButton();
  assert.equal(setTooltipExpanded(button, true), true);
  assert.equal(button.classList.contains("show-tip"), true);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(setTooltipExpanded(button, false, { dismissed: true }), false);
  assert.equal(button.classList.contains("show-tip"), false);
  assert.equal(button.classList.contains("tooltip-dismissed"), true);
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("binding the same rendered button twice does not duplicate toggle handlers", () => {
  const button = createButton();
  bindTooltipDisclosure(button);
  bindTooltipDisclosure(button);
  button.dispatch("click", { detail: 1 });
  assert.equal(button.getAttribute("aria-expanded"), "true");
});

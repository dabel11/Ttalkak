import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const inlineSource = fs.readFileSync(new URL("../public/inline-improve.js", import.meta.url), "utf8");

async function setup({ improved = "개선 문단 하나\n개선 문단 둘", command = "success" } = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body><main><form><div id="prompt-textarea" contenteditable="true"><p>원본 프롬프트</p></div></form></main></body></html>',
    { url: "https://chatgpt.com/", pretendToBeVisual: true, runScripts: "outside-only" },
  );
  const { window } = dom;
  const editor = window.document.querySelector("#prompt-textarea");
  Object.defineProperty(editor, "isContentEditable", { configurable: true, value: true });
  Object.defineProperty(editor, "innerText", {
    configurable: true,
    get() {
      // Simulates browser rich-editor paragraph spacing differing from plain \n.
      return [...this.querySelectorAll("p")].map((p) => p.textContent).join("\n\n");
    },
  });
  editor.getBoundingClientRect = () => ({
    width: 640, height: 64, top: 420, left: 110, right: 750, bottom: 484,
  });
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function exposedShadow(init) {
    return attach.call(this, { ...init, mode: "open" });
  };

  let writes = 0;
  window.document.execCommand = (name, _ui, value) => {
    assert.equal(name, "insertText");
    writes++;
    if (command === "unsupported") return false;
    if (command === "partial") {
      editor.innerHTML = "<p>부분 변경</p>";
      return true;
    }
    editor.replaceChildren(...String(value).split("\n").map((line) => {
      const p = window.document.createElement("p");
      p.textContent = line || "\u00a0";
      return p;
    }));
    editor.dispatchEvent(new window.InputEvent("input", {
      bubbles: true, inputType: "insertText", data: String(value),
    }));
    return true;
  };
  window.chrome = {
    runtime: {
      id: "test-extension",
      sendMessage(_message, callback) { callback({ ok: true, improvedPrompt: improved }); },
      lastError: undefined,
    },
    storage: {
      local: { get(_keys, callback) { callback({ pp_inline_improve_enabled: true }); } },
      onChanged: { addListener() {} },
    },
  };
  window.eval(inlineSource);
  await new Promise((resolve) => setTimeout(resolve, 55));
  const shadow = window.document.getElementById("ttalkak-inline-root").shadowRoot;
  assert.ok(shadow);
  function trigger() { shadow.getElementById("tt-button").click(); }
  return {
    dom, window, editor, shadow, trigger,
    get writes() { return writes; },
  };
}

test("multiline ChatGPT editor keeps the native editing transaction and accepts equivalent paragraph breaks", async (t) => {
  const h = await setup();
  t.after(() => h.dom.window.close());
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.writes, 1);
  assert.match(h.shadow.getElementById("tt-message").textContent, /개선 적용 완료/);
  assert.equal(h.editor.querySelectorAll("p").length, 2);
  assert.equal(h.editor.textContent, "개선 문단 하나개선 문단 둘");
  assert.equal(h.shadow.getElementById("tt-restore").hidden, false);
});

test("restore also recognizes editor paragraph markup after a successful improvement", async (t) => {
  const h = await setup();
  t.after(() => h.dom.window.close());
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  h.shadow.getElementById("tt-restore").click();
  assert.equal(h.writes, 2);
  assert.equal(h.editor.textContent, "원본 프롬프트");
  assert.match(h.shadow.getElementById("tt-message").textContent, /원본 프롬프트를 복원/);
});

test("unsupported native editor insertion does not fall back to raw DOM mutation", async (t) => {
  const h = await setup({ command: "unsupported" });
  t.after(() => h.dom.window.close());
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.editor.textContent, "원본 프롬프트");
  assert.equal(h.writes, 1);
  assert.match(h.shadow.getElementById("tt-message").textContent, /입력창 교체에 실패/);
  assert.equal(h.shadow.getElementById("tt-copy"), null);
  assert.equal(h.shadow.querySelectorAll(".tt-actions button").length, 3);
});

test("partial editor insertion blocks an unsafe second overwrite", async (t) => {
  const h = await setup({ command: "partial" });
  t.after(() => h.dom.window.close());
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  assert.match(h.shadow.getElementById("tt-message").textContent, /일부 바뀌었을 수/);
  assert.equal(h.shadow.getElementById("tt-apply").disabled, true);
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.writes, 1);
  assert.equal(h.editor.textContent, "부분 변경");
});

test("a real user edit after preview is never overwritten", async (t) => {
  const h = await setup();
  t.after(() => h.dom.window.close());
  h.trigger();
  h.editor.querySelector("p").textContent = "사용자가 직접 수정한 문장";
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.writes, 0);
  assert.equal(h.editor.textContent, "사용자가 직접 수정한 문장");
  assert.match(h.shadow.getElementById("tt-message").textContent, /원문을 보호/);
});
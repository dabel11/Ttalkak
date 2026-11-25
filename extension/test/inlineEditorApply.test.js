import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const inlineSource = fs.readFileSync(new URL("../public/inline-improve.js", import.meta.url), "utf8");

async function setup({ improved = "개선 문단 하나\n개선 문단 둘", command = "success", reply = {} } = {}) {
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
  let onStorageChange;
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
      sendMessage(message, callback) { callback({ ok: true, improvedPrompt: improved, ...(typeof reply === "function" ? reply(message) : reply) }); },
      lastError: undefined,
    },
    storage: {
      local: { get(_keys, callback) { callback({ pp_inline_improve_enabled: true }); } },
      onChanged: { addListener(listener) { onStorageChange = listener; } },
    },
  };
  window.eval(inlineSource);
  await new Promise((resolve) => setTimeout(resolve, 55));
  const shadow = window.document.getElementById("ttalkak-inline-root").shadowRoot;
  assert.ok(shadow);
  function trigger() { shadow.getElementById("tt-button").click(); }
  return {
    dom, window, editor, shadow, trigger,
    disable() { onStorageChange?.({ pp_inline_improve_enabled: { newValue: false } }, "local"); },
    get writes() { return writes; },
  };
}

test("multiline ChatGPT editor keeps the native editing transaction and accepts equivalent paragraph breaks", async (t) => {
  const h = await setup();
  t.after(async () => {
    // Disable the content script before jsdom's window teardown. The script
    // intentionally keeps a MutationObserver alive for SPA route changes;
    // closing the document while enabled can schedule a stale animation frame.
    h.disable();
    await new Promise((resolve) => setTimeout(resolve, 80));
    h.dom.window.close();
  });
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
  t.after(async () => {
    // Disable the content script before jsdom's window teardown. The script
    // intentionally keeps a MutationObserver alive for SPA route changes;
    // closing the document while enabled can schedule a stale animation frame.
    h.disable();
    await new Promise((resolve) => setTimeout(resolve, 80));
    h.dom.window.close();
  });
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  h.shadow.getElementById("tt-restore").click();
  assert.equal(h.writes, 2);
  assert.equal(h.editor.textContent, "원본 프롬프트");
  assert.match(h.shadow.getElementById("tt-message").textContent, /원본 프롬프트를 복원/);
});

test("unsupported native editor insertion does not fall back to raw DOM mutation", async (t) => {
  const h = await setup({ command: "unsupported" });
  t.after(async () => {
    // Disable the content script before jsdom's window teardown. The script
    // intentionally keeps a MutationObserver alive for SPA route changes;
    // closing the document while enabled can schedule a stale animation frame.
    h.disable();
    await new Promise((resolve) => setTimeout(resolve, 80));
    h.dom.window.close();
  });
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
  t.after(async () => {
    // Disable the content script before jsdom's window teardown. The script
    // intentionally keeps a MutationObserver alive for SPA route changes;
    // closing the document while enabled can schedule a stale animation frame.
    h.disable();
    await new Promise((resolve) => setTimeout(resolve, 80));
    h.dom.window.close();
  });
  h.trigger();
  h.shadow.getElementById("tt-apply").click();
  assert.match(h.shadow.getElementById("tt-message").textContent, /입력창 교체에 실패/);
  assert.equal(h.shadow.getElementById("tt-apply").disabled, true);
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.writes, 1);
  assert.equal(h.editor.textContent, "부분 변경");
});

test("a real user edit after preview is never overwritten", async (t) => {
  const h = await setup();
  t.after(async () => {
    // Disable the content script before jsdom's window teardown. The script
    // intentionally keeps a MutationObserver alive for SPA route changes;
    // closing the document while enabled can schedule a stale animation frame.
    h.disable();
    await new Promise((resolve) => setTimeout(resolve, 80));
    h.dom.window.close();
  });
  h.trigger();
  h.editor.querySelector("p").textContent = "사용자가 직접 수정한 문장";
  h.shadow.getElementById("tt-apply").click();
  assert.equal(h.writes, 0);
  assert.equal(h.editor.textContent, "사용자가 직접 수정한 문장");
  assert.match(h.shadow.getElementById("tt-message").textContent, /문장을 보호하기 위해 적용하지 않았/);
});
test("unchanged no-evidence response explains why and preserves the editor", async (t) => {
  const explanation = "관련 프롬프트 기법 근거를 찾지 못했습니다.";
  const h = await setup({ improved: "", reply: { ragStatus: "no_evidence", explanation } });
  t.after(async () => { h.disable(); await new Promise((resolve) => setTimeout(resolve, 80)); h.dom.window.close(); });
  h.trigger();
  assert.equal(h.shadow.getElementById("tt-message").textContent, explanation);
  assert.equal(h.shadow.getElementById("tt-text").textContent, "");
  assert.equal(h.shadow.getElementById("tt-apply").hidden, true);
  assert.equal(h.writes, 0);
});

test("inline answers keep the editor untouched until apply and errors preserve the draft", async (t) => {
  const calls = [];
  const continuation = { owner: "member:7", threadId: "41" };
  const h = await setup({ reply: (message) => {
    calls.push(message);
    if (calls.length === 1) return { mode: "ask", improvedPrompt: "", questions: ["독자는 누구인가요?"], continuation };
    if (calls.length === 2) return { error: "연결 오류" };
    return { improvedPrompt: "비전공자를 위한 안내문을 작성해 주세요.", questions: [] };
  } });
  t.after(async () => { h.disable(); await new Promise((resolve) => setTimeout(resolve, 80)); h.dom.window.close(); });
  h.trigger();
  const answer = h.shadow.getElementById("tt-answer");
  const submit = h.shadow.getElementById("tt-submit");
  assert.equal(answer.parentElement.hidden, false);
  assert.equal(submit.disabled, true);
  answer.value = "비전공자";
  answer.dispatchEvent(new h.window.Event("input"));
  submit.click();
  assert.equal(answer.value, "비전공자");
  submit.click();
  assert.equal(calls[2].prompt, "비전공자");
  assert.equal(calls[2].continuation.threadId, "41");
  assert.equal(calls[2].requestId, calls[1].requestId);
  assert.equal(answer.parentElement.hidden, true);
  assert.equal(h.writes, 0);
  h.shadow.getElementById("tt-apply").click();
  assert.match(h.editor.textContent, /비전공자를 위한/);
  h.shadow.getElementById("tt-restore").click();
  assert.equal(h.editor.textContent, "원본 프롬프트");
});

(() => {
  "use strict";
  const KEY = "pp_inline_improve_enabled";
  const selectors = ({
    "chatgpt.com": ["#prompt-textarea", "[data-testid='composer'] [contenteditable='true']", "main form [contenteditable='true']"],
    "chat.openai.com": ["#prompt-textarea", "[data-testid='composer'] [contenteditable='true']"],
    "claude.ai": ["[data-testid='chat-input'] [contenteditable='true']", ".ProseMirror[contenteditable='true']"],
    "gemini.google.com": ["rich-textarea .ql-editor[contenteditable='true']", "rich-textarea [contenteditable='true']"]
  })[location.hostname];
  if (!selectors || !globalThis.chrome?.runtime?.id || !chrome.storage?.local) return;
  let enabled = false, input = null, busy = false, snapshot = null, scheduled = false;
  const host = document.createElement("div");
  host.id = "ttalkak-inline-root";
  host.style.cssText = "position:fixed;inset:0;width:0;height:0;z-index:2147483646;pointer-events:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = [
    "*,*:before,*:after{box-sizing:border-box}button{font:inherit;cursor:pointer}",
    "#tt-button{display:none;position:fixed;pointer-events:auto;padding:7px 11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#1e293b;box-shadow:0 3px 12px #0002;font:600 12px/1.4 system-ui,sans-serif}",
    "#tt-button:disabled{opacity:.6;cursor:wait}",
    "#tt-panel{display:none;position:fixed;pointer-events:auto;width:min(420px,calc(100vw - 24px));max-height:50vh;overflow:auto;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#1e293b;box-shadow:0 12px 30px #0003;font:13px/1.6 system-ui,sans-serif}",
    ".tt-title,.tt-change{color:#2563eb}.tt-title{font-weight:700;margin:0 0 8px}.tt-change{font-weight:600}",
    "#tt-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow-y:auto}",
    "#tt-message{font-size:12px;color:#64748b;margin:5px 0}",
    ".tt-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:12px}",
    ".tt-actions button{padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;font-size:12px}",
    "#tt-apply{background:#111827;color:white;border-color:#111827}",
    ".tt-actions button:disabled{opacity:.5;cursor:not-allowed}",
    "button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}",
    "[hidden]{display:none!important}",
    "@media(prefers-color-scheme:dark){#tt-panel,#tt-button{background:#202123;color:#f3f4f6;border-color:#4b5563}.tt-actions button{background:#292b2f;color:#f3f4f6;border-color:#4b5563}#tt-apply{background:#e5e7eb;color:#111827}}"
  ].join("");
  function button(id, text) {
    const el = document.createElement("button");
    el.id = id;
    el.type = "button";
    el.textContent = text;
    return el;
  }
  const trigger = button("tt-button", "✨ 딸깍 개선");
  const panel = document.createElement("section");
  panel.id = "tt-panel";
  panel.setAttribute("aria-label", "딸깍 개선 미리보기");
  const title = document.createElement("div");
  title.className = "tt-title";
  title.textContent = "✨ 개선된 프롬프트";
  const message = document.createElement("div");
  message.id = "tt-message";
  const text = document.createElement("div");
  text.id = "tt-text";
  const actions = document.createElement("div");
  actions.className = "tt-actions";
  const close = button("tt-close", "닫기");
  const apply = button("tt-apply", "개선 적용");
  const restore = button("tt-restore", "원본 복원");
  restore.hidden = true;
  actions.append(close, restore, apply);
  panel.append(title, message, text, actions);
  shadow.append(style, trigger, panel);
  const getText = (el) => el?.matches?.("textarea,input") ? el.value : (el?.innerText ?? el?.textContent ?? "");
  function visible(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 100 && r.height > 16 && s.display !== "none" && s.visibility !== "hidden";
  }
  function target() {
    for (const selector of selectors) {
      const el = Array.from(document.querySelectorAll(selector)).find(visible);
      if (el) return el;
    }
    return null;
  }
  function position() {
    if (!input) return;
    const r = input.getBoundingClientRect(), w = Math.min(420, innerWidth - 24);
    const bTop = r.bottom + 43 < innerHeight ? r.bottom + 5 : Math.max(8, r.top - 35);
    trigger.style.top = Math.round(bTop) + "px";
    trigger.style.left = Math.round(Math.max(12, Math.min(innerWidth - 140, r.right - 140))) + "px";
    panel.style.left = Math.round(Math.max(12, Math.min(innerWidth - w - 12, r.right - w))) + "px";
    panel.style.top = Math.round(bTop + 225 < innerHeight ? bTop + 43 : Math.max(8, r.top - Math.min(245, innerHeight / 2))) + "px";
  }
  function dismiss() { snapshot = null; panel.style.display = "none"; message.textContent = ""; }
  function refresh() {
    scheduled = false;
    if (!enabled || !document.body) return;
    if (!host.isConnected) document.body.append(host);
    const found = target();
    if (found !== input) { input = found; dismiss(); }
    trigger.style.display = input ? "block" : "none";
    position();
  }
  function schedule() {
    if (enabled && !scheduled) { scheduled = true; requestAnimationFrame(refresh); }
  }
  function toggle(on) {
    enabled = on === true;
    if (!enabled) {
      input = null; dismiss(); trigger.style.display = "none"; host.remove();
    } else schedule();
  }
  function preview(original, improved) {
    text.replaceChildren();
    if (!improved) { text.textContent = "프롬프트를 개선하려면 필요한 정보를 더 입력해 주세요."; return; }
    const originalWords = new Set((original.match(/[\p{L}\p{N}_]+/gu) || []).map((v) => v.toLowerCase()));
    for (const token of improved.split(/([\p{L}\p{N}_]+)/u)) {
      if (!token) continue;
      if (/^[\p{L}\p{N}_]+$/u.test(token) && !originalWords.has(token.toLowerCase())) {
        const mark = document.createElement("span");
        mark.className = "tt-change";
        mark.textContent = token;
        text.append(mark);
      } else text.append(document.createTextNode(token));
    }
  }
  function writeValue(el, value) {
    if (!el?.isConnected) return false;
    el.focus();
    if (el.matches("textarea,input")) {
      const proto = el.matches("textarea") ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles:true }));
      el.dispatchEvent(new Event("change", { bubbles:true }));
    } else if (el.isContentEditable) {
      const selection = getSelection(), range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand("insertText", false, value) || getText(el).trim() !== value.trim()) {
        el.replaceChildren(...value.split("\n").map((line) => {
          const p = document.createElement("p"); p.textContent = line || "\u00a0"; return p;
        }));
        el.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data:value }));
      }
    } else return false;
    return getText(el).trim() === value.trim();
  }
  trigger.addEventListener("click", () => {
    if (!enabled || busy || !input) return;
    const source = input, original = getText(source);
    if (!original.trim() || original.length > 12000) {
      dismiss(); panel.style.display = "block";
      text.textContent = !original.trim() ? "개선할 문장을 먼저 작성해 주세요." : "12,000자 이내로 입력해 주세요.";
      apply.hidden = true; restore.hidden = true; position(); return;
    }
    busy = true; trigger.disabled = true; trigger.textContent = "개선 중…"; dismiss();
    chrome.runtime.sendMessage({ type:"INLINE_IMPROVE", prompt:original }, (reply) => {
      busy = false; trigger.disabled = false; trigger.textContent = "✨ 딸깍 개선";
      if (!enabled || !source.isConnected || source !== input) return;
      const error = chrome.runtime.lastError?.message || reply?.error;
      const improved = error ? "" : String(reply?.improvedPrompt || "").trim();
      snapshot = { source, original, improved, applied:false };
      preview(original, improved);
      if (error) text.textContent = "개선에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      const changed = getText(source) !== original;
      message.textContent = error ? String(error) : changed ? "입력 내용이 변경되어 적용할 수 없습니다. 다시 개선해 주세요." :
        improved ? "" : "추가 정보가 필요한 요청입니다.";
      apply.hidden = !improved; apply.disabled = changed; restore.hidden = true;
      panel.style.display = "block"; position();
    });
  });
  apply.addEventListener("click", () => {
    if (!snapshot || snapshot.applied || !snapshot.improved) return;
    if (getText(snapshot.source) !== snapshot.original) {
      message.textContent = "작성 중인 문장을 보호하기 위해 적용하지 않았습니다."; apply.disabled = true; return;
    }
    if (!writeValue(snapshot.source, snapshot.improved)) {
      message.textContent = "입력창 교체에 실패했습니다."; return;
    }
    snapshot.applied = true; apply.hidden = true; restore.hidden = false;
    message.textContent = "개선 적용 완료 · AI 전송은 직접 해 주세요.";
  });
  restore.addEventListener("click", () => {
    if (!snapshot?.applied) return;
    if (getText(snapshot.source).trim() !== snapshot.improved.trim()) {
      message.textContent = "적용 후 수정된 문장은 덮어쓰지 않습니다."; return;
    }
    if (!writeValue(snapshot.source, snapshot.original)) {
      message.textContent = "원본 복원에 실패했습니다."; return;
    }
    snapshot.applied = false; apply.hidden = false; apply.disabled = false; restore.hidden = true;
    message.textContent = "원본 프롬프트를 복원했습니다.";
  });
  close.addEventListener("click", dismiss);
  chrome.storage.local.get([KEY], (result) => { if (!chrome.runtime.lastError) toggle(result?.[KEY]); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) toggle(changes[KEY].newValue);
  });
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
  addEventListener("resize", schedule, { passive:true });
  addEventListener("scroll", schedule, { passive:true, capture:true });
})();
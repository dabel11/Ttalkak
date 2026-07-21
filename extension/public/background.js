chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXECUTE_PROMPT") return false;

  findTargetTab(message.target, async (tab) => {
    if (!tab?.id || !message.prompt) {
      sendResponse({ ok: false, error: "No supported active tab or prompt." });
      return;
    }

    try {
      const targetKind = getTargetKind(tab.url);
      const promptForTarget = targetKind === "gemini" ? flattenPromptForGemini(message.prompt) : message.prompt;

      if (isClaudePage(tab.url)) {
        sendResponse({ ok: false, fallback: "clipboard", error: "Claude uses clipboard fallback." });
        return;
      }

      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }

      const target = { tabId: tab.id };

      const domResult = await chrome.scripting.executeScript({
        target,
        func: writePromptIntoPage,
        args: [promptForTarget, targetKind],
      });

      if (domResult?.[0]?.result?.ok) {
        await sleep(150);
        await submitInPage(tab.id, targetKind);
        sendResponse({ ok: true, method: domResult[0].result.method, submitted: true });
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: focusPromptInput,
        args: [targetKind],
      });

      await sleep(120);

      await insertTextWithDebugger(tab.id, tab.url, promptForTarget);

      const verifyResult = await chrome.scripting.executeScript({
        target,
        func: pageHasPromptText,
        args: [promptForTarget, targetKind],
      });

      if (!verifyResult?.[0]?.result) {
        throw new Error("Prompt text was not detected in the target input.");
      }

      await sleep(150);
      await submitInPage(tab.id, targetKind);
      sendResponse({ ok: true, method: "debugger", submitted: true });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  });

  return true;
});

async function findTargetTab(targetName = "auto", callback) {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = activeTabs[0];

  if (targetName === "chatgpt") {
    const chatGptTabs = await chrome.tabs.query({
      url: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    });
    callback(preferActiveTab(activeTab, chatGptTabs, isChatGptPage));
    return;
  }

  if (targetName === "gemini") {
    const geminiTabs = await chrome.tabs.query({
      url: ["https://gemini.google.com/*"],
    });
    callback(preferActiveTab(activeTab, geminiTabs, isGeminiPage));
    return;
  }

  if (targetName === "auto" && isSupportedAiPage(activeTab?.url)) {
    callback(activeTab);
    return;
  }

  callback(undefined);
}

function preferActiveTab(activeTab, tabs, matcher) {
  if (matcher(activeTab?.url)) return activeTab;
  return tabs[0];
}

function isSupportedAiPage(url = "") {
  return (
    url.startsWith("https://chatgpt.com/") ||
    url.startsWith("https://chat.openai.com/") ||
    url.startsWith("https://claude.ai/") ||
    url.startsWith("https://gemini.google.com/")
  );
}

function isClaudePage(url = "") {
  return url.startsWith("https://claude.ai/");
}

function isChatGptPage(url = "") {
  return url.startsWith("https://chatgpt.com/") || url.startsWith("https://chat.openai.com/");
}

function isGeminiPage(url = "") {
  return url.startsWith("https://gemini.google.com/");
}

function getTargetKind(url = "") {
  if (isChatGptPage(url)) return "chatgpt";
  if (isGeminiPage(url)) return "gemini";
  return "generic";
}

function flattenPromptForGemini(prompt = "") {
  return prompt
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitInPage(tabId, targetKind) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: submitPromptInPage,
      args: [targetKind],
    });
  } catch (_error) {
    // 전송 실패는 치명적 아님 — 사용자가 직접 Enter 가능
  }
}

async function insertTextWithDebugger(tabId, tabUrl, text) {
  if (!isDebuggerFallbackPage(tabUrl)) {
    throw new Error("Debugger fallback is not allowed on this site.");
  }

  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
  } catch (error) {
    throw new Error(`Debugger attach failed: ${error?.message || error}`);
  }

  try {
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
  } catch (error) {
    throw new Error(`Debugger text insertion failed: ${error?.message || error}`);
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(target);
      } catch (error) {
        console.warn("[TTALKAK] debugger detach failed", error);
      }
    }
  }
}

function isDebuggerFallbackPage(url = "") {
  return isChatGptPage(url) || isGeminiPage(url);
}

function focusPromptInput(targetKind = "generic") {
  function isEditable(element) {
    if (!element) return false;
    const tag = element.tagName;
    return tag === "TEXTAREA" || tag === "INPUT" || element.hasAttribute("contenteditable") || element.getAttribute("role") === "textbox";
  }

  function isVisibleEditable(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 20 || rect.height < 10) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findPromptTarget(kind = "generic") {
    const selectorsByKind = {
      chatgpt: [
        "#prompt-textarea",
        "[data-testid='composer'] [contenteditable='true']",
        "[data-testid='composer'] textarea",
        "main form [contenteditable='true']",
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
      ],
      gemini: [
        "rich-textarea div.ql-editor[contenteditable='true']",
        "rich-textarea [contenteditable='true']",
        "div.ql-editor[contenteditable='true']",
        "[aria-label*='Enter a prompt' i]",
        "[aria-label*='prompt' i]",
        "[contenteditable='true']",
        "textarea",
      ],
      generic: [
        "#prompt-textarea",
        "textarea[placeholder]",
        "textarea",
        "[data-testid='chat-input'] [contenteditable]",
        "[data-testid='chat-input']",
        "[data-testid='composer'] [contenteditable]",
        "[data-testid='composer']",
        "[aria-label*='Message' i]",
        "[aria-label*='prompt' i]",
        "[aria-label*='message' i]",
        "[placeholder*='Message' i]",
        "div.ProseMirror[contenteditable]",
        "[contenteditable='plaintext-only']",
        "[contenteditable='true']",
        "[contenteditable]",
        "[role='textbox']",
      ],
    };

    const selectors = selectorsByKind[kind] || selectorsByKind.generic;
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .flatMap((element) => {
        if (isEditable(element)) return [element];
        return Array.from(element.querySelectorAll?.("textarea, input, [contenteditable], [role='textbox']") || []);
      })
      .filter(isVisibleEditable);

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.bottom - ar.bottom || br.width * br.height - ar.width * ar.height;
    });

    return candidates[0];
  }

  const target = findPromptTarget(targetKind);

  if (!target) {
    throw new Error("Prompt input not found.");
  }

  target.scrollIntoView({ block: "center", inline: "nearest" });
  target.click();
  target.focus();
}

function writePromptIntoPage(prompt, targetKind = "generic") {
  function isEditable(element) {
    if (!element) return false;
    const tag = element.tagName;
    return tag === "TEXTAREA" || tag === "INPUT" || element.hasAttribute("contenteditable") || element.getAttribute("role") === "textbox";
  }

  function isVisibleEditable(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 20 || rect.height < 10) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findPromptTarget(kind = "generic") {
    const selectorsByKind = {
      chatgpt: [
        "#prompt-textarea",
        "[data-testid='composer'] [contenteditable='true']",
        "[data-testid='composer'] textarea",
        "main form [contenteditable='true']",
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
      ],
      gemini: [
        "rich-textarea div.ql-editor[contenteditable='true']",
        "rich-textarea [contenteditable='true']",
        "div.ql-editor[contenteditable='true']",
        "[aria-label*='Enter a prompt' i]",
        "[aria-label*='prompt' i]",
        "[contenteditable='true']",
        "textarea",
      ],
      generic: [
        "#prompt-textarea",
        "textarea[placeholder]",
        "textarea",
        "[data-testid='chat-input'] [contenteditable]",
        "[data-testid='chat-input']",
        "[data-testid='composer'] [contenteditable]",
        "[data-testid='composer']",
        "[aria-label*='Message' i]",
        "[aria-label*='prompt' i]",
        "[aria-label*='message' i]",
        "[placeholder*='Message' i]",
        "div.ProseMirror[contenteditable]",
        "[contenteditable='plaintext-only']",
        "[contenteditable='true']",
        "[contenteditable]",
        "[role='textbox']",
      ],
    };

    const selectors = selectorsByKind[kind] || selectorsByKind.generic;
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .flatMap((element) => {
        if (isEditable(element)) return [element];
        return Array.from(element.querySelectorAll?.("textarea, input, [contenteditable], [role='textbox']") || []);
      })
      .filter(isVisibleEditable);

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.bottom - ar.bottom || br.width * br.height - ar.width * ar.height;
    });

    return candidates[0];
  }

  function setNativeValue(target, value) {
    const proto = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
  }

  function getEditableText(target) {
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      return target.value || "";
    }
    return target.innerText || target.textContent || "";
  }

  function includesPrompt(source, value) {
    const normalizedSource = source.replace(/\s+/g, " ").trim();
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    if (!normalizedValue) return false;
    if (normalizedSource.includes(normalizedValue)) return true;

    const start = normalizedValue.slice(0, Math.min(30, normalizedValue.length));
    const end = normalizedValue.slice(Math.max(0, normalizedValue.length - Math.min(30, normalizedValue.length)));
    return normalizedSource.includes(start) && normalizedSource.includes(end);
  }

  function dispatchTextInput(target, value) {
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: value,
      }),
    );
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveCaretToEnd(target) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function replaceEditableDom(target, value) {
    target.innerHTML = "";
    for (const line of value.split("\n")) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line || "\u00a0";
      target.appendChild(paragraph);
    }
    dispatchTextInput(target, value);
  }

  const target = findPromptTarget(targetKind);

  if (!target) return { ok: false, error: "Prompt input not found." };

  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
    setNativeValue(target, prompt);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: target.value === prompt, method: "native-value" };
  }

  target.scrollIntoView({ block: "center", inline: "nearest" });
  target.click();
  target.focus();
  moveCaretToEnd(target);

  try {
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
    const inserted = document.execCommand("insertText", false, prompt);
    dispatchTextInput(target, prompt);
    if (inserted && includesPrompt(getEditableText(target), prompt)) {
      return { ok: true, method: "exec-command" };
    }
  } catch (_error) {
    // Fall back to DOM replacement below.
  }

  replaceEditableDom(target, prompt);

  return { ok: includesPrompt(getEditableText(target), prompt), method: "dom-replace" };
}

function pageHasPromptText(prompt, targetKind = "generic") {
  function isEditable(element) {
    if (!element) return false;
    const tag = element.tagName;
    return tag === "TEXTAREA" || tag === "INPUT" || element.hasAttribute("contenteditable") || element.getAttribute("role") === "textbox";
  }

  function isVisibleEditable(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 20 || rect.height < 10) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findPromptTarget(kind = "generic") {
    const selectorsByKind = {
      chatgpt: [
        "#prompt-textarea",
        "[data-testid='composer'] [contenteditable='true']",
        "[data-testid='composer'] textarea",
        "main form [contenteditable='true']",
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
      ],
      gemini: [
        "rich-textarea div.ql-editor[contenteditable='true']",
        "rich-textarea [contenteditable='true']",
        "div.ql-editor[contenteditable='true']",
        "[aria-label*='Enter a prompt' i]",
        "[aria-label*='prompt' i]",
        "[contenteditable='true']",
        "textarea",
      ],
      generic: [
        "#prompt-textarea",
        "textarea[placeholder]",
        "textarea",
        "[data-testid='chat-input'] [contenteditable]",
        "[data-testid='chat-input']",
        "[data-testid='composer'] [contenteditable]",
        "[data-testid='composer']",
        "[aria-label*='Message' i]",
        "[aria-label*='prompt' i]",
        "[aria-label*='message' i]",
        "[placeholder*='Message' i]",
        "div.ProseMirror[contenteditable]",
        "[contenteditable='plaintext-only']",
        "[contenteditable='true']",
        "[contenteditable]",
        "[role='textbox']",
      ],
    };

    const selectors = selectorsByKind[kind] || selectorsByKind.generic;
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .flatMap((element) => {
        if (isEditable(element)) return [element];
        return Array.from(element.querySelectorAll?.("textarea, input, [contenteditable], [role='textbox']") || []);
      })
      .filter(isVisibleEditable);

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.bottom - ar.bottom || br.width * br.height - ar.width * ar.height;
    });

    return candidates[0];
  }

  function getEditableText(target) {
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      return target.value || "";
    }
    return target.innerText || target.textContent || "";
  }

  function includesPrompt(source, value) {
    const normalizedSource = source.replace(/\s+/g, " ").trim();
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    if (!normalizedValue) return false;
    if (normalizedSource.includes(normalizedValue)) return true;

    const start = normalizedValue.slice(0, Math.min(30, normalizedValue.length));
    const end = normalizedValue.slice(Math.max(0, normalizedValue.length - Math.min(30, normalizedValue.length)));
    return normalizedSource.includes(start) && normalizedSource.includes(end);
  }

  const target = findPromptTarget(targetKind);
  if (!target) return false;

  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
    return includesPrompt(target.value, prompt);
  }
  return includesPrompt(getEditableText(target), prompt);
}

function findPromptTarget(targetKind = "generic") {
  const selectorsByKind = {
    chatgpt: [
      "#prompt-textarea",
      "[data-testid='composer'] [contenteditable='true']",
      "[data-testid='composer'] textarea",
      "main form [contenteditable='true']",
      "textarea",
      "[contenteditable='true']",
      "[role='textbox']",
    ],
    gemini: [
      "rich-textarea div.ql-editor[contenteditable='true']",
      "rich-textarea [contenteditable='true']",
      "div.ql-editor[contenteditable='true']",
      "[aria-label*='Enter a prompt' i]",
      "[aria-label*='prompt' i]",
      "[contenteditable='true']",
      "textarea",
    ],
    generic: [
      "#prompt-textarea",
      "textarea[placeholder]",
      "textarea",
      "[data-testid='chat-input'] [contenteditable]",
      "[data-testid='chat-input']",
      "[data-testid='composer'] [contenteditable]",
      "[data-testid='composer']",
      "[aria-label*='Message' i]",
      "[aria-label*='prompt' i]",
      "[aria-label*='message' i]",
      "[placeholder*='Message' i]",
      "div.ProseMirror[contenteditable]",
      "[contenteditable='plaintext-only']",
      "[contenteditable='true']",
      "[contenteditable]",
      "[role='textbox']",
    ],
  };

  const selectors = selectorsByKind[targetKind] || selectorsByKind.generic;
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .flatMap((element) => {
      if (isEditable(element)) return [element];
      return Array.from(element.querySelectorAll?.("textarea, input, [contenteditable], [role='textbox']") || []);
    })
    .filter(isVisibleEditable);

  candidates.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return br.bottom - ar.bottom || br.width * br.height - ar.width * ar.height;
  });

  return candidates[0];
}

function getEditableText(target) {
  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
    return target.value || "";
  }
  return target.innerText || target.textContent || "";
}

function isEditable(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || element.hasAttribute("contenteditable") || element.getAttribute("role") === "textbox";
}

function isVisibleEditable(element) {
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width < 20 || rect.height < 10) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function setNativeValue(target, value) {
  const proto = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
}

function replaceEditableDom(target, prompt) {
  target.innerHTML = "";
  for (const line of prompt.split("\n")) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line || "\u00a0";
    target.appendChild(paragraph);
  }
  dispatchTextInput(target, prompt);
}

function dispatchTextInput(target, prompt) {
  target.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: prompt,
    }),
  );
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function moveCaretToEnd(target) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// 입력 후 실제 '전송'까지 수행 — 전송 버튼 클릭을 우선, 없으면 Enter 키 디스패치
function submitPromptInPage(targetKind = "generic") {
  const sendSelectorsByKind = {
    chatgpt: [
      "button[data-testid='send-button']",
      "button[data-testid='composer-send-button']",
      "button[aria-label*='Send' i]",
      "form button[type='submit']",
    ],
    gemini: [
      "button[aria-label*='Send' i]",
      "button[aria-label*='보내기']",
      "button.send-button",
    ],
    generic: [
      "button[data-testid='send-button']",
      "button[aria-label*='Send' i]",
      "button[aria-label*='보내기']",
      "button[type='submit']",
    ],
  };

  function isClickable(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 4 || rect.height < 4) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
  }

  const selectors = sendSelectorsByKind[targetKind] || sendSelectorsByKind.generic;
  for (const selector of selectors) {
    const button = Array.from(document.querySelectorAll(selector)).find(isClickable);
    if (button) {
      button.click();
      return { ok: true, method: "send-button" };
    }
  }

  // 폴백: 입력창에 Enter 키 이벤트 디스패치
  const input =
    document.activeElement ||
    document.querySelector("#prompt-textarea, [contenteditable='true'], textarea, [role='textbox']");
  if (input) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      input.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    return { ok: true, method: "enter-key" };
  }
  return { ok: false };
}

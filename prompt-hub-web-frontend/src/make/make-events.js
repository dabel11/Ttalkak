(function attachMakeEvents(global) {
  "use strict";
  const boundRoots = new WeakSet();
  function updateAskProgress(input) {
    const form = input.closest("[data-ask-answer-form]");
    if (!form) return;
    input.removeAttribute("aria-invalid");
    const required = [...form.querySelectorAll("[data-ask-answer-input][required]")];
    const completed = required.filter((item) => item.value.trim()).length;
    const progress = form.querySelector("[data-ask-answer-progress]");
    if (progress) progress.textContent = required.length ? `필수 답변 ${completed}/${required.length}개 입력` : "답변을 입력해주세요.";
  }
  function bindDelegatedMakeEvents(root, handlers) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);
    root.addEventListener("input", (event) => { const input = event.target.closest?.("[data-ask-answer-input]"); if (input) updateAskProgress(input); handlers.input?.(event); });
    root.addEventListener("keydown", (event) => handlers.keydown?.(event));
    root.addEventListener("change", (event) => handlers.change?.(event));
    root.addEventListener("submit", (event) => handlers.submit?.(event));
    root.addEventListener("click", (event) => handlers.click?.(event));
  }
  global.TtalkakMakeEvents = Object.freeze({ bindDelegatedMakeEvents, updateAskProgress });
})(window);

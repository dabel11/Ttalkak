  "use strict";
  function focusLatestAskAnswer(root = document) {
    globalThis.setTimeout(() => {
      const inputs = root.querySelectorAll("[data-ask-answer-form] [data-ask-answer-input]:not(:disabled)");
      const latestInput = inputs[inputs.length - 1];
      if (latestInput instanceof HTMLElement) latestInput.focus();
    }, 0);
  }
export { focusLatestAskAnswer };

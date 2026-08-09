(function attachMakeFocus(global) {
  "use strict";
  function focusLatestAskAnswer(root = document) {
    global.setTimeout(() => {
      const inputs = root.querySelectorAll("[data-ask-answer-form] [data-ask-answer-input]:not(:disabled)");
      const latestInput = inputs[inputs.length - 1];
      if (latestInput instanceof HTMLElement) latestInput.focus();
    }, 0);
  }
  global.TtalkakMakeFocus = Object.freeze({ focusLatestAskAnswer });
})(window);

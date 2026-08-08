(function attachMakeFocus(global) {
  "use strict";
  function focusLatestAskAnswer(root = document) {
    global.setTimeout(() => {
      const inputs = root.querySelectorAll("[data-ask-answer-form] [data-ask-answer-input]:not(:disabled)");
      inputs[inputs.length - 1]?.focus();
    }, 0);
  }
  global.TtalkakMakeFocus = Object.freeze({ focusLatestAskAnswer });
})(window);

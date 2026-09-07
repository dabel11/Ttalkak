  "use strict";
  function focusLatestAskAnswer(root = document) {
    globalThis.setTimeout(() => {
      const forms = root.querySelectorAll("[data-ask-answer-form]");
      const latestForm = forms[forms.length - 1];
      const input = latestForm?.querySelector("[data-ask-answer-input][required]:not(:disabled), [data-ask-answer-input]:not(:disabled)");
      if (input instanceof HTMLElement) input.focus();
    }, 0);
  }
export { focusLatestAskAnswer };

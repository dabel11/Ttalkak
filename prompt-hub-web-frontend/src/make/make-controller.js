(function attachMakeController(global) {
  "use strict";
  function collectAskAnswerPayload(form, model) {
    const inputs = [...form.querySelectorAll("[data-ask-answer-input]")];
    const questions = inputs.map((input) => ({ field: input.name, question: input.closest("li")?.querySelector("label span")?.textContent?.trim() || input.name, importance: input.required ? "required" : "recommended" }));
    const values = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
    return { inputs, result: model.composeAskAnswers(questions, values) };
  }
  global.TtalkakMakeController = Object.freeze({ collectAskAnswerPayload });
})(window);

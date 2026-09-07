// @ts-check
export function isAskResponse(data) {
  return data?.mode === "ask";
}

export function getRequiredAskQuestions(data) {
  return (data?.questions || []).filter(
    (question) => question.importance === "required" || question.required === true,
  );
}

module.exports = Object.freeze({
  ask: { mode: "ask", answer: "정확한 결과를 위해 추가 정보가 필요합니다.", summary: "목적과 대상 독자를 확인해주세요.", improvedPrompt: "", questions: [{ field: "purpose", question: "이 글의 목적은 무엇인가요?", reason: "결과의 방향을 정하는 데 필요합니다.", importance: "required" }, { field: "audience", question: "주요 독자는 누구인가요?", reason: "어휘 수준을 조정하는 데 필요합니다.", importance: "recommended" }], fields: [], ragStatus: "ok" },
  improve: { mode: "improve", answer: "요청을 구체화했습니다.", improvedPrompt: "신규 사용자를 대상으로 제품 출시 안내문을 작성하라.", questions: [], fields: [], ragStatus: "ok" },
});

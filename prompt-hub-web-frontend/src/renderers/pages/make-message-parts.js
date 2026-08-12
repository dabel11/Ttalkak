(function attachMakeMessageParts(global) {
  "use strict";

  function normalizeMessageQuestions(questions) {
    return global.TtalkakMakeMessageModel.normalizeQuestions(questions);
  }

  function normalizeMessageFields(fields) {
    return global.TtalkakMakeMessageModel.normalizeFields(fields);
  }

  function normalizeMessageTechniques(techniques) {
    return global.TtalkakMakeMessageModel.normalizeTechniques(techniques);
  }

  function normalizeMessageChanges(changes) {
    return global.TtalkakMakeMessageModel.normalizeChanges(changes);
  }

  function normalizeLegacyAskAnswer(text) {
    return global.TtalkakMakeMessageModel.parseLegacyQuestions(text);
  }

  function renderPromptTextWithPlaceholders(text, escapeHtml) {
    const source = String(text || "");
    const pattern = /\[[^\]\n]{1,80}\]/g;
    let cursor = 0;
    let html = "";

    for (const match of source.matchAll(pattern)) {
      html += escapeHtml(source.slice(cursor, match.index));
      html += `<span class="prompt-placeholder-chip" title="채워 넣으면 더 정확해지는 정보입니다">${escapeHtml(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }

    html += escapeHtml(source.slice(cursor));
    return html;
  }

  function MessageQuestionsView(ctx, data) {
    const { escapeAttr, escapeHtml } = ctx;
    const { isAsk, isThinking, messageId, questions } = data;
    const title = isAsk ? "답변이 필요한 정보" : "더 정확하게 개선하려면 아래 질문에 답해보세요";
    const progressId = `ask-${messageId}-progress`;

    return `
      <section class="message-question-section" aria-label="${escapeHtml(title)}" ${isAsk ? 'aria-live="polite"' : ""}>
        <strong>${escapeHtml(title)}</strong>
        ${isAsk ? `<form class="ask-answer-form" data-ask-answer-form="${escapeAttr(messageId)}" aria-busy="${isThinking ? "true" : "false"}" novalidate><div id="${escapeAttr(progressId)}" class="ask-answer-progress" data-ask-answer-progress role="status">${isThinking ? "답변을 전송하고 있습니다." : "필수 답변을 입력해주세요."}</div>` : ""}
        <ol>
          ${questions.map((item, index) => AskQuestionItemView(ctx, { index, isAsk, isThinking, item, messageId, progressId })).join("")}
        </ol>
        ${isAsk ? `<button class="ask-answer-submit" type="submit" ${isThinking ? "disabled" : ""}>${isThinking ? "전송 중" : "답변 제출"}</button></form>` : ""}
      </section>
    `;
  }

  function AskQuestionItemView(ctx, data) {
    const { escapeAttr, escapeHtml } = ctx;
    const { index, isAsk, isThinking, item, messageId, progressId } = data;
    const inputId = `ask-${messageId}-${item.field || index}`;
    const reasonId = `${inputId}-reason`;
    const describedBy = [item.reason ? reasonId : "", progressId].filter(Boolean).join(" ");
    return `<li class="${item.importance === "required" ? "required" : "recommended"}">
      <label for="${escapeAttr(inputId)}"><span>${escapeHtml(item.question)}</span><em>${item.importance === "required" ? "필수" : "선택"}</em></label>
      ${isAsk ? `<input id="${escapeAttr(inputId)}" name="${escapeAttr(item.field || `question_${index + 1}`)}" data-ask-answer-input ${item.importance === "required" ? 'required aria-required="true"' : ""} aria-describedby="${escapeAttr(describedBy)}" ${isThinking ? "disabled" : ""} />` : ""}
      ${item.reason ? `<small id="${escapeAttr(reasonId)}">${escapeHtml(item.reason)}</small>` : ""}
    </li>`;
  }

  function MessageFieldsView(ctx, data) {
    const { escapeHtml } = ctx;
    const { collapsible = false, fields } = data;
    const visibleFields = fields.filter((item) => item.status !== "filled");
    if (!visibleFields.length) return "";

    const content = `<ul>${visibleFields
      .map((item) => `<li class="${item.role}"><span>${escapeHtml(item.name)}</span><em>${item.role === "required" ? "필수" : item.role === "fact" ? "사실 확인" : "선택"}</em></li>`)
      .join("")}</ul>`;
    if (collapsible) return `<details class="message-detail-section message-field-section"><summary><span>채워야 할 정보</span><em>${visibleFields.length}</em></summary>${content}</details>`;

    return `<section class="message-field-section" aria-label="채워야 할 정보"><strong>채워야 할 정보</strong>${content}</section>`;
  }

  function MessageTechniquesView(ctx, data) {
    const { escapeHtml } = ctx;
    const { techniques } = data;

    return `
      <details class="message-detail-section message-technique-section">
        <summary><span>참고한 프롬프트 기법</span><em>${techniques.length}</em></summary>
        <ul class="message-technique-list">
          ${techniques
            .map(
              (item) => `
                <li>
                  <span>${escapeHtml(item.name)}</span>
                  ${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ""}
                </li>
              `,
            )
            .join("")}
        </ul>
      </details>
    `;
  }

  function MessageEvidenceNoticeView() {
    return `
      <div class="message-evidence-notice" role="note" title="검색된 참고 자료가 없어 기본 방식으로 결과를 생성했습니다.">
        <span aria-hidden="true">ⓘ</span>
        <span>참고 자료 없이 생성됨</span>
      </div>
    `;
  }

  function MessageChangesView(ctx, data) {
    const { escapeHtml } = ctx;
    const { changes } = data;

    return `
      <details class="message-detail-section message-changes-section">
        <summary><span>가정 및 개선 포인트</span><em>${changes.length}</em></summary>
        <ul>
          ${changes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </details>
    `;
  }

  global.TtalkakMakeMessageParts = Object.freeze({
    MessageChangesView,
    AskQuestionItemView,
    MessageEvidenceNoticeView,
    MessageFieldsView,
    MessageQuestionsView,
    MessageTechniquesView,
    normalizeMessageChanges,
    normalizeMessageFields,
    normalizeLegacyAskAnswer,
    normalizeMessageQuestions,
    normalizeMessageTechniques,
    renderPromptTextWithPlaceholders,
  });
})(window);

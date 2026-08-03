(function attachMakeMessageParts(global) {
  "use strict";

  function normalizeMessageQuestions(questions) {
    return Array.isArray(questions)
      ? questions
          .map((item, index) => {
            if (typeof item === "string") {
              const question = item.trim();
              return question ? { field: "", question, reason: "", importance: "recommended" } : null;
            }
            if (!item || typeof item !== "object") return null;
            const question = String(item.question || item.text || item.content || item.label || "").trim();
            if (!question) return null;
            const importance = String(item.importance || item.priority || "recommended").toLowerCase();
            return {
              field: String(item.field || item.key || item.name || `question_${index + 1}`).trim(),
              question,
              reason: String(item.reason || item.description || item.effect || item.helpText || "").trim(),
              importance: importance === "required" ? "required" : "recommended",
            };
          })
          .filter(Boolean)
      : [];
  }

  function normalizeMessageFields(fields) {
    return Array.isArray(fields)
      ? fields
          .map((item, index) => {
            if (typeof item === "string") {
              const name = item.trim();
              return name ? { name, role: "fact", status: "empty", value: "" } : null;
            }
            if (!item || typeof item !== "object") return null;
            const name = String(item.name || item.field || item.key || item.label || `field_${index + 1}`).trim();
            if (!name) return null;
            const role = String(item.role || item.type || item.importance || "fact").toLowerCase();
            const status = String(item.status || (item.value ? "filled" : "empty")).toLowerCase();
            return {
              name,
              role: ["required", "fact", "framing"].includes(role) ? role : "fact",
              status: ["filled", "empty", "missing"].includes(status) ? status : "empty",
              value: String(item.value || item.answer || "").trim(),
            };
          })
          .filter(Boolean)
      : [];
  }

  function normalizeMessageTechniques(techniques) {
    return Array.isArray(techniques)
      ? techniques
          .map((item) => {
            if (typeof item === "string") {
              const name = item.trim();
              return name ? { name, reason: "" } : null;
            }
            if (!item || typeof item !== "object") return null;
            const name = String(item.name || item.technique || item.title || item.label || "").trim();
            if (!name) return null;
            return {
              name,
              reason: String(item.reason || item.description || item.effect || item.summary || "").trim(),
            };
          })
          .filter(Boolean)
      : [];
  }

  function normalizeMessageChanges(changes) {
    return Array.isArray(changes)
      ? changes
          .map((item) => {
            if (typeof item === "string") return item.trim();
            if (!item || typeof item !== "object") return "";
            return String(item.text || item.message || item.description || item.change || item.reason || "").trim();
          })
          .filter(Boolean)
      : [];
  }

  function normalizeLegacyAskAnswer(text) {
    const source = String(text || "").trim();
    if (!source) return { leadText: "", questions: [] };
    const lines = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const questionLines = [];
    const leadLines = [];
    let foundQuestion = false;

    lines.forEach((line) => {
      const match = line.match(/^[•*-]\s*([^:：]{1,40})[:：]\s*(.+)$/);
      if (match) {
        foundQuestion = true;
        questionLines.push({
          field: match[1].trim(),
          question: match[2].trim(),
          reason: "",
          importance: "required",
        });
        return;
      }
      if (!foundQuestion) leadLines.push(line);
    });

    if (!questionLines.length) return { leadText: source, questions: [] };

    const leadText = leadLines
      .map((line) => line.replace(/\*\*/g, "").trim())
      .filter((line) => !/^아래\s+정보를/.test(line))
      .join("\n");

    return {
      leadText,
      questions: questionLines,
    };
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
    const { escapeHtml } = ctx;
    const { isAsk, questions } = data;
    const title = isAsk ? "답변이 필요한 정보" : "더 정확하게 개선하려면 아래 질문에 답해보세요";

    return `
      <section class="message-question-section" aria-label="${escapeHtml(title)}">
        <strong>${escapeHtml(title)}</strong>
        <ol>
          ${questions
            .map(
              (item) => `
                <li class="${item.importance === "required" ? "required" : "recommended"}">
                  <span>${escapeHtml(item.question)}</span>
                  <em>${item.importance === "required" ? "필수 정보" : "선택 정보"}</em>
                  ${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ""}
                </li>
              `,
            )
            .join("")}
        </ol>
      </section>
    `;
  }

  function MessageFieldsView(ctx, data) {
    const { escapeHtml } = ctx;
    const { fields } = data;
    const visibleFields = fields.filter((item) => item.status !== "filled");
    if (!visibleFields.length) return "";

    return `
      <section class="message-field-section" aria-label="채워야 할 정보">
        <strong>채워야 할 정보</strong>
        <ul>
          ${visibleFields
            .map(
              (item) => `
                <li class="${item.role}">
                  <span>${escapeHtml(item.name)}</span>
                  <em>${item.role === "required" ? "필수" : item.role === "fact" ? "사실 확인" : "선택"}</em>
                </li>
              `,
            )
            .join("")}
        </ul>
      </section>
    `;
  }

  function MessageTechniquesView(ctx, data) {
    const { escapeHtml } = ctx;
    const { techniques } = data;

    return `
      <section class="message-technique-section" aria-label="참고한 프롬프트 기법">
        <strong>참고한 프롬프트 기법</strong>
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
      </section>
    `;
  }

  function MessageEvidenceNoticeView() {
    return `
      <div class="message-evidence-notice" role="note">
        <span>참고 근거 없이 기본 방식으로 다듬었습니다.</span>
      </div>
    `;
  }

  function MessageChangesView(ctx, data) {
    const { escapeHtml } = ctx;
    const { changes } = data;

    return `
      <section class="message-changes-section" aria-label="가정 및 개선 포인트">
        <strong>가정 및 개선 포인트</strong>
        <ul>
          ${changes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  global.TtalkakMakeMessageParts = Object.freeze({
    MessageChangesView,
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

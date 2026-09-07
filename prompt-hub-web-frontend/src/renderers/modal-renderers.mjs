  "use strict";

  function ReportModalView({ icons, escapeAttr }, { target, reportType, title, helper }) {
    if (!target) return "";

    return `
      <div class="modal-backdrop visible report-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <form class="modal report-modal" data-report-form="${escapeAttr(target.id)}" data-report-type="${escapeAttr(reportType)}">
          <div class="modal-head">
            <h2 id="report-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-report aria-label="닫기">${icons.close}</button>
          </div>
          <p class="auth-helper">${helper}</p>
          <label>
            <span>신고 이유</span>
            <textarea name="reason" rows="5" placeholder="신고 이유를 입력해주세요."></textarea>
          </label>
          <div class="modal-actions">
            <button class="secondary-button" type="button" data-close-report>취소</button>
            <button class="primary-button" type="submit">신고하기</button>
          </div>
        </form>
      </div>
    `;
  }

  function ExecuteModalView({ icons, escapeAttr }, { targets }) {
    return `
      <div class="modal-backdrop visible execute-backdrop" role="dialog" aria-modal="true" aria-labelledby="execute-title">
        <article class="modal execute-modal">
          <div class="modal-head">
            <h2 id="execute-title">AI 도구 선택</h2>
            <button class="ghost-icon" type="button" data-close-execute aria-label="닫기">${icons.close}</button>
          </div>
          <p class="confirm-message">AI 사이트를 선택하면 개선된 최종 프롬프트가 복사되고 선택한 사이트가 열립니다. 열린 사이트의 입력창을 클릭한 뒤 붙여넣기(Ctrl+V)해서 실행해주세요.</p>
          <div class="execute-targets">
            ${targets.map((target) => `<button type="button" data-execute-target="${escapeAttr(target.id)}">${target.name}</button>`).join("")}
          </div>
        </article>
      </div>
    `;
  }

  const renderers = Object.freeze({
    ExecuteModalView,
    ReportModalView,
  });
export { renderers };

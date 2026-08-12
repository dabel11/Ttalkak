(function attachTtalkakComponents(global) {
  "use strict";

  function escapeHtml(value) {
    const escape = global.TtalkakUtils?.escapeHtml;
    if (typeof escape === "function") return escape(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function escapeAttr(value) {
    const escape = global.TtalkakUtils?.escapeAttr;
    if (typeof escape === "function") return escape(value);
    return escapeHtml(value);
  }

  function Pagination({ totalPages, currentPage, pageAttribute = "data-page", ariaLabel = "페이지" }) {
    if (totalPages <= 1) return "";
    const safePageAttribute = /^[a-zA-Z0-9_-]+$/.test(String(pageAttribute || "")) ? pageAttribute : "data-page";

    return `
      <nav class="pagination" aria-label="${escapeHtml(ariaLabel)}">
        ${Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          return `<button class="page-button ${page === currentPage ? "active" : ""}" type="button" ${safePageAttribute}="${page}" aria-label="${page}페이지">${page}</button>`;
        }).join("")}
      </nav>
    `;
  }

  /** @param {{ title?: unknown, message?: unknown, confirmLabel?: string, alternativeLabel?: string, danger?: boolean }} [options] */
  function ConfirmDialog({ title, message, confirmLabel = "확인", alternativeLabel = "", danger = false } = {}) {
    return `
      <div class="modal-backdrop visible confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <article class="modal confirm-modal">
          <div class="modal-head">
            <h2 id="confirm-title">${escapeHtml(title)}</h2>
          </div>
          <p class="confirm-message">${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="secondary-button" type="button" data-cancel-confirm>취소</button>
            ${alternativeLabel ? `<button class="secondary-button" type="button" data-confirm-alternative>${escapeHtml(alternativeLabel)}</button>` : ""}
            <button class="primary-button ${danger ? "danger-primary" : ""}" type="button" data-confirm-action>${escapeHtml(confirmLabel)}</button>
          </div>
        </article>
      </div>
    `;
  }

  /** @param {{ memberId?: string | number, nickname?: string, closeIcon?: string }} [options] */
  function AdminUserBlockDialog({ memberId, nickname = "사용자", closeIcon = "" } = {}) {
    if (!memberId) return "";

    const safeNickname = String(nickname || "사용자").trim() || "사용자";

    return `
      <div class="modal-backdrop visible confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-user-block-title">
        <form class="modal confirm-modal" data-admin-user-block-form="${escapeAttr(memberId)}" data-admin-user-name="${escapeAttr(safeNickname)}">
          <div class="modal-head">
            <h2 id="admin-user-block-title">회원 차단</h2>
            <button class="ghost-icon" type="button" data-close-admin-user-block aria-label="닫기">${closeIcon}</button>
          </div>
          <p class="confirm-message">${escapeHtml(safeNickname)} 계정을 차단할 사유를 입력해주세요.</p>
          <label class="field-label" for="admin-user-block-reason">차단 사유</label>
          <textarea id="admin-user-block-reason" name="reason" rows="4" placeholder="예: 반복적인 운영 정책 위반">운영 정책 위반</textarea>
          <div class="modal-actions">
            <button class="secondary-button" type="button" data-close-admin-user-block>취소</button>
            <button class="primary-button danger-primary" type="submit">차단</button>
          </div>
        </form>
      </div>
    `;
  }

  global.TtalkakComponents = Object.freeze({
    AdminUserBlockDialog,
    ConfirmDialog,
    Pagination,
  });
})(window);

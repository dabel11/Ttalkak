(function attachAdminRevisionModalRenderer(global) {
  "use strict";

  function AdminRevisionRequestModalView(ctx, data) {
    const { icons, escapeAttr, escapeHtml, truncateText } = ctx;
    const {
      target,
      existingRequest,
      isExistingRequest,
      canEditExistingRequest,
      existingStatusLabel,
    } = data;
    const safeTargetKey = escapeAttr(target.key);

    return `
      <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="revision-request-title">
        <form class="modal prompt-edit-modal revision-request-modal" data-admin-revision-request-form="${safeTargetKey}">
          <div class="modal-head">
            <h2 id="revision-request-title">${isExistingRequest ? "수정 요청 사유" : "수정 요청"}</h2>
            <button class="ghost-icon" type="button" data-close-revision-request aria-label="닫기">${icons.close}</button>
          </div>
          <div class="revision-request-target">
            <strong>${escapeHtml(target.title)}</strong>
            <p>${escapeHtml(truncateText(target.text, 120))}</p>
          </div>
          ${
            isExistingRequest
              ? `<div class="revision-request-notice">
                  <strong>이미 처리 중인 수정 요청이 있습니다.</strong>
                  <p>${
                    canEditExistingRequest
                      ? "작성자가 아직 확인하지 않은 pending 상태라 사유를 수정할 수 있습니다."
                      : `${escapeHtml(existingStatusLabel)} 상태에서는 기존 요청 사유를 수정할 수 없습니다.`
                  }</p>
                </div>`
              : ""
          }
          <label>
            <span>작성자에게 전달할 요청 사유</span>
            <textarea name="reason" rows="6" placeholder="예: 과장된 표현을 줄이고 출처나 조건을 명확히 적어주세요." ${isExistingRequest && !canEditExistingRequest ? "readonly" : ""}>${escapeHtml(existingRequest?.reason || "")}</textarea>
          </label>
          <div class="form-actions">
            <button class="secondary-button" type="button" data-close-revision-request>취소</button>
            ${
              isExistingRequest
                ? `<button class="primary-button" type="submit" ${canEditExistingRequest ? "" : "disabled"}>${canEditExistingRequest ? "사유 수정" : "수정 불가"}</button>`
                : `<button class="primary-button" type="submit">요청 보내기</button>`
            }
          </div>
        </form>
      </div>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    AdminRevisionRequestModalView,
  });
})(window);

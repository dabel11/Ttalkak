  "use strict";

  function PromptDetailModalView(ctx, data) {
    const {
      icons,
      escapeAttr,
      escapeHtml,
      formatNumber,
      formatShortDate,
      getPromptViewCount,
      getPromptCreatedAt,
      getPromptLikes,
      getPromptSaveCount,
      renderAuthorSearchControl,
      CommentItem,
    } = ctx;
    const {
      prompt,
      safePromptId,
      safeTitle,
      safeText,
      isSaved,
      isPendingUnsave,
      canDelete,
      commentCount,
      isCommentsExpanded,
      visibleComments,
      isLiked,
      isReported,
      isShared,
      isAdminReview,
      isHiddenByAdmin,
      revisionRequest,
      adminStatusBadges,
      isLoggedIn,
    } = data;

    return `
      <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="prompt-detail-title">
        <article class="modal prompt-detail-modal ${isAdminReview ? "admin-review-modal" : ""}">
          <div class="modal-head">
            <h2 id="prompt-detail-title">${safeTitle}</h2>
          </div>
          <div class="prompt-detail-layout">
            <section class="prompt-detail-main" aria-label="프롬프트 내용">
              ${isAdminReview && adminStatusBadges ? `<div class="status-row admin-detail-status">${adminStatusBadges}</div>` : ""}
              <p class="prompt-detail-text">${safeText}</p>
              ${
                revisionRequest
                  ? `<div class="revision-request-notice">
                      <strong>수정 요청 사유</strong>
                      <p>${escapeHtml(revisionRequest.reason || "수정 요청 사유가 입력되지 않았습니다.")}</p>
                    </div>`
                  : ""
              }
              <div class="tag-row detail-tags">${prompt.tags.map((tag) => `<button type="button" data-search-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}</div>
              <footer class="card-meta detail-meta">
                <span>${icons.eye}${formatNumber(getPromptViewCount(prompt))}</span>
                ${renderAuthorSearchControl(prompt, { admin: isAdminReview })}
                <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
              </footer>
            </section>
            <section class="comments-panel" aria-label="댓글">
              <div class="comments-head">
                <h3>댓글</h3>
                <div class="comments-head-actions">
                  <span>${formatNumber(commentCount)}개</span>
                  <button class="comment-panel-toggle" type="button" data-toggle-comments="${safePromptId}">${isCommentsExpanded ? "접기" : "펼치기"}</button>
                </div>
              </div>
              ${
                isCommentsExpanded
                  ? `<div class="comment-list">
                      ${
                        visibleComments.length
                          ? visibleComments.map(CommentItem).join("")
                          : `<p class="comment-empty">아직 표시할 댓글이 없습니다.</p>`
                      }
                    </div>
                    ${
                      isAdminReview
                        ? `<p class="comment-empty">관리자 검토 모드에서는 댓글을 읽기 전용으로 확인합니다.</p>`
                        : isLoggedIn
                        ? `<form class="comment-form" data-comment-form="${safePromptId}">
                            <input name="comment" type="text" placeholder="댓글을 입력하세요." autocomplete="off" />
                            <button class="primary-button" type="submit">등록</button>
                          </form>`
                        : `<div class="comment-login">
                            <span>댓글을 작성하려면 로그인이 필요합니다.</span>
                            <button class="secondary-button" type="button" data-open-auth="login">로그인</button>
                          </div>`
                    }`
                  : ""
              }
            </section>
          </div>
          <div class="modal-actions detail-actions">
            ${
              isAdminReview
                ? `<div class="detail-action-group manage-actions">
                     <button class="secondary-button" type="button" data-admin-request-revision="prompt:${safePromptId}">${revisionRequest ? "사유 확인" : "수정 요청"}</button>
                     <button class="secondary-button" type="button" data-admin-hide-prompt="${safePromptId}">${isHiddenByAdmin ? "게시물 숨김 해제" : "게시물 숨김"}</button>
                   </div>
                   <div class="detail-action-group use-actions">
                     <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
                   </div>`
                : `<div class="detail-action-group manage-actions">
                     ${canDelete ? `<button class="secondary-button" type="button" data-edit-prompt="${safePromptId}">${icons.edit}<span>수정</span></button>` : ""}
                     ${canDelete && !isShared ? `<button class="secondary-button" type="button" data-share-saved="${safePromptId}">${icons.share}<span>공유하기</span></button>` : ""}
                     ${canDelete && isShared ? `<button class="secondary-button" type="button" data-unshare-prompt="${safePromptId}">${icons.share}<span>공유 취소</span></button>` : ""}
                     ${canDelete ? `<button class="secondary-button danger-button" type="button" data-delete-prompt="${safePromptId}">${icons.trash}<span>삭제</span></button>` : ""}
                   </div>
                   <div class="detail-action-group use-actions">
                     <button class="detail-action-button close-action" type="button" data-close-detail aria-label="닫기">${icons.close}</button>
                     <button class="detail-action-button execute-action" type="button" data-execute-prompt="${safePromptId}" aria-label="AI 적용">${icons.play}<span>Execute</span></button>
                     <button class="detail-action-button like-action ${isLiked ? "liked" : ""}" type="button" data-like-prompt="${safePromptId}" aria-label="${isLiked ? "좋아요 취소" : "좋아요"}">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
                     <button class="detail-action-button save-action ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" type="button" data-save-prompt="${safePromptId}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : isSaved ? "저장 취소" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
                     <button class="detail-action-button report-action report-state-button ${isReported ? "reported" : ""}" type="button" data-report-prompt="${safePromptId}" aria-label="${isReported ? "신고됨" : "신고"}">${icons.flag}</button>
                   </div>`
            }
          </div>
        </article>
      </div>
    `;
  }

  function PromptEditModalView(ctx, { prompt, revisionRequest, safePromptId }) {
    const { icons, escapeAttr, escapeHtml } = ctx;

    return `
      <div class="modal-backdrop visible" role="dialog" aria-modal="true" aria-labelledby="prompt-edit-title">
        <form class="modal prompt-edit-modal" data-prompt-edit-form="${safePromptId}">
          <div class="modal-head">
            <h2 id="prompt-edit-title">프롬프트 수정</h2>
            <button class="ghost-icon" type="button" data-close-prompt-edit aria-label="닫기">${icons.close}</button>
          </div>
          ${
            revisionRequest
              ? `<div class="revision-request-notice">
                  <strong>관리자 수정 요청 사유</strong>
                  <p>${escapeHtml(revisionRequest.reason || "수정 요청 사유가 입력되지 않았습니다.")}</p>
                </div>`
              : ""
          }
          <label>
            <span>제목</span>
            <input name="title" type="text" value="${escapeAttr(prompt.title)}" />
          </label>
          <label>
            <span>프롬프트</span>
            <textarea name="text" rows="8">${escapeHtml(prompt.text)}</textarea>
          </label>
          <label>
            <span>해시태그</span>
            <input name="tags" type="text" value="${escapeAttr((prompt.tags || []).join(", "))}" />
          </label>
          <div class="form-actions">
            <button class="secondary-button" type="button" data-close-prompt-edit>취소</button>
            <button class="primary-button" type="submit">저장</button>
          </div>
        </form>
      </div>
    `;
  }

  const renderers = Object.freeze({
    PromptDetailModalView,
    PromptEditModalView,
  });
export { renderers };

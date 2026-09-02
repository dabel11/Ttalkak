  "use strict";

  function PromptCardView(ctx, prompt, options = {}) {
    const {
      state,
      icons,
      escapeAttr,
      escapeHtml,
      formatNumber,
      canShowReportedState,
      isPromptSaved,
      isPromptPendingUnsave,
      getPromptRevisionRequest,
      getPromptCommentCount,
      getPromptCardPreviewTags,
      getPromptLikes,
      getPromptSaveCount,
      getPromptViewCount,
      renderAuthorSearchControl,
    } = ctx;

    const safePromptId = escapeAttr(prompt.id);
    const safeTitle = escapeHtml(prompt.title);
    const safeText = escapeHtml(prompt.text);
    const isSaved = isPromptSaved(prompt.id);
    const isPendingUnsave = isPromptPendingUnsave(prompt.id);
    const isMine = state.isLoggedIn && prompt.source === "mine";
    const canDelete = isMine;
    const isLiked = state.likedPromptIds.has(prompt.id);
    const isReported = canShowReportedState() && state.reportedPromptIds.has(prompt.id);
    const isShared = prompt.isShared === true || prompt.source === "community";
    const revisionRequest = canDelete ? getPromptRevisionRequest(prompt.id) : null;
    const hasMakeHistory = isMine && Array.isArray(prompt.messages) && prompt.messages.length > 0;
    const commentCount = getPromptCommentCount(prompt);
    const showStatus = options.showStatus !== false;
    const isCardMenuOpen = state.openPromptCardMenuId === prompt.id;
    const previewTags = getPromptCardPreviewTags(prompt.tags || []);
    const statusBadges = [
      isMine
        ? `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`
        : "",
      isMine && revisionRequest ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : "",
      isPendingUnsave ? `<span class="status-badge pending-unsave">저장 취소 예정</span>` : "",
    ].join("");

    return `
      <article class="prompt-card ${isMine ? "mine-card" : ""} ${isReported ? "reported-card" : ""} ${isPendingUnsave ? "pending-unsave-card" : ""}" data-open-prompt="${safePromptId}">
        <div class="card-head">
          <h2><button class="prompt-card-open" type="button" data-open-prompt-trigger="${safePromptId}" aria-label="${escapeAttr(`${prompt.title} 전체 보기`)}">${safeTitle}</button></h2>
          <div class="card-actions">
            ${
              isMine
                ? `<div class="prompt-card-menu-wrap">
                    <button class="icon-button prompt-card-more" type="button" data-prompt-card-menu="${safePromptId}" aria-label="프롬프트 더보기" aria-expanded="${isCardMenuOpen ? "true" : "false"}">${icons.more}</button>
                    ${
                      isCardMenuOpen
                        ? `<div class="prompt-card-menu" role="menu">
                            <button type="button" data-edit-prompt="${safePromptId}" role="menuitem">${icons.edit}<span>수정</span></button>
                            ${!isShared ? `<button type="button" data-share-saved="${safePromptId}" role="menuitem">${icons.share}<span>공유하기</span></button>` : ""}
                            ${isShared ? `<button type="button" data-unshare-prompt="${safePromptId}" role="menuitem">${icons.share}<span>공유 취소</span></button>` : ""}
                            <button type="button" data-delete-prompt="${safePromptId}" role="menuitem">${icons.trash}<span>삭제</span></button>
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
            ${hasMakeHistory ? `<button class="history-card-button" data-open-make-history="${safePromptId}" aria-label="Make 대화 보기">${icons.make}<span>대화 보기</span></button>` : ""}
            <button class="icon-button metric-action like-card-button ${isLiked ? "liked" : ""}" data-like-prompt="${safePromptId}" aria-label="좋아요">${icons.heart}<span>${formatNumber(getPromptLikes(prompt))}</span></button>
            <button class="icon-button metric-action comment-card-button" data-open-comments="${safePromptId}" aria-label="댓글 보기">${icons.comment}<span>${formatNumber(commentCount)}</span></button>
            <button class="icon-button metric-action save-card-button ${isSaved ? "saved" : ""} ${isPendingUnsave ? "pending-unsave" : ""}" data-save-prompt="${safePromptId}" aria-label="${isPendingUnsave ? "저장 취소 되돌리기" : "저장"}">${icons.bookmark}<span>${formatNumber(getPromptSaveCount(prompt))}</span></button>
          </div>
        </div>
        ${showStatus && statusBadges ? `<div class="status-row">${statusBadges}</div>` : ""}
        <p>${safeText}</p>
        <div class="tag-row card-tag-row">
          ${previewTags.visibleTags.map((tag) => `<button type="button" data-search-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}
          ${previewTags.hiddenCount > 0 ? `<span class="tag-more">+${previewTags.hiddenCount}</span>` : ""}
        </div>
        <footer class="card-meta">
          <span>${icons.eye}${formatNumber(getPromptViewCount(prompt))}</span>
          ${renderAuthorSearchControl(prompt)}
        </footer>
      </article>
    `;
  }

  const renderers = Object.freeze({
    PromptCardView,
  });
export { renderers };

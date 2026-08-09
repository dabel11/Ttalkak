(function attachCommentView(global) {
  "use strict";
  function createCommentView(ctx) {
    const { state, canDeleteComment, canShowReportedState, escapeAttr, escapeHtml, formatNumber, formatShortDate, getCommentLikes, getSortedCommentReplies } = ctx;
    /** @type {any} */
    const icons = new Proxy({}, { get: (_target, key) => ctx.getIcons()[key] });

    function CommentItem(comment) {
      const isDeleted = Boolean(comment.deleted);
      const isHidden = Boolean(comment.hidden || comment.isHidden);
      const canDelete = !isDeleted && canDeleteComment(comment);
      const isReported = canShowReportedState() && state.reportedCommentIds.has(comment.id);
      const isLiked = state.likedCommentIds.has(comment.id);
      const isAdminReview = Boolean(state.adminMode);
      const isHighlighted = isAdminReview && state.detailHighlightCommentId === comment.id;
      const replies = getSortedCommentReplies(comment);
      const isReplying = !isDeleted && state.replyingCommentId === comment.id;
      const isEditing = !isDeleted && !isAdminReview && state.editingCommentId === comment.id;
      const safeCommentId = escapeAttr(comment.id);
      const safeAuthor = escapeHtml(comment.author);
      const safeText = escapeHtml(comment.text);

      return `
        <article class="comment-item ${isDeleted ? "deleted-comment" : ""} ${isReported ? "reported-comment" : ""} ${isHighlighted ? "admin-highlighted-comment" : ""}" data-comment-id="${safeCommentId}">
          <div class="comment-item-head">
            <strong>${isDeleted ? "삭제된 댓글" : safeAuthor}${isHidden ? `<span class="edited-mark">숨김</span>` : ""}</strong>
            ${
              isAdminReview && !isDeleted
                ? `<div class="comment-actions">
                    <button class="comment-edit-button" type="button" data-admin-toggle-comment-hidden="${safeCommentId}:${isHidden ? "unhide" : "hide"}" title="${isHidden ? "댓글 숨김 해제" : "댓글 숨김"}" aria-label="${isHidden ? "댓글 숨김 해제" : "댓글 숨김"}">${isHidden ? icons.eye : icons.flag}</button>
                    <button class="comment-delete-button" type="button" data-delete-comment="${safeCommentId}" title="삭제" aria-label="댓글 삭제">${icons.trash}</button>
                  </div>`
                : isDeleted
                ? ""
                : `<div class="comment-actions">
                    ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${safeCommentId}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "댓글 좋아요 취소" : "댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(comment))}</span></button>`}
                    <button class="comment-reply-button" type="button" data-reply-comment="${safeCommentId}" title="답글" aria-label="답글">${icons.comment}</button>
                    ${
                      canDelete
                        ? `<button class="comment-edit-button" type="button" data-edit-comment="${safeCommentId}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                           <button class="comment-delete-button" type="button" data-delete-comment="${safeCommentId}" title="삭제" aria-label="댓글 삭제">${icons.trash}</button>`
                        : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${safeCommentId}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "댓글 신고"}">${icons.flag}</button>`
                    }
                  </div>`
            }
          </div>
          ${
            isEditing
              ? `<form class="comment-edit-form" data-edit-comment-form="${safeCommentId}">
                  <input name="comment" type="text" value="${escapeAttr(comment.text)}" autocomplete="off" />
                  <button class="primary-button" type="submit">저장</button>
                </form>`
              : `<p>${isDeleted ? "삭제된 댓글입니다." : safeText}${!isDeleted && comment.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
          }
          ${
            replies.length || (!isAdminReview && isReplying)
              ? `<div class="reply-thread">
                  ${replies.map(ReplyItem).join("")}
                  ${
                    !isAdminReview && isReplying
                      ? `<form class="reply-form" data-reply-form="${safeCommentId}">
                          <input name="reply" type="text" placeholder="답글을 입력하세요." autocomplete="off" />
                          <button class="primary-button" type="submit">등록</button>
                        </form>`
                      : ""
                  }
                </div>`
              : ""
          }
        </article>
      `;
    }

    function ReplyItem(reply) {
      const isDeleted = Boolean(reply.deleted);
      const canDelete = !isDeleted && canDeleteComment(reply);
      const isReported = canShowReportedState() && state.reportedCommentIds.has(reply.id);
      const isLiked = state.likedCommentIds.has(reply.id);
      const isAdminReview = Boolean(state.adminMode);
      const isHighlighted = isAdminReview && state.detailHighlightCommentId === reply.id;
      const isEditing = !isDeleted && !isAdminReview && state.editingCommentId === reply.id;
      const safeReplyId = escapeAttr(reply.id);
      const safeAuthor = escapeHtml(reply.author);
      const safeText = escapeHtml(reply.text);

      return `
        <article class="reply-item ${isDeleted ? "deleted-comment" : ""} ${isReported ? "reported-reply" : ""} ${isHighlighted ? "admin-highlighted-comment" : ""}" data-comment-id="${safeReplyId}">
          <div class="reply-item-head">
            <strong>${isDeleted ? "삭제된 댓글" : safeAuthor}</strong>
            ${
              isAdminReview || isDeleted
                ? ""
                : `<div class="reply-actions">
                    ${canDelete ? "" : `<button class="comment-like-button ${isLiked ? "liked" : ""}" type="button" data-like-comment="${safeReplyId}" title="${isLiked ? "좋아요 취소" : "좋아요"}" aria-label="${isLiked ? "대댓글 좋아요 취소" : "대댓글 좋아요"}">${icons.heart}<span>${formatNumber(getCommentLikes(reply))}</span></button>`}
                    ${
                      canDelete
                        ? `<button class="comment-edit-button" type="button" data-edit-comment="${safeReplyId}" title="${isEditing ? "수정 취소" : "수정"}" aria-label="${isEditing ? "수정 취소" : "수정"}">${isEditing ? icons.close : icons.edit}</button>
                           <button class="comment-delete-button" type="button" data-delete-comment="${safeReplyId}" title="삭제" aria-label="답글 삭제">${icons.trash}</button>`
                        : `<button class="comment-report-button ${isReported ? "reported" : ""}" type="button" data-report-comment="${safeReplyId}" title="${isReported ? "신고됨" : "신고"}" aria-label="${isReported ? "신고됨" : "대댓글 신고"}">${icons.flag}</button>`
                    }
                  </div>`
            }
          </div>
          ${
            isEditing
              ? `<form class="comment-edit-form" data-edit-comment-form="${safeReplyId}">
                  <input name="comment" type="text" value="${escapeAttr(reply.text)}" autocomplete="off" />
                  <button class="primary-button" type="submit">저장</button>
                </form>`
              : `<p>${isDeleted ? "삭제된 댓글입니다." : safeText}${!isDeleted && reply.edited ? `<span class="edited-mark">수정됨</span>` : ""}</p>`
          }
        </article>
      `;
    }

    return Object.freeze({ CommentItem, ReplyItem });
  }
  const api = Object.freeze({ createCommentView });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakCommentView = api;
})(typeof window !== "undefined" ? window : globalThis);

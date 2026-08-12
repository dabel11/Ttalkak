  "use strict";
  function createModalView(ctx) {
    const { state, findPromptById, PromptDetailModalView, PromptEditModalView, ReportModalView, ConfirmDialog, ExecuteModalView, getDisplayPromptAuthor, getPromptCommentCount, getPromptLikes, getPromptSaveCount, getPromptViewCount, getSortedPromptComments, CommentItem, escapeAttr, escapeHtml, formatNumber, formatShortDate, getPromptRevisionRequest, makePreview, renderAdminInlineAuthorControl, renderAuthorSearchControl, isPromptSaved, isPromptPendingUnsave, canShowReportedState, getPromptCreatedAt, findCommentById, getFinalPromptText } = ctx;
    const icons = new Proxy({}, { get: (_target, key) => ctx.getIcons()[key] });

    function PromptDetailModal() {
      const prompt = findPromptById(state.detailPromptId);
      if (!prompt) return "";

      const isSaved = isPromptSaved(prompt.id);
      const isPendingUnsave = isPromptPendingUnsave(prompt.id);
      const canDelete = state.isLoggedIn && prompt.source === "mine";
      const comments = getSortedPromptComments(prompt.id);
      const commentCount = getPromptCommentCount(prompt);
      const isCommentsExpanded = Boolean(state.expandedComments[prompt.id]);
      const visibleComments = isCommentsExpanded ? comments : comments.slice(0, 3);
      const isLiked = state.likedPromptIds.has(prompt.id);
      const isReported = canShowReportedState() && state.reportedPromptIds.has(prompt.id);
      const isShared = prompt.isShared === true || prompt.source === "community";
      const isAdminReview = Boolean(state.adminMode);
      const isHiddenByAdmin = state.adminHiddenPromptIds.has(prompt.id);
      const revisionRequest = canDelete || isAdminReview ? getPromptRevisionRequest(prompt.id) : null;
      const safePromptId = escapeAttr(prompt.id);
      const safeTitle = escapeHtml(prompt.title);
      const safeText = escapeHtml(prompt.text);
      const adminStatusBadges = isAdminReview
        ? [
            `<span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>`,
            isHiddenByAdmin ? `<span class="status-badge private">숨김</span>` : "",
            isReported ? `<span class="status-badge pending-unsave">신고됨</span>` : "",
            revisionRequest ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : "",
          ].join("")
        : "";

      return PromptDetailModalView(
        {
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
        },
        {
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
          isLoggedIn: state.isLoggedIn,
        },
      );
    }

    function PromptEditModal() {
      const prompt = findPromptById(state.editingPromptId);
      if (!prompt || prompt.source !== "mine") return "";
      const revisionRequest = getPromptRevisionRequest(prompt.id);
      const safePromptId = escapeAttr(prompt.id);

      return PromptEditModalView(
        { icons, escapeAttr, escapeHtml },
        { prompt, revisionRequest, safePromptId },
      );
    }

    function ReportModal() {
      const prompt = findPromptById(state.reportPromptId);
      const comment = findCommentById(state.reportCommentId);
      const target = prompt || comment;
      if (!target) return "";
      const reportType = prompt ? "prompt" : "comment";
      const title = prompt ? "프롬프트 신고" : "댓글 신고";
      const helper = prompt
        ? "정말 이 프롬프트를 신고할까요? 신고 이유를 적어주시면 검토에 도움이 됩니다."
        : "정말 이 댓글을 신고할까요? 신고 이유를 적어주시면 검토에 도움이 됩니다.";

      return ReportModalView({ icons, escapeAttr }, { target, reportType, title, helper });
    }

    function ConfirmModal() {
      const action = state.confirmAction;
      if (!action) return "";

      return ConfirmDialog(action);
    }

    function ExecuteModal() {
      const message = state.messages.find((item) => item.id === state.executeMessageId);
      const prompt = findPromptById(state.executePromptId);
      const executableText = message ? getFinalPromptText(message) : String(prompt?.text || "").trim();
      if (!executableText) return "";

      const targets = [
        { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
        { id: "gemini", name: "Google Gemini", url: "https://gemini.google.com/" },
        { id: "claude", name: "Claude", url: "https://claude.ai/" },
      ];

      return ExecuteModalView({ icons, escapeAttr }, { targets });
    }

    return Object.freeze({ PromptDetailModal, PromptEditModal, ReportModal, ConfirmModal, ExecuteModal });
  }
export { createModalView };

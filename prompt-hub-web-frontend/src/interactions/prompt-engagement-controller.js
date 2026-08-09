(function attachPromptEngagementController(global) {
  "use strict";

  function createPromptEngagementController(ctx) {
    async function toggleSavedPrompt(promptId) {
      if (ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.notice("로그인 후 저장할 수 있습니다."); return; }
      const savedIndex = ctx.savedPrompts.findIndex((item) => item.id === promptId);
      const mutation = ctx.getPromptMutationContext();
      if (savedIndex >= 0) {
        const prompt = ctx.savedPrompts[savedIndex];
        if (!prompt.savedByMe || ctx.isHiddenDemoPrompt(prompt)) {
          if (!(await ctx.runMutation("savePrompt", promptId, "저장 요청에 실패했습니다."))) return;
          ctx.applyExistingSaved(mutation, promptId, prompt); ctx.refreshMyPage(); ctx.notice("저장했습니다."); return;
        }
        if (ctx.state.route === "saved" && ctx.state.myBackendStatus === "connected" && ctx.isBackendId(promptId)) {
          if (!(await ctx.runMutation("unsavePrompt", promptId, "저장 해제 요청에 실패했습니다."))) return;
          ctx.applyBackendUnsaved(mutation, promptId, prompt); ctx.refreshMyPage(); ctx.notice("저장을 해제했습니다."); return;
        }
        if (ctx.state.route === "saved") {
          const result = ctx.togglePendingUnsave(mutation, promptId);
          ctx.notice(result === "restored" ? "저장 해제를 취소했습니다." : "페이지를 벗어나면 보관함에서 제거됩니다."); return;
        }
        if (!(await ctx.runMutation("unsavePrompt", promptId, "저장 해제 요청에 실패했습니다."))) return;
        ctx.applyUnsaved(mutation, promptId, prompt, savedIndex); ctx.refreshMyPage(); ctx.notice("저장을 해제했습니다."); return;
      }
      const prompt = ctx.findPrompt(promptId);
      if (!prompt) return;
      if (ctx.state.pendingUnsaveIds.has(promptId)) { ctx.togglePendingUnsave(mutation, promptId); ctx.notice("저장 해제를 취소했습니다."); return; }
      if (!(await ctx.runMutation("savePrompt", promptId, "저장 요청에 실패했습니다."))) return;
      ctx.applyNewSaved(mutation, promptId, prompt); ctx.refreshMyPage(); ctx.notice("저장했습니다.");
    }

    async function toggleLikePrompt(promptId) {
      if (ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.notice("로그인 후 좋아요를 누를 수 있습니다."); return; }
      const liked = ctx.state.likedPromptIds.has(promptId);
      const mutation = ctx.getPromptMutationContext();
      if (!(await ctx.runMutation(liked ? "unlikePrompt" : "likePrompt", promptId, liked ? "좋아요 취소 요청에 실패했습니다." : "좋아요 요청에 실패했습니다."))) return;
      if (liked) ctx.applyPromptUnliked(mutation, promptId);
      else ctx.applyPromptLiked(mutation, promptId, ctx.findPrompt(promptId));
      ctx.refreshMyPage();
      ctx.notice(liked ? "좋아요를 취소했습니다." : "좋아요를 눌렀습니다.");
    }

    function toggleLikeComment(commentId) {
      if (ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.notice("로그인 후 댓글에 좋아요를 누를 수 있습니다."); ctx.render(); return; }
      const comment = ctx.findComment(commentId);
      if (!comment) return;
      if (ctx.canDeleteComment(comment)) { ctx.notice("내가 작성한 댓글에는 좋아요를 누를 수 없습니다."); return; }
      const liked = ctx.state.likedCommentIds.has(commentId);
      ctx.toggleCommentLiked(ctx.state, commentId, comment, ctx.getCommentLikes);
      ctx.callApi(liked ? "unlikeComment" : "likeComment", commentId);
      ctx.notice(liked ? "댓글 좋아요를 취소했습니다." : "댓글에 좋아요를 눌렀습니다.");
    }

    function addPromptComment(promptId, text) {
      const content = String(text || "").trim();
      if (!content || ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.notice("댓글을 작성하려면 로그인이 필요합니다."); ctx.render(); return; }
      ctx.addPromptCommentState(ctx.getCommentMutationContext(), promptId, content);
      ctx.callApi("addComment", promptId, { text: content }).then(() => { if (ctx.hasBackendToken()) ctx.hydrateComments(promptId); });
      ctx.render();
    }

    function toggleReplyForm(commentId) {
      if (ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.render(); return; }
      ctx.toggleReplyState(ctx.state, commentId); ctx.render();
    }

    function addCommentReply(commentId, text) {
      const content = String(text || "").trim();
      if (!content || ctx.guard()) return;
      if (!ctx.state.isLoggedIn) { ctx.state.authView = "login"; ctx.notice("답글을 작성하려면 로그인이 필요합니다."); ctx.render(); return; }
      const parent = ctx.findComment(commentId);
      if (!parent) return;
      const promptId = ctx.findPromptIdByComment(commentId);
      ctx.addReplyState(ctx.getCommentMutationContext(), parent, promptId, content);
      ctx.callApi("addReply", commentId, { text: content }).then(() => { if (promptId && ctx.hasBackendToken()) ctx.hydrateComments(promptId); });
      ctx.notice("답글을 등록했습니다."); ctx.render();
    }

    function toggleEditComment(commentId) {
      if (ctx.guard()) return;
      const comment = ctx.findComment(commentId);
      if (!comment || !ctx.canDeleteComment(comment)) return;
      ctx.toggleEditState(ctx.state, commentId); ctx.render();
    }

    function updateOwnComment(commentId, text) {
      const content = String(text || "").trim();
      if (!content || ctx.guard()) return;
      const comment = ctx.findComment(commentId);
      if (!comment || !ctx.canDeleteComment(comment)) return;
      const promptId = ctx.findPromptIdByComment(commentId);
      const changed = ctx.updateCommentState(ctx.state, comment, commentId, content, ctx.revisionKey("comment", commentId));
      if (changed && ctx.isBackendId(commentId)) ctx.callApi("updateComment", commentId, { text: content }).then(() => { if (promptId && ctx.hasBackendToken()) ctx.hydrateComments(promptId); });
      ctx.notice("댓글을 수정했습니다.");
    }

    return Object.freeze({ addCommentReply, addPromptComment, toggleEditComment, toggleLikeComment, toggleLikePrompt, toggleReplyForm, toggleSavedPrompt, updateOwnComment });
  }

  const api = Object.freeze({ createPromptEngagementController });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakPromptEngagementController = api;
})(typeof window !== "undefined" ? window : globalThis);

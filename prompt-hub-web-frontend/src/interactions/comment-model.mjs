  "use strict";
  function findCommentInList(comments, commentId) { for (const comment of comments || []) { if (comment.id === commentId) return comment; const reply = findCommentInList(comment.replies || [], commentId); if (reply) return reply; } return null; }
  function findCommentById(groups, commentId) { if (!commentId) return null; for (const comments of Object.values(groups || {})) { const found = findCommentInList(comments, commentId); if (found) return found; } return null; }
  function findPromptIdByCommentId(groups, commentId) { for (const [promptId, comments] of Object.entries(groups || {})) if (findCommentInList(comments, commentId)) return promptId; return ""; }
  function countCommentThread(comments) { return (comments || []).reduce((total, comment) => total + (comment.deleted ? 0 : 1) + countCommentThread(comment.replies || []), 0); }
  function getCommentLikes(comment) { return Math.max(0, Number(comment?.likes || 0)); }
  function sortComments(comments) { return [...(comments || [])].map((comment, index) => ({ comment, index })).sort((a, b) => getCommentLikes(b.comment) - getCommentLikes(a.comment) || a.index - b.index).map(({ comment }) => comment); }
  function canDeleteComment(state, comment) { if (!comment) return false; if (state.adminMode) return true; if (!state.isLoggedIn) return false; const owner = comment.owner || comment.author; return owner === "나" || owner === state.currentUser || comment.author === state.currentUser; }
  function syncPromptCommentCount(promptId, comments, promptLists) { if (!Array.isArray(comments)) return 0; const count = countCommentThread(comments); const updated = new Set(); for (const list of promptLists) { const prompt = list.find((item) => item.id === promptId); if (!prompt || updated.has(prompt)) continue; prompt.comments = count; prompt.commentCount = count; updated.add(prompt); } return count; }
  function createCommentRepository({ state, commentsByPrompt, promptLists }) {
    const getPromptComments = (promptId) => commentsByPrompt[promptId] || [];
    return Object.freeze({
      canDelete: (comment) => canDeleteComment(state, comment),
      countThread: countCommentThread,
      findById: (commentId) => findCommentById(commentsByPrompt, commentId),
      findContext: (commentId) => {
        const promptId = findPromptIdByCommentId(commentsByPrompt, commentId);
        return promptId ? { promptId, comment: findCommentInList(commentsByPrompt[promptId], commentId) } : null;
      },
      findInList: findCommentInList,
      findPromptId: (commentId) => findPromptIdByCommentId(commentsByPrompt, commentId),
      getLikes: getCommentLikes,
      getPromptComments,
      getPromptCommentCount: (prompt) => countCommentThread(getPromptComments(prompt.id)) || Number(prompt.comments || prompt.commentCount || 0),
      getSortedPromptComments: (promptId) => sortComments(getPromptComments(promptId)),
      getSortedReplies: (comment) => sortComments(comment.replies || []),
      syncCount: (promptId) => syncPromptCommentCount(promptId, commentsByPrompt[promptId], promptLists),
    });
  }
export { canDeleteComment, countCommentThread, createCommentRepository, findCommentById, findCommentInList, findPromptIdByCommentId, getCommentLikes, sortComments, syncPromptCommentCount };

// @ts-check
  "use strict";

function removePromptByIdState(/** @type {TtalkakStateEntity[]} */ list, /** @type {TtalkakId} */ promptId) {
  const index = list.findIndex((item) => item.id === promptId);
  if (index >= 0) list.splice(index, 1);
}


function applyPromptReportedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {string} */ reason) {
  const { state } = ctx;
  state.reportedPromptIds.add(promptId);
  state.reportRecords[`prompt:${promptId}`] = {
    type: "prompt",
    targetId: promptId,
    status: "pending",
    reporter: state.currentUser || "",
    reason,
    createdAt: Date.now(),
  };
  state.reportPromptId = null;
}


function applyCommentReportedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ commentId, /** @type {string} */ reason, /** @type {TtalkakStateEntity & {comment?: TtalkakStateEntity}} */ context) {
  const { makePreview, state } = ctx;
  state.reportedCommentIds.add(commentId);
  state.reportRecords[`comment:${commentId}`] = {
    type: "comment",
    targetId: commentId,
    promptId: context?.promptId || "",
    reporter: state.currentUser || "",
    targetAuthor: context?.comment?.author || context?.comment?.owner || "",
    targetPreview: makePreview(context?.comment?.text || ""),
    status: "pending",
    reason,
    createdAt: Date.now(),
  };
  state.reportCommentId = null;
}


function updatePromptCommentCountState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {number} */ delta) {
  const { popularPrompts, savedPrompts } = ctx;
  const updated = new Set();

  for (const list of [popularPrompts, savedPrompts]) {
    const prompt = list.find((item) => item.id === promptId);
    if (!prompt || updated.has(prompt)) continue;
    prompt.comments = Math.max(0, Number(prompt.comments || 0) + delta);
    updated.add(prompt);
  }
}


function addPromptCommentState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {string} */ text, /** @type {number} */ now = Date.now()) {
  const { commentsByPrompt, state } = ctx;
  if (!commentsByPrompt[promptId]) commentsByPrompt[promptId] = [];

  const comment = {
    id: `comment-${now}`,
    author: state.currentUser || "\uC775\uBA85",
    owner: state.currentUser || "\uC775\uBA85",
    text,
    likes: 0,
    replies: [],
  };

  commentsByPrompt[promptId].push(comment);
  state.expandedComments[promptId] = true;
  updatePromptCommentCountState(ctx, promptId, 1);
  return comment;
}


function toggleReplyCommentState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ commentId) {
  state.replyingCommentId = state.replyingCommentId === commentId ? null : commentId;
}


function addCommentReplyState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakStateEntity} */ parentComment, /** @type {TtalkakId} */ promptId, /** @type {string} */ text, /** @type {number} */ now = Date.now()) {
  const { state } = ctx;
  if (!Array.isArray(parentComment.replies)) parentComment.replies = [];

  const reply = {
    id: `reply-${now}`,
    author: state.currentUser || "\uC775\uBA85",
    owner: state.currentUser || "\uC775\uBA85",
    text,
    likes: 0,
    replies: [],
  };

  parentComment.replies.push(reply);
  state.replyingCommentId = null;
  if (promptId) updatePromptCommentCountState(ctx, promptId, 1);
  return reply;
}


function toggleEditCommentState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ commentId) {
  state.editingCommentId = state.editingCommentId === commentId ? null : commentId;
  state.replyingCommentId = null;
}


function updateOwnCommentState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakStateEntity} */ comment, /** @type {TtalkakId} */ commentId, /** @type {string} */ text, /** @type {string} */ revisionKey) {
  const changed = comment.text !== text;
  if (changed) {
    comment.text = text;
    comment.edited = true;
  }

  if (revisionKey && state.adminPromptRevisionRequests[revisionKey]) {
    const { [revisionKey]: _resolvedRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
    state.adminPromptRevisionRequests = remainingRequests;
  }

  if (state.editingCommentId === commentId) state.editingCommentId = null;
  return changed;
}


function toggleCommentLikedState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ commentId, /** @type {TtalkakStateEntity} */ comment, /** @type {(comment: TtalkakStateEntity) => number} */ getCommentLikes) {
  const wasLiked = state.likedCommentIds.has(commentId);
  if (wasLiked) {
    state.likedCommentIds.delete(commentId);
    comment.likes = Math.max(0, getCommentLikes(comment) - 1);
  } else {
    state.likedCommentIds.add(commentId);
    comment.likes = getCommentLikes(comment) + 1;
  }

  return { wasLiked };
}


function removeCommentFromListState(/** @type {TtalkakStateEntity[]} */ comments, /** @type {TtalkakId} */ commentId, /** @type {(comment: TtalkakStateEntity) => boolean} */ canRemoveComment) {
  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index];
    if (!comment) continue;
    if (comment.id === commentId && canRemoveComment(comment)) {
      if ((comment.replies || []).length > 0) {
        comment.deleted = true;
        comment.text = "\uC0AD\uC81C\uB41C \uB313\uAE00\uC785\uB2C8\uB2E4.";
        comment.author = "\uC0AD\uC81C\uB41C \uB313\uAE00";
        comment.owner = null;
        comment.likes = 0;
        comment.edited = false;
        return true;
      }

      comments.splice(index, 1);
      return true;
    }

    if (removeCommentFromListState(comment.replies || [], commentId, canRemoveComment)) {
      return true;
    }
  }

  return false;
}


function deleteCommentState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity[]} */ comments, /** @type {TtalkakId} */ commentId, /** @type {(comment: TtalkakStateEntity) => boolean} */ canRemoveComment) {
  const { state } = ctx;
  const removed = removeCommentFromListState(comments, commentId, canRemoveComment);
  if (!removed) return false;

  updatePromptCommentCountState(ctx, promptId, -1);
  state.likedCommentIds.delete(commentId);
  state.reportedCommentIds.delete(commentId);
  if (state.replyingCommentId === commentId) state.replyingCommentId = null;
  if (state.editingCommentId === commentId) state.editingCommentId = null;
  return true;
}


const api = Object.freeze({ removePromptByIdState, applyPromptReportedState, applyCommentReportedState, updatePromptCommentCountState, addPromptCommentState, toggleReplyCommentState, addCommentReplyState, toggleEditCommentState, updateOwnCommentState, toggleCommentLikedState, removeCommentFromListState, deleteCommentState });
export { api };

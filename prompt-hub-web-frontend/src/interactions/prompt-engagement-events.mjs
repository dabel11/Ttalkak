  "use strict";

  function bindPromptEngagementEvents(root, actions) {
    root.querySelectorAll("[data-save-prompt]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.toggleSavedPrompt(button.dataset.savePrompt); }));
    root.querySelectorAll("[data-like-prompt]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.toggleLikePrompt(button.dataset.likePrompt); }));
    root.querySelectorAll("[data-open-comments]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.openPromptComments(button.dataset.openComments); }));
    root.querySelectorAll("[data-comment-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); actions.addPromptComment(form.dataset.commentForm, new FormData(form).get("comment")); }));
    root.querySelectorAll("[data-reply-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); actions.addCommentReply(form.dataset.replyForm, new FormData(form).get("reply")); }));
    root.querySelectorAll("[data-edit-comment-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); actions.updateOwnComment(form.dataset.editCommentForm, new FormData(form).get("comment")); }));
    root.querySelectorAll("[data-like-comment]").forEach((button) => button.addEventListener("click", () => actions.toggleLikeComment(button.dataset.likeComment)));
    root.querySelectorAll("[data-reply-comment]").forEach((button) => button.addEventListener("click", () => actions.toggleReplyForm(button.dataset.replyComment)));
    root.querySelectorAll("[data-edit-comment]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.toggleEditComment(button.dataset.editComment); }));
    root.querySelectorAll("[data-delete-comment]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.deleteOwnComment(button.dataset.deleteComment); }));
  }

export { bindPromptEngagementEvents };

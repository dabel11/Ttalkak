(function () {
  window.TTALKAK_COMMENT_API = function createCommentApi({ request, unwrapItems, normalizers }) {
    const { normalizeComment } = normalizers;

    return {
      getPromptComments(promptId, token) {
        return request(`/api/prompts/${promptId}/comments`, { token }).then((payload) => unwrapItems(payload).map(normalizeComment));
      },
      addComment(promptId, payload, token) {
        return request(`/api/prompts/${promptId}/comments`, { method: "POST", token, body: JSON.stringify(payload) });
      },
      addReply(commentId, payload, token) {
        return request(`/api/comments/${commentId}/replies`, { method: "POST", token, body: JSON.stringify(payload) });
      },
      updateComment(commentId, payload, token) {
        return request(`/api/comments/${commentId}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      },
      deleteComment(commentId, token) {
        return request(`/api/comments/${commentId}`, { method: "DELETE", token });
      },
      likeComment(commentId, token) {
        return request(`/api/comments/${commentId}/like`, { method: "POST", token });
      },
      unlikeComment(commentId, token) {
        return request(`/api/comments/${commentId}/like`, { method: "DELETE", token });
      },
      reportComment(commentId, payload, token) {
        return request(`/api/reports/comments/${commentId}`, { method: "POST", token, body: JSON.stringify(payload) });
      },
    };
  };
})();

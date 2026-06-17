const API_BASE_URL = window.__API_BASE_URL__ || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  login(payload) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  signup(payload) {
    return request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  findId(payload) {
    return request("/api/auth/find-id", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  requestPasswordReset(payload) {
    return request("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getCommunityPosts({ page = 1, size = 16, sort = "popular" } = {}) {
    const query = new URLSearchParams({ page, size, sort });
    return request(`/api/prompts?${query.toString()}`);
  },

  searchCommunityPosts({ tags, page = 1, size = 16, sort = "popular" }) {
    const query = new URLSearchParams({ tags: tags.join(","), page, size, sort });
    return request(`/api/prompts?${query.toString()}`);
  },

  getPopularTags({ limit = 8 } = {}) {
    return request(`/api/tags/popular?limit=${limit}`);
  },

  viewPrompt(promptId) {
    return request(`/api/prompts/${promptId}/view`, {
      method: "POST",
    });
  },

  improvePrompt(payload, token) {
    return request("/api/prompts/improve", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  savePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}/save`, {
      method: "POST",
      token,
    });
  },

  unsavePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}/save`, {
      method: "DELETE",
      token,
    });
  },

  likePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}/like`, {
      method: "POST",
      token,
    });
  },

  unlikePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}/like`, {
      method: "DELETE",
      token,
    });
  },

  addComment(promptId, payload, token) {
    return request(`/api/prompts/${promptId}/comments`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  addReply(commentId, payload, token) {
    return request(`/api/comments/${commentId}/replies`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  updateComment(commentId, payload, token) {
    return request(`/api/comments/${commentId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteComment(commentId, token) {
    return request(`/api/comments/${commentId}`, {
      method: "DELETE",
      token,
    });
  },

  likeComment(commentId, token) {
    return request(`/api/comments/${commentId}/like`, {
      method: "POST",
      token,
    });
  },

  unlikeComment(commentId, token) {
    return request(`/api/comments/${commentId}/like`, {
      method: "DELETE",
      token,
    });
  },

  reportPrompt(promptId, payload, token) {
    return request(`/api/reports/prompts/${promptId}`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  reportComment(commentId, payload, token) {
    return request(`/api/reports/comments/${commentId}`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  getSavedPrompts({ filter = "all", page = 1, size = 16 } = {}, token) {
    const query = new URLSearchParams({ filter, page, size });
    return request(`/api/prompts/my?${query.toString()}`, { token });
  },

  sharePrompt(payload, token) {
    return request("/api/prompts", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },

  unsharePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}/visibility`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ isShared: false }),
    });
  },

  deletePrompt(promptId, token) {
    return request(`/api/prompts/${promptId}`, {
      method: "DELETE",
      token,
    });
  },
};

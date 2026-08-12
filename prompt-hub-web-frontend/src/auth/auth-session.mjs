  "use strict";
  function normalizeAuthResult(payload, fallbackUserId = "") { const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {}; const user = data.user || data.member || data.account || {}; return { token: String(data.accessToken || data.token || data.authToken || data.jwt || "").trim(), user: { id: user.id || user.memberId || data.memberId || null, userId: user.userId || user.username || data.userId || fallbackUserId || "", nickname: String(user.nickname || user.name || data.nickname || fallbackUserId || "사용자").trim() || "사용자", role: String(user.role || data.role || "user").toLowerCase().replace(/^role_/, "") }, raw: payload }; }
  function createAuthSession(ctx) {
    const key = () => !ctx.state.isLoggedIn ? "guest" : `${String(ctx.state.currentUserRole || "user").toLowerCase()}:${ctx.state.currentUserId || String(ctx.state.currentUser || "").trim() || "unknown"}`;
    const snapshot = () => ({ userLibraryPromptIds: [...ctx.state.userLibraryPromptIds], likedPromptIds: [...ctx.state.likedPromptIds], likedCommentIds: [...ctx.state.likedCommentIds], reportedPromptIds: [...ctx.state.reportedPromptIds], reportedCommentIds: [...ctx.state.reportedCommentIds], hideReportedPrompts: ctx.state.hideReportedPrompts });
    function saveScope() { ctx.state.accountScopes = { ...(ctx.state.accountScopes || {}), [key()]: snapshot() }; }
    function applyScope(scope = {}) { ["userLibraryPromptIds", "likedPromptIds", "likedCommentIds", "reportedPromptIds", "reportedCommentIds"].forEach((name) => { ctx.state[name] = new Set(Array.isArray(scope[name]) ? scope[name] : []); }); ctx.state.hideReportedPrompts = Boolean(scope.hideReportedPrompts); ctx.normalizeLikes(); }
    const restoreScope = () => applyScope(ctx.state.accountScopes?.[key()] || {});
    function applyUser(result) { saveScope(); ctx.applyIdentity(ctx.state, result); ctx.resetBackend(ctx.state); restoreScope(); ctx.writeToken(result.token); }
    function clear(options = {}) { saveScope(); ctx.clearState(ctx.state, options); restoreScope(); ctx.removeToken(); }
    return Object.freeze({ applyScope, applyUser, clear, key, restoreScope, saveScope, snapshot });
  }
export { createAuthSession, normalizeAuthResult };

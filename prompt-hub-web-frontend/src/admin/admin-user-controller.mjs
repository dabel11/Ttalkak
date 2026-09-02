export function createAdminUserController(ctx) {
  const {
    state, api, canUseDemoFallback, getAuthToken, hasBackendAuthToken, handleBackendAccessError, render, showNotice,
    normalizeAdminSearchText, getAdminUserActivity, getUniquePrompts, popularPrompts, savedPrompts,
    getDisplayPromptAuthor, getPromptAuthorId, getSortedPromptComments, getAdminReportRecords,
    applyAdminUserActivityRefreshState, applyAdminUserBlockActivityState, runAdminApiMutation, getAdminApiAction,
    reportWarning,
  } = ctx;

  function getKnownNicknames() {
    const nicknameMap = new Map();
    const add = (nickname) => {
      const clean = String(nickname || "").trim();
      const normalized = normalizeAdminSearchText(clean);
      if (normalized && !nicknameMap.has(normalized)) nicknameMap.set(normalized, clean);
    };
    getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts]).forEach((prompt) => {
      add(getDisplayPromptAuthor(prompt));
      getSortedPromptComments(prompt.id).forEach((comment) => {
        add(comment.author || comment.owner);
        (comment.replies || []).forEach((reply) => add(reply.author || reply.owner));
      });
    });
    getAdminReportRecords().forEach((record) => {
      add(record.reporter); add(record.promptAuthor); add(record.commentAuthor);
    });
    return Array.from(nicknameMap.values()).sort((a, b) => a.localeCompare(b, "ko"));
  }

  function getKnownMemberId(nickname) {
    const normalized = normalizeAdminSearchText(nickname);
    if (!normalized || normalized === normalizeAdminSearchText("탈퇴한 사용자")) return "";
    const activityId = state.backendAdminUserActivities[normalized]?.memberId;
    if (activityId) return String(activityId);
    for (const prompt of getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts])) {
      if (normalizeAdminSearchText(getDisplayPromptAuthor(prompt)) === normalized) {
        const id = getPromptAuthorId(prompt); if (id) return id;
      }
      for (const comment of getSortedPromptComments(prompt.id)) {
        if (normalizeAdminSearchText(comment.author || comment.owner) === normalized) {
          const id = comment.authorId || comment.memberId || comment.raw?.author?.id || comment.raw?.authorId || comment.raw?.memberId;
          if (id) return String(id);
        }
        for (const reply of comment.replies || []) {
          if (normalizeAdminSearchText(reply.author || reply.owner) === normalized) {
            const id = reply.authorId || reply.memberId || reply.raw?.author?.id || reply.raw?.authorId || reply.raw?.memberId;
            if (id) return String(id);
          }
        }
      }
    }
    for (const record of getAdminReportRecords()) {
      if (normalizeAdminSearchText(record.promptAuthor) === normalized && record.promptAuthorId) return String(record.promptAuthorId);
      if (normalizeAdminSearchText(record.commentAuthor) === normalized && record.commentAuthorId) return String(record.commentAuthorId);
      if (normalizeAdminSearchText(record.reporter) === normalized && record.reporterId) return String(record.reporterId);
    }
    return "";
  }

  function resolveNickname(value) {
    const clean = String(value || "").trim();
    const normalized = normalizeAdminSearchText(clean);
    if (!normalized) return clean;
    const known = getKnownNicknames();
    return known.find((item) => normalizeAdminSearchText(item) === normalized)
      || known.find((item) => normalizeAdminSearchText(item).startsWith(normalized))
      || known.find((item) => normalizeAdminSearchText(item).includes(normalized))
      || clean;
  }

  async function search(nickname) {
    const clean = String(nickname || "").trim();
    if (!clean) return;
    Object.assign(state, { adminUserQuery: clean, adminUserActivityNickname: "", adminUserSearchResults: [], adminUserSearchMessage: "사용자를 검색하는 중입니다.", adminTab: "users", route: "admin" });
    render();
    const token = getAuthToken() || undefined;
    if (api?.searchAdminUsers && hasBackendAuthToken()) {
      try {
        const users = await api.searchAdminUsers({ nickname: clean, page: 1, pageSize: 20 }, token);
        state.adminUserSearchResults = users;
        state.adminUserSearchMessage = users.length ? "조회할 사용자를 선택해주세요." : "일치하는 사용자를 찾지 못했습니다.";
        render(); return;
      } catch (error) {
        handleBackendAccessError(error, canUseDemoFallback() ? "사용자 검색 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 검색 API 조회에 실패했습니다.");
        reportWarning("admin", "search-users", error);
        if (!canUseDemoFallback()) { state.adminUserSearchResults = []; state.adminUserSearchMessage = "사용자 검색 API 호출에 실패했습니다."; render(); return; }
      }
    }
    const query = normalizeAdminSearchText(clean);
    const users = getKnownNicknames().filter((item) => normalizeAdminSearchText(item).includes(query)).slice(0, 20).map((item, index) => {
      const activity = getAdminUserActivity(item) || {};
      return { id: getKnownMemberId(item) || "", nickname: item, blocked: Boolean(activity.blocked), active: true, localOnly: true, index };
    });
    state.adminUserSearchResults = users;
    state.adminUserSearchMessage = users.length ? "서버 검색 대신 로컬 후보를 표시합니다. 조회할 사용자를 선택해주세요." : "일치하는 사용자를 찾지 못했습니다.";
    render();
  }

  async function openActivity(nickname, options = {}) {
    const clean = String(nickname || "").trim(); if (!clean) return;
    let resolved = resolveNickname(clean);
    Object.assign(state, { adminUserQuery: options.keepQuery ? clean : resolved, adminUserActivityNickname: resolved, adminUserSearchMessage: "", adminTab: "users", route: "admin", detailPromptId: null, detailHighlightCommentId: null });
    showNotice(`${resolved}님의 활동을 조회합니다.`); render();
    const token = getAuthToken() || undefined;
    let memberId = String(options.memberId || getKnownMemberId(resolved) || "").trim();
    if (!memberId && api?.searchAdminUsers && hasBackendAuthToken()) {
      try {
        const users = await api.searchAdminUsers({ nickname: clean, page: 1, pageSize: 10 }, token);
        const query = normalizeAdminSearchText(clean);
        const selected = users.find((user) => normalizeAdminSearchText(user.nickname) === query) || users.find((user) => normalizeAdminSearchText(user.nickname).includes(query)) || users[0];
        if (selected?.id) { memberId = String(selected.id); resolved = selected.nickname || resolved; state.adminUserActivityNickname = resolved; state.adminUserQuery = options.keepQuery ? clean : resolved; }
        else showNotice("일치하는 사용자를 찾지 못했습니다.");
      } catch (error) {
        handleBackendAccessError(error, canUseDemoFallback() ? "사용자 검색 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 검색 API 조회에 실패했습니다.");
        reportWarning("admin", "load-user", error); if (!canUseDemoFallback()) return;
      }
    }
    if (memberId && api?.getAdminUserActivity) {
      try {
        const activity = await api.getAdminUserActivity(memberId, { page: 1, pageSize: 20 }, token);
        state.backendAdminUserActivities = { ...state.backendAdminUserActivities, [normalizeAdminSearchText(resolved)]: { ...activity, nickname: activity.nickname || resolved, memberId: activity.memberId || memberId } };
        render();
      } catch (error) { handleBackendAccessError(error, canUseDemoFallback() ? "사용자 활동 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 활동 API 조회에 실패했습니다."); reportWarning("admin", "load-user-activity", error); }
    }
  }

  async function updateBlockState(memberId, shouldBlock, nickname = "", blockReason = "") {
    const cleanId = String(memberId || "").trim();
    if (!cleanId) { showNotice("샘플 작성자는 실제 회원 ID가 없어 차단할 수 없습니다."); return; }
    if (!getAdminApiAction("blockAdminUser") || !getAdminApiAction("unblockAdminUser")) { showNotice("회원 차단 API가 아직 연결되지 않았습니다."); return; }
    const reason = shouldBlock ? String(blockReason || "").trim() : "";
    if (shouldBlock && !reason) { showNotice("차단 사유가 필요합니다."); return; }
    const action = shouldBlock ? "blockAdminUser" : "unblockAdminUser";
    const args = shouldBlock ? [cleanId, { reason }] : [cleanId];
    const result = await runAdminApiMutation(action, args, { fallbackMessage: shouldBlock ? "회원 차단 요청에 실패했습니다." : "회원 차단 해제 요청에 실패했습니다." });
    if (!result.ok) return;
    const { displayNickname, normalizedNickname } = applyAdminUserBlockActivityState({ getAdminUserActivity, normalizeAdminSearchText, state }, { activity: result.value, memberId: cleanId, shouldBlock, nickname });
    showNotice(shouldBlock ? "회원 차단을 처리했습니다." : "회원 차단을 해제했습니다."); render();
    if (api?.getAdminUserActivity) api.getAdminUserActivity(cleanId, { page: 1, pageSize: 20 }, getAuthToken() || undefined).then((activity) => {
      applyAdminUserActivityRefreshState(state, { refreshedActivity: activity, normalizedNickname, displayNickname, memberId: cleanId, shouldBlock });
      if (normalizeAdminSearchText(state.adminUserActivityNickname) === normalizedNickname) render();
    }).catch((error) => reportWarning("admin", "refresh-user-after-block", error));
  }

  return Object.freeze({ search, openActivity, updateBlockState, getKnownMemberId });
}

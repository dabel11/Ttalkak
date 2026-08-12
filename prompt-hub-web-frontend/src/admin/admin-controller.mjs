export function createAdminController(ctx) {
    const {
      state, api: apiClient, canUseDemoFallback, getAuthToken, hasBackendAuthToken, handleBackendAccessError, render, showNotice,
      normalizeSearchText, getDisplayPromptAuthor, getPromptAuthorId, popularPrompts, savedPrompts, getUniquePrompts,
      applyAdminUserActivityRefreshState, applyAdminUserBlockActivityState, applyAdminTagDecisionState,
      applyAdminReportStatusState, applyAdminRevisionRequestState, applyAdminPromptHiddenState,
      canTransitionAdminTagStatus, getAdminTagStatus, resolveAdminTagStatus, normalizeTag,
      getReportRecord, mapFrontendReportStatus, mapBackendReportStatus, isFinalReportStatus, makeRevisionRequestKey,
      getRevisionRequestTarget, isRevisionTargetOwnedByCurrentUser,
      refreshAdminAfterMutationEffect, refreshAdminAuditLogsEffect, getAdminEffectContext, hydratePromptComments,
      isBackendNumericId, refreshBackendHomePrompts, getPromptMutationStateContext,
      normalizeAdminSearchText, getAdminUserActivity, hydrateBackendAdminDataIfNeeded, finishAdminRevisionRequestState,
      getBackendErrorCode, getSortedPromptComments, getAdminReportRecords, getAdminTagStatusLabel,
      getReportStatusLabel, getAuthorRevisionStatusLabel, commentsByPrompt, findCommentInList, findPromptById,
      getAdminHydrationEffectContext,
      reportWarning,
    } = ctx;
async function searchAdminUserCandidates(nickname) {
  const cleanNickname = String(nickname || "").trim();
  if (!cleanNickname) return;

  state.adminUserQuery = cleanNickname;
  state.adminUserActivityNickname = "";
  state.adminUserSearchResults = [];
  state.adminUserSearchMessage = "사용자를 검색하는 중입니다.";
  state.adminTab = "users";
  state.route = "admin";
  render();

  const api = apiClient;
  const token = getAuthToken() || undefined;
  if (api?.searchAdminUsers && hasBackendAuthToken()) {
    try {
      const users = await api.searchAdminUsers({ nickname: cleanNickname, page: 1, pageSize: 20 }, token);
      state.adminUserSearchResults = users;
      state.adminUserSearchMessage = users.length
        ? "조회할 사용자를 선택해주세요."
        : "일치하는 사용자를 찾지 못했습니다.";
      render();
      return;
    } catch (error) {
      handleBackendAccessError(
        error,
        canUseDemoFallback() ? "사용자 검색 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 검색 API 조회에 실패했습니다.",
      );
      reportWarning("admin", "search-users", error);
      if (!canUseDemoFallback()) {
        state.adminUserSearchResults = [];
        state.adminUserSearchMessage = "사용자 검색 API 호출에 실패했습니다.";
        render();
        return;
      }
    }
  }

  const normalizedQuery = normalizeAdminSearchText(cleanNickname);
  const localUsers = getAdminKnownNicknames()
    .filter((knownNickname) => normalizeAdminSearchText(knownNickname).includes(normalizedQuery))
    .slice(0, 20)
    .map((knownNickname, index) => {
      const memberId = getAdminKnownMemberId(knownNickname);
      const activity = getAdminUserActivity(knownNickname) || {};
      return {
        id: memberId || "",
        nickname: knownNickname,
        blocked: Boolean(activity.blocked),
        active: true,
        localOnly: true,
        index,
      };
    });
  state.adminUserSearchResults = localUsers;
  state.adminUserSearchMessage = localUsers.length
    ? "서버 검색 대신 로컬 후보를 표시합니다. 조회할 사용자를 선택해주세요."
    : "일치하는 사용자를 찾지 못했습니다.";
  render();
}

async function openAdminUserActivity(nickname, options = {}) {
  const cleanNickname = String(nickname || "").trim();
  if (!cleanNickname) return;
  let resolvedNickname = resolveAdminUserNickname(cleanNickname);

  state.adminUserQuery = options.keepQuery ? cleanNickname : resolvedNickname;
  state.adminUserActivityNickname = resolvedNickname;
  state.adminUserSearchMessage = "";
  state.adminTab = "users";
  state.route = "admin";
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
  showNotice(`${resolvedNickname}님의 활동을 조회합니다.`);
  render();

  const api = apiClient;
  const token = getAuthToken() || undefined;
  let memberId = String(options.memberId || getAdminKnownMemberId(resolvedNickname) || "").trim();
  if (!memberId && api?.searchAdminUsers && hasBackendAuthToken()) {
    try {
      const users = await api.searchAdminUsers({ nickname: cleanNickname, page: 1, pageSize: 10 }, token);
      const normalizedQuery = normalizeAdminSearchText(cleanNickname);
      const selectedUser =
        users.find((user) => normalizeAdminSearchText(user.nickname) === normalizedQuery) ||
        users.find((user) => normalizeAdminSearchText(user.nickname).includes(normalizedQuery)) ||
        users[0];
      if (selectedUser?.id) {
        memberId = String(selectedUser.id);
        resolvedNickname = selectedUser.nickname || resolvedNickname;
        state.adminUserActivityNickname = resolvedNickname;
        state.adminUserQuery = options.keepQuery ? cleanNickname : resolvedNickname;
      } else {
        showNotice("일치하는 사용자를 찾지 못했습니다.");
      }
    } catch (error) {
      handleBackendAccessError(
        error,
        canUseDemoFallback() ? "사용자 검색 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 검색 API 조회에 실패했습니다.",
      );
      reportWarning("admin", "load-user", error);
      if (!canUseDemoFallback()) return;
    }
  }

  if (memberId && apiClient?.getAdminUserActivity) {
    try {
      const activity = await apiClient.getAdminUserActivity(memberId, { page: 1, pageSize: 20 }, token);
      state.backendAdminUserActivities = {
        ...state.backendAdminUserActivities,
        [normalizeAdminSearchText(resolvedNickname)]: {
          ...activity,
          nickname: activity.nickname || resolvedNickname,
          memberId: activity.memberId || memberId,
        },
      };
      render();
    } catch (error) {
      handleBackendAccessError(
        error,
        canUseDemoFallback() ? "사용자 활동 API 조회에 실패했습니다. 로컬 후보로 표시합니다." : "사용자 활동 API 조회에 실패했습니다.",
      );
      reportWarning("admin", "load-user-activity", error);
    }
  }
}

function validateAdminUserBlockInput(memberId, shouldBlock, blockReason = "") {
  const cleanMemberId = String(memberId || "").trim();
  if (!cleanMemberId) {
    showNotice("샘플 작성자는 실제 회원 ID가 없어 차단할 수 없습니다.");
    return null;
  }
  if (!getAdminApiAction("blockAdminUser") || !getAdminApiAction("unblockAdminUser")) {
    showNotice("회원 차단 API가 아직 연결되지 않았습니다.");
    return null;
  }

  const reason = shouldBlock ? String(blockReason || "").trim() : "";
  if (shouldBlock && !reason) {
    showNotice("차단 사유가 필요합니다.");
    return null;
  }

  return { memberId: cleanMemberId, reason };
}

function getAdminUserBlockAction(shouldBlock) {
  return shouldBlock ? "blockAdminUser" : "unblockAdminUser";
}

function getAdminUserBlockArgs(memberId, shouldBlock, reason) {
  return shouldBlock ? [memberId, { reason }] : [memberId];
}

function applyAdminUserBlockActivity({ activity, memberId, shouldBlock, nickname }) {
  return applyAdminUserBlockActivityState(
    { getAdminUserActivity, normalizeAdminSearchText, state },
    { activity, memberId, shouldBlock, nickname },
  );
}

function refreshAdminUserActivityAfterBlock(memberId, normalizedNickname, displayNickname, shouldBlock) {
  const api = apiClient;
  if (!api?.getAdminUserActivity) return;

  api
    .getAdminUserActivity(memberId, { page: 1, pageSize: 20 }, getAuthToken() || undefined)
    .then((refreshedActivity) => {
      applyAdminUserActivityRefreshState(state, { refreshedActivity, normalizedNickname, displayNickname, memberId, shouldBlock });
      if (normalizeAdminSearchText(state.adminUserActivityNickname) === normalizedNickname) {
        render();
      }
    })
    .catch((refreshError) => {
      reportWarning("admin", "refresh-user-after-block", refreshError);
    });
}

async function updateAdminUserBlockState(memberId, shouldBlock, nickname = "", blockReason = "") {
  const input = validateAdminUserBlockInput(memberId, shouldBlock, blockReason);
  if (!input) return;

  const action = getAdminUserBlockAction(shouldBlock);
  const result = await runAdminApiMutation(action, getAdminUserBlockArgs(input.memberId, shouldBlock, input.reason), {
    fallbackMessage: shouldBlock ? "회원 차단 요청에 실패했습니다." : "회원 차단 해제 요청에 실패했습니다.",
  });
  if (!result.ok) return;

  const { displayNickname, normalizedNickname } = applyAdminUserBlockActivity({
    activity: result.value,
    memberId: input.memberId,
    shouldBlock,
    nickname,
  });
  showNotice(shouldBlock ? "회원 차단을 처리했습니다." : "회원 차단을 해제했습니다.");
  render();

  refreshAdminUserActivityAfterBlock(input.memberId, normalizedNickname, displayNickname, shouldBlock);
}

function getAdminApiAction(action) {
  const handler = apiClient?.[action];
  return typeof handler === "function" ? handler : null;
}

function canUseAdminApiAction(action) {
  return hasBackendAuthToken() && Boolean(getAdminApiAction(action));
}

async function runAdminApiMutation(action, args = [], options = {}) {
  const handler = getAdminApiAction(action);
  if (!handler) return { ok: false, missing: true, value: null };

  try {
    const token = getAuthToken() || undefined;
    const callArgs = options.tokenBeforeLast
      ? [...args.slice(0, -1), token, args.at(-1)]
      : [...args, token];
    const value = await handler(...callArgs);
    return { ok: true, missing: false, value };
  } catch (error) {
    if (typeof options.onError === "function" && options.onError(error)) {
      if (options.logMessage) reportWarning("admin", action, error);
      return { ok: false, missing: false, error, value: null };
    }
    handleBackendAccessError(error, options.fallbackMessage || "관리자 요청 처리에 실패했습니다.");
    if (options.logMessage) reportWarning("admin", action, error);
    if (options.refreshOnFailure) await hydrateBackendAdminDataIfNeeded({ force: true });
    return { ok: false, missing: false, error, value: null };
  }
}

function shouldUseBackendAuthorRevisionRequest(target) {
  return target?.type === "prompt" && isBackendNumericId(target.id) && state.backendStatus === "connected";
}

function setAdminRevisionRequestState(target, request, fallback = {}) {
  applyAdminRevisionRequestState(state, target, request, fallback);
}

async function finishAdminRevisionRequestMutation(notice, auditReason, backendChanged) {
  finishAdminRevisionRequestState(state);
  showNotice(notice);
  if (backendChanged) await refreshAdminAfterMutation({ auditReason });
  render();
}

function handleAuthorRevisionCreateError(error) {
  const status = Number(error?.status || error?.payload?.status || 0);
  const code = getBackendErrorCode(error);
  if (code === "AUTHOR_REVISION_REQUEST_ALREADY_ACTIVE") {
    showNotice("이미 처리 중인 수정 요청이 있습니다. 기존 요청의 상태에 따라 사유를 수정할 수 있습니다.");
    return true;
  }
  if (status === 409 || code === "CONFLICT" || code === "INVALID_STATE") {
    showNotice("이미 처리 중인 수정 요청이 있습니다.");
    return true;
  }
  return false;
}

function handleAuthorRevisionUpdateError(error) {
  const code = getBackendErrorCode(error);
  if (code === "REVISION_REQUEST_NOT_EDITABLE") {
    showNotice("작성자가 이미 확인했거나 처리가 끝난 수정 요청은 사유를 변경할 수 없습니다.");
    return true;
  }
  if (Number(error?.status || error?.payload?.status || 0) === 409) {
    showNotice("현재 상태에서는 수정 요청 사유를 변경할 수 없습니다.");
    return true;
  }
  return false;
}

function resolveAdminUserNickname(value) {
  const cleanValue = String(value || "").trim();
  const normalizedValue = normalizeAdminSearchText(cleanValue);
  if (!normalizedValue) return cleanValue;

  const nicknames = getAdminKnownNicknames();
  const exactMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname) === normalizedValue);
  if (exactMatch) return exactMatch;

  const startsWithMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname).startsWith(normalizedValue));
  if (startsWithMatch) return startsWithMatch;

  const includesMatch = nicknames.find((nickname) => normalizeAdminSearchText(nickname).includes(normalizedValue));
  return includesMatch || cleanValue;
}

function getAdminKnownNicknames() {
  const nicknameMap = new Map();
  const addNickname = (nickname) => {
    const cleanNickname = String(nickname || "").trim();
    const normalizedNickname = normalizeAdminSearchText(cleanNickname);
    if (!normalizedNickname || nicknameMap.has(normalizedNickname)) return;
    nicknameMap.set(normalizedNickname, cleanNickname);
  };

  getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts]).forEach((prompt) => {
    addNickname(getDisplayPromptAuthor(prompt));
    getSortedPromptComments(prompt.id).forEach((comment) => {
      addNickname(comment.author || comment.owner);
      (comment.replies || []).forEach((reply) => addNickname(reply.author || reply.owner));
    });
  });
  getAdminReportRecords().forEach((record) => {
    addNickname(record.reporter);
    addNickname(record.promptAuthor);
    addNickname(record.commentAuthor);
  });

  return Array.from(nicknameMap.values()).sort((a, b) => a.localeCompare(b, "ko"));
}

function getAdminKnownMemberId(nickname) {
  const normalizedNickname = normalizeAdminSearchText(nickname);
  if (!normalizedNickname || normalizedNickname === normalizeAdminSearchText("탈퇴한 사용자")) return "";

  const fromActivity = state.backendAdminUserActivities[normalizedNickname]?.memberId;
  if (fromActivity) return String(fromActivity);

  for (const prompt of getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts])) {
    if (normalizeAdminSearchText(getDisplayPromptAuthor(prompt)) === normalizedNickname) {
      const authorId = getPromptAuthorId(prompt);
      if (authorId) return authorId;
    }
    for (const comment of getSortedPromptComments(prompt.id)) {
      if (normalizeAdminSearchText(comment.author || comment.owner) === normalizedNickname) {
        const commentAuthorId = comment.authorId || comment.memberId || comment.raw?.author?.id || comment.raw?.authorId || comment.raw?.memberId;
        if (commentAuthorId) return String(commentAuthorId);
      }
      for (const reply of comment.replies || []) {
        if (normalizeAdminSearchText(reply.author || reply.owner) === normalizedNickname) {
          const replyAuthorId = reply.authorId || reply.memberId || reply.raw?.author?.id || reply.raw?.authorId || reply.raw?.memberId;
          if (replyAuthorId) return String(replyAuthorId);
        }
      }
    }
  }

  for (const record of getAdminReportRecords()) {
    if (normalizeAdminSearchText(record.promptAuthor) === normalizedNickname && record.promptAuthorId) return String(record.promptAuthorId);
    if (normalizeAdminSearchText(record.commentAuthor) === normalizedNickname && record.commentAuthorId) return String(record.commentAuthorId);
    if (normalizeAdminSearchText(record.reporter) === normalizedNickname && record.reporterId) return String(record.reporterId);
  }

  return "";
}


async function updateAdminTagDecision(tag, decision) {
  if (!tag || !["pending", "approved", "rejected", "disabled"].includes(decision)) return;

  let backendChanged = false;
  let updated = null;
  const backendTag = state.backendAdminTags.find((item) => item.key === tag || normalizeTag(item.label) === tag || item.id === tag);
  const currentStatus = backendTag?.status || state.adminTagDecisions[tag] || "pending";
  if (!canTransitionAdminTagStatus(currentStatus, decision)) {
    showNotice("현재 태그 상태에서는 이 변경을 할 수 없습니다.");
    return;
  }
  if (backendTag?.id && canUseAdminApiAction("updateAdminTagStatus")) {
    const result = await runAdminApiMutation("updateAdminTagStatus", [backendTag.id, decision], {
      fallbackMessage: "태그 상태 변경 요청에 실패했습니다.",
      logMessage: "[TTALKAK] /api/admin/tags/{id}/status failed; cancelling local status change.",
      refreshOnFailure: true,
    });
    if (!result.ok) return;

    updated = result.value;
    backendChanged = true;
  }

  applyAdminTagDecisionState(state, { tag, decision, backendTag, updated, normalizeTag });
  showNotice(`태그 상태를 ${getAdminTagStatusLabel(decision)}(으)로 변경했습니다.`);
  if (backendChanged) await refreshAdminAfterMutation({ auditReason: "태그 상태 변경 후" });
}

async function updateReportRecordStatus(key, status) {
  if (!key || !["pending", "reviewed", "dismissed", "resolved"].includes(status)) return;
  const record = getReportRecord(key);
  if (isFinalReportStatus(record.status) && status !== record.status) {
    showNotice("처리 완료 또는 기각된 신고의 상태를 다시 변경할 수 없습니다.");
    return;
  }
  if (status === "pending" && ["reviewed", "resolved", "dismissed"].includes(record.status)) {
    showNotice("완료 또는 기각된 신고는 다시 접수 상태로 되돌릴 수 없습니다.");
    return;
  }
  let backendChanged = false;
  let updated = null;
  if (record.backendId && canUseAdminApiAction("updateAdminReportStatus")) {
    const result = await runAdminApiMutation(
      "updateAdminReportStatus",
      [record.backendId, mapFrontendReportStatus(status), `${getReportStatusLabel(status)} 처리`],
      {
        fallbackMessage: "신고 상태 변경 요청에 실패했습니다.",
        logMessage: "[TTALKAK] /api/admin/reports/{id}/status failed; cancelling local status change.",
        refreshOnFailure: true,
        tokenBeforeLast: true,
      },
    );
    if (!result.ok) return;

    updated = result.value;
    backendChanged = true;
  }
  const nextStatus = applyAdminReportStatusState(state, { key, record, status, updated, mapBackendReportStatus, getReportRecord });
  showNotice(`신고 상태를 ${getReportStatusLabel(nextStatus)}로 변경했습니다.`);
  if (backendChanged) await refreshAdminAfterMutation({ auditReason: "신고 상태 변경 후" });
}

async function requestPromptRevision(targetKey, reason) {
  const target = getRevisionRequestTarget(targetKey);
  const content = String(reason || "").trim();

  if (!target || !state.adminMode) return;
  if (!content) {
    showNotice("작성자에게 전달할 수정 요청 사유를 입력해주세요.");
    return;
  }

  const existingRequest = state.adminPromptRevisionRequests[target.key];
  if (existingRequest) {
    await updateAuthorRevisionRequest(target, existingRequest, content);
    return;
  }

  let backendRequest = null;
  let backendChanged = false;
  const shouldUseBackendRevisionRequest = shouldUseBackendAuthorRevisionRequest(target);
  if (shouldUseBackendRevisionRequest && !canUseAdminApiAction("requestAuthorRevision")) {
    showNotice("실제 관리자 토큰과 수정 요청 API가 필요합니다.");
    return;
  }

  if (shouldUseBackendRevisionRequest) {
    const result = await runAdminApiMutation("requestAuthorRevision", [target.id, { message: content, reason: content, memo: content }], {
      fallbackMessage: "수정 요청 API 호출에 실패했습니다.",
      logMessage: "[TTALKAK] /api/admin/prompts/{id}/author-revision-requests failed.",
      onError: handleAuthorRevisionCreateError,
    });
    if (!result.ok) return;
    backendRequest = result.value;
    backendChanged = true;
  }

  setAdminRevisionRequestState(target, backendRequest, { reason: content });
  await finishAdminRevisionRequestMutation("작성자에게 수정 요청을 보냈습니다.", "수정 요청 후", backendChanged);
}

async function updateAuthorRevisionRequest(target, existingRequest, reason) {
  const status = String(existingRequest?.status || "pending").toLowerCase();

  if (status !== "pending") {
    showNotice(`${getAuthorRevisionStatusLabel(status)} 상태에서는 수정 요청 사유를 변경할 수 없습니다.`);
    return;
  }

  if (!existingRequest?.id) {
    showNotice("수정 요청 ID가 없어 사유를 변경할 수 없습니다.");
    return;
  }

  if (String(existingRequest.reason || "").trim() === reason) {
    showNotice("수정 요청 사유가 변경되지 않았습니다.");
    return;
  }

  const shouldUseBackendRevisionRequest = shouldUseBackendAuthorRevisionRequest(target);
  if (shouldUseBackendRevisionRequest && !canUseAdminApiAction("updateAuthorRevisionRequest")) {
    showNotice("실제 관리자 토큰과 수정 요청 사유 수정 API가 필요합니다.");
    return;
  }

  let backendRequest = null;
  let backendChanged = false;

  if (shouldUseBackendRevisionRequest) {
    const result = await runAdminApiMutation("updateAuthorRevisionRequest", [existingRequest.id, { message: reason }], {
      fallbackMessage: "수정 요청 사유 변경에 실패했습니다.",
      logMessage: "[TTALKAK] /api/admin/author-revision-requests/{id} failed.",
      onError: handleAuthorRevisionUpdateError,
    });
    if (!result.ok) return;
    backendRequest = result.value;
    backendChanged = true;
  }

  setAdminRevisionRequestState(target, backendRequest, {
    previousRequest: existingRequest,
    id: existingRequest.id,
    reason,
    requestedAt: existingRequest.requestedAt,
    status: existingRequest.status || "pending",
  });
  await finishAdminRevisionRequestMutation("수정 요청 사유를 변경했습니다.", "수정 요청 사유 변경 후", backendChanged);
}

function findCommentContextById(commentId) {
  for (const [promptId, comments] of Object.entries(commentsByPrompt)) {
    const comment = findCommentInList(comments, commentId);
    if (comment) {
      return {
        promptId,
        prompt: findPromptById(promptId),
        comment,
      };
    }
  }
  return null;
}


async function updateAdminCommentHiddenState(commentId, shouldHide) {
  if (!state.adminMode || !commentId) return;
  const context = findCommentContextById(commentId);
  const comment = context?.comment;
  if (!comment || comment.deleted) return;

  const apiName = shouldHide ? "hideAdminComment" : "unhideAdminComment";
  if (!isBackendNumericId(commentId) || !hasBackendAuthToken() || !apiClient?.[apiName]) {
    comment.hidden = shouldHide;
    showNotice(shouldHide ? "댓글을 숨김 처리했습니다." : "댓글 숨김을 해제했습니다.");
    render();
    return;
  }

  try {
    const updated = await apiClient[apiName](commentId, getAuthToken() || undefined);
    comment.hidden = Boolean(updated?.hidden || updated?.isHidden || shouldHide);
    if (!shouldHide) comment.hidden = false;
    if (updated?.text || updated?.content) comment.text = updated.text || updated.content;
    showNotice(shouldHide ? "댓글을 숨김 처리했습니다." : "댓글 숨김을 해제했습니다.");
    if (context.promptId) await hydratePromptComments(context.promptId);
    await refreshAdminAfterMutation({ auditReason: shouldHide ? "댓글 숨김 후" : "댓글 숨김 해제 후" });
  } catch (error) {
    handleBackendAccessError(error, shouldHide ? "댓글 숨김 요청에 실패했습니다." : "댓글 숨김 해제 요청에 실패했습니다.");
  }

  render();
}



async function toggleAdminPromptHidden(promptId) {
  if (!promptId) return;
  const canUseBackendPromptAction = hasBackendAuthToken() && isBackendNumericId(promptId);

  if (!canUseBackendPromptAction) {
    showNotice("서버 프롬프트 ID와 관리자 토큰이 있어야 게시물 숨김 감사 로그를 남길 수 있습니다.");
    return;
  }

  const shouldRestore = state.adminHiddenPromptIds.has(promptId);
  if (shouldRestore) {
    if (canUseAdminApiAction("restoreAdminPrompt")) {
      const result = await runAdminApiMutation("restoreAdminPrompt", [promptId], {
        fallbackMessage: "게시글 숨김 해제 요청에 실패했습니다.",
        logMessage: "[TTALKAK] /api/admin/prompts/{id}/restore failed; aborting prompt restore.",
      });
      if (!result.ok) return;
    } else {
      showNotice("게시글 숨김 해제 API가 연결되어 있지 않습니다.");
      return;
    }
    applyAdminPromptHiddenState(state, promptId, false);
    showNotice("관리자 숨김을 해제했습니다.");
  } else {
    if (canUseAdminApiAction("hideAdminPrompt")) {
      const result = await runAdminApiMutation("hideAdminPrompt", [promptId], {
        fallbackMessage: "게시글 숨김 요청에 실패했습니다.",
        logMessage: "[TTALKAK] /api/admin/prompts/{id}/hide failed; aborting prompt hide.",
      });
      if (!result.ok) return;
    } else {
      showNotice("게시글 숨김 API가 연결되어 있지 않습니다.");
      return;
    }
    applyAdminPromptHiddenState(state, promptId, true);
    showNotice("관리자 숨김 처리했습니다.");
  }
  await refreshAdminAfterMutation({ auditReason: "게시물 숨김/해제 후" });
}


async function refreshAdminAuditLogs(options = {}) {
  return refreshAdminAuditLogsEffect(getAdminHydrationEffectContext(), options);
}

async function refreshAdminAfterMutation({ auditReason = "", shouldRender = true } = {}) {
  return refreshAdminAfterMutationEffect(getAdminHydrationEffectContext(), { auditReason, shouldRender });
}

    return Object.freeze({ searchAdminUserCandidates, openAdminUserActivity, getAdminKnownMemberId, updateAdminUserBlockState, updateAdminTagDecision, updateReportRecordStatus, requestPromptRevision, updateAuthorRevisionRequest, updateAdminCommentHiddenState, toggleAdminPromptHidden, refreshAdminAuditLogs, refreshAdminAfterMutation });
  }

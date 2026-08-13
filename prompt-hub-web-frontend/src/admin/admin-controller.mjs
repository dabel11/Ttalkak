import { createAdminTagController } from "./admin-tag-controller.mjs";
import { createAdminReportController } from "./admin-report-controller.mjs";
import { createAdminUserController } from "./admin-user-controller.mjs";

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

const adminTagController = createAdminTagController({ state, normalizeTag, canTransition: canTransitionAdminTagStatus, canUseApi: canUseAdminApiAction, runMutation: runAdminApiMutation, applyState: applyAdminTagDecisionState, getStatusLabel: getAdminTagStatusLabel, showNotice, refresh: refreshAdminAfterMutation });
const adminReportController = createAdminReportController({ state, getRecord: getReportRecord, isFinal: isFinalReportStatus, canUseApi: canUseAdminApiAction, runMutation: runAdminApiMutation, toBackendStatus: mapFrontendReportStatus, fromBackendStatus: mapBackendReportStatus, getStatusLabel: getReportStatusLabel, applyState: applyAdminReportStatusState, showNotice, refresh: refreshAdminAfterMutation });
const adminUserController = createAdminUserController({ state, api: apiClient, canUseDemoFallback, getAuthToken, hasBackendAuthToken, handleBackendAccessError, render, showNotice, normalizeAdminSearchText, getAdminUserActivity, getUniquePrompts, popularPrompts, savedPrompts, getDisplayPromptAuthor, getPromptAuthorId, getSortedPromptComments, getAdminReportRecords, applyAdminUserActivityRefreshState, applyAdminUserBlockActivityState, runAdminApiMutation, getAdminApiAction, reportWarning });
const searchAdminUserCandidates = (nickname) => adminUserController.search(nickname);
const openAdminUserActivity = (nickname, options = {}) => adminUserController.openActivity(nickname, options);
const getAdminKnownMemberId = (nickname) => adminUserController.getKnownMemberId(nickname);
const updateAdminUserBlockState = (memberId, shouldBlock, nickname = "", blockReason = "") => adminUserController.updateBlockState(memberId, shouldBlock, nickname, blockReason);

async function updateAdminTagDecision(tag, decision) {
  return adminTagController.update(tag, decision);
}

async function updateReportRecordStatus(key, status) {
  return adminReportController.updateStatus(key, status);
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

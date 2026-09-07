// @ts-check
  "use strict";

function applyAdminRevisionRequestState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakStateEntity & {key: string, type: string, id: TtalkakId}} */ target, /** @type {TtalkakStateEntity} */ request, /** @type {TtalkakStateEntity & {previousRequest?: TtalkakStateEntity}} */ fallback = {}) {
  state.adminPromptRevisionRequests = {
    ...state.adminPromptRevisionRequests,
    [target.key]: {
      ...fallback.previousRequest,
      ...request,
      id: request?.id || fallback.id || "",
      type: target.type,
      targetId: target.id,
      reason: request?.reason || request?.message || fallback.reason || "",
      requestedAt: request?.requestedAt || fallback.requestedAt || Date.now(),
      status: request?.status || fallback.status || "pending",
    },
  };
}


function finishAdminRevisionRequestState(/** @type {TtalkakApplicationState} */ state) {
  state.adminRequestTargetKey = null;
}


function applyAdminUserBlockActivityState(/** @type {TtalkakStateContext} */ ctx, /** @type {{activity?: TtalkakStateEntity, memberId: TtalkakId, shouldBlock: boolean, nickname?: string}} */ { activity, memberId, shouldBlock, nickname }) {
  const { getAdminUserActivity, normalizeAdminSearchText, state } = ctx;
  const displayNickname = String(activity?.nickname || nickname || state.adminUserActivityNickname || "\uC0AC\uC6A9\uC790").trim();
  const normalizedNickname = normalizeAdminSearchText(displayNickname);
  const previousActivity = state.backendAdminUserActivities[normalizedNickname] || getAdminUserActivity(displayNickname);

  state.backendAdminUserActivities = {
    ...state.backendAdminUserActivities,
    [normalizedNickname]: {
      ...previousActivity,
      ...activity,
      prompts: previousActivity.prompts || activity?.prompts || [],
      comments: previousActivity.comments || activity?.comments || [],
      replies: previousActivity.replies || activity?.replies || [],
      reportsMade: previousActivity.reportsMade || activity?.reportsMade || [],
      reportsReceived: previousActivity.reportsReceived || activity?.reportsReceived || [],
      nickname: displayNickname,
      memberId,
      blocked: shouldBlock,
    },
  };
  state.adminUserActivityNickname = displayNickname;
  state.adminUserQuery = displayNickname;
  state.adminBlockTarget = null;
  state.adminBackendStatus = "idle";

  return { displayNickname, normalizedNickname };
}


function applyAdminUserActivityRefreshState(/** @type {TtalkakApplicationState} */ state, /** @type {{refreshedActivity?: TtalkakStateEntity, normalizedNickname: string, displayNickname: string, memberId: TtalkakId, shouldBlock: boolean}} */ { refreshedActivity, normalizedNickname, displayNickname, memberId, shouldBlock }) {
  const currentActivity = state.backendAdminUserActivities[normalizedNickname] || {};
  state.backendAdminUserActivities = {
    ...state.backendAdminUserActivities,
    [normalizedNickname]: {
      ...currentActivity,
      ...refreshedActivity,
      nickname: displayNickname,
      memberId,
      blocked: shouldBlock,
    },
  };
}


function applyAdminTagDecisionState(/** @type {TtalkakApplicationState} */ state, /** @type {{tag: string, decision: string, backendTag?: TtalkakStateEntity, updated?: TtalkakStateEntity, normalizeTag?: boolean}} */ { tag, decision, backendTag, updated, normalizeTag }) {
  if (backendTag?.id && updated) {
    state.backendAdminTags = state.backendAdminTags.map((item) =>
      item.id === backendTag.id ? { ...item, ...updated, status: updated.status || decision } : item,
    );
  }
  const key = backendTag?.key || tag;
  state.adminTagDecisions = { ...state.adminTagDecisions, [key]: decision };
  if (key !== tag && normalizeTag) {
    state.adminTagDecisions = { ...state.adminTagDecisions, [tag]: decision };
  }
}


function applyAdminReportStatusState(/** @type {TtalkakApplicationState} */ state, /** @type {{key: string, record?: TtalkakStateEntity, status: string, updated?: TtalkakStateEntity, mapBackendReportStatus(value: unknown): string, getReportRecord(key: string): TtalkakStateEntity}} */ { key, record, status, updated, mapBackendReportStatus, getReportRecord }) {
  let nextStatus = status;
  if (record?.backendId && updated) {
    nextStatus = mapBackendReportStatus(updated?.status || status);
    state.backendAdminReports = state.backendAdminReports.map((report) =>
      report.id === record.backendId ? { ...report, ...updated, status: updated?.status || status } : report,
    );
  }
  state.reportRecords[key] = { ...getReportRecord(key), status: nextStatus, updatedAt: Date.now() };
  return nextStatus;
}


function applyAdminPromptHiddenState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ promptId, /** @type {boolean} */ shouldHide) {
  if (shouldHide) {
    state.adminHiddenPromptIds.add(promptId);
  } else {
    state.adminHiddenPromptIds.delete(promptId);
  }
}


const api = Object.freeze({ applyAdminRevisionRequestState, finishAdminRevisionRequestState, applyAdminUserBlockActivityState, applyAdminUserActivityRefreshState, applyAdminTagDecisionState, applyAdminReportStatusState, applyAdminPromptHiddenState });
export { api };

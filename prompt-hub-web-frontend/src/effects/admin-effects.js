(function attachAdminEffects(global) {
  "use strict";

  function normalizeAdminSearchText(value) {
    return String(value || "")
      .replace(/^#+/, "")
      .replace(/[#,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function resolveAdminTagStatus(decisions, tag, normalizeTagFn) {
    const normalize = typeof normalizeTagFn === "function" ? normalizeTagFn : (value) => String(value || "").trim().toLowerCase();
    const decision = decisions?.[normalize(tag)];
    if (["approved", "rejected", "disabled"].includes(decision)) return decision;
    return "pending";
  }

  function getAdminTagStatusLabel(status) {
    if (status === "approved") return "\uAC80\uD1A0 \uC644\uB8CC";
    if (status === "disabled") return "\uCD94\uCC9C \uC81C\uC678";
    if (status === "rejected") return "\uBC18\uB824";
    return "\uAC80\uD1A0 \uC911";
  }

  function getAdminTagStatusClass(status) {
    if (status === "approved") return "public";
    if (["rejected", "disabled"].includes(status)) return "private";
    return "pending-unsave";
  }

  function getAdminTagStatusOrder(status) {
    if (status === "pending") return 0;
    if (status === "approved") return 1;
    if (status === "disabled") return 2;
    return 3;
  }

  function canTransitionAdminTagStatus(currentStatus, nextStatus) {
    if (currentStatus === "pending") return ["approved", "rejected"].includes(nextStatus);
    if (currentStatus === "approved") return nextStatus === "disabled";
    if (currentStatus === "disabled") return nextStatus === "approved";
    return false;
  }

  async function hydrateBackendAdminData(ctx, options = {}) {
    const {
      api,
      canUseDemoFallback,
      getAuthToken,
      getReportRecord,
      hasBackendAuthToken,
      mapBackendReportStatus,
      render,
      state,
    } = ctx;
    const force = Boolean(options.force);

    if (state.route !== "admin" || !state.adminMode || (!force && state.adminBackendStatus !== "idle")) return;
    if (!api?.getAdminReports && !api?.getAdminTags && !api?.getAdminPrompts && !api?.getAdminRevisionRequests && !api?.getAdminAuditLogs) {
      state.adminBackendStatus = canUseDemoFallback() ? "demo" : "fallback";
      render();
      return;
    }
    if (!hasBackendAuthToken()) {
      state.adminBackendStatus = canUseDemoFallback() ? "demo" : "fallback";
      render();
      return;
    }

    state.adminBackendStatus = "checking";
    const token = getAuthToken() || undefined;
    const [reportsResult, tagsResult, promptsResult, revisionRequestsResult, auditLogsResult] = await Promise.allSettled([
      api.getAdminReports?.({}, token),
      api.getAdminTags?.({}, token),
      api.getAdminPrompts?.({}, token),
      api.getAdminRevisionRequests?.({}, token),
      api.getAdminAuditLogs?.({}, token),
    ]);
    const allRequestsFailed = [reportsResult, tagsResult, promptsResult, revisionRequestsResult, auditLogsResult].every(
      (result) => result.status === "rejected" || result.value === undefined,
    );

    let shouldRender = false;
    if (reportsResult.status === "fulfilled" && Array.isArray(reportsResult.value)) {
      state.backendAdminReports = reportsResult.value;
      state.backendAdminReportsLoaded = true;
      reportsResult.value.forEach((report) => {
        state.reportRecords[report.key] = {
          ...getReportRecord(report.key),
          backendId: report.id,
          status: mapBackendReportStatus(report.status),
          reason: report.reason || getReportRecord(report.key).reason || "",
          createdAt: report.createdAt || Date.now(),
        };
        if (report.type === "prompt") state.reportedPromptIds.add(report.targetId);
        if (report.type === "comment") state.reportedCommentIds.add(report.targetId);
      });
      shouldRender = true;
    } else if (reportsResult.status === "rejected") {
      state.backendAdminReportsLoaded = false;
      ctx.reportWarning("admin-hydration", "reports", reportsResult.reason);
    }

    if (tagsResult.status === "fulfilled" && Array.isArray(tagsResult.value)) {
      state.backendAdminTags = tagsResult.value;
      tagsResult.value.forEach((tag) => {
        if (!tag.key) return;
        state.adminTagDecisions = { ...state.adminTagDecisions, [tag.key]: tag.status };
      });
      shouldRender = true;
    } else if (tagsResult.status === "rejected") {
      ctx.reportWarning("admin-hydration", "tags", tagsResult.reason);
    }

    if (promptsResult.status === "fulfilled" && Array.isArray(promptsResult.value)) {
      state.backendAdminPrompts = promptsResult.value;
      shouldRender = true;
    } else if (promptsResult.status === "rejected") {
      ctx.reportWarning("admin-hydration", "prompts", promptsResult.reason);
    }

    if (revisionRequestsResult.status === "fulfilled" && Array.isArray(revisionRequestsResult.value)) {
      state.backendAdminRevisionRequests = revisionRequestsResult.value;
      revisionRequestsResult.value.forEach((request) => {
        if (!request.key) return;
        state.adminPromptRevisionRequests = {
          ...state.adminPromptRevisionRequests,
          [request.key]: {
            id: request.id,
            type: request.type,
            targetId: request.targetId,
            reason: request.reason,
            requestedAt: request.requestedAt,
            status: request.status,
          },
        };
      });
      shouldRender = true;
    } else if (revisionRequestsResult.status === "rejected") {
      ctx.reportWarning("admin-hydration", "revision-requests", revisionRequestsResult.reason);
    }

    if (auditLogsResult.status === "fulfilled" && Array.isArray(auditLogsResult.value)) {
      state.backendAdminAuditLogs = auditLogsResult.value;
      shouldRender = true;
    } else if (auditLogsResult.status === "rejected") {
      ctx.reportWarning("admin-hydration", "audit-logs", auditLogsResult.reason);
    }

    state.adminBackendStatus = allRequestsFailed ? "fallback" : "connected";
    if (shouldRender || allRequestsFailed) render();
  }

  async function refreshAdminAuditLogsEffect(ctx, { shouldRender = true, reason = "" } = {}) {
    const {
      api,
      formatShortDate,
      getAuthToken,
      hasBackendAuthToken,
      render,
      state,
    } = ctx;

    if (!state.adminMode || !hasBackendAuthToken() || !api?.getAdminAuditLogs) {
      state.adminAuditSyncMessage = "관리자 토큰 또는 감사 로그 API가 없어 서버 감사 로그를 확인하지 못했습니다.";
      if (shouldRender) render();
      return false;
    }

    try {
      const logs = await api.getAdminAuditLogs({}, getAuthToken() || undefined);
      if (!Array.isArray(logs)) {
        state.adminAuditSyncMessage = "감사 로그 응답 형식이 예상과 달라 목록을 갱신하지 못했습니다.";
        if (shouldRender) render();
        return false;
      }
      state.backendAdminAuditLogs = logs;
      state.adminAuditSyncMessage = `${reason || "감사 로그"} 서버 재조회 완료 · ${formatShortDate(Date.now())}`;
      if (shouldRender) render();
      return true;
    } catch (error) {
      state.adminAuditSyncMessage = "감사 로그 재조회에 실패했습니다. Network 탭의 /api/admin/audit-logs 응답을 확인해주세요.";
      ctx.reportWarning("admin-hydration", "refresh-audit-logs", error);
      if (shouldRender) render();
      return false;
    }
  }

  async function refreshAdminAfterMutationEffect(ctx, { auditReason = "", shouldRender = true } = {}) {
    return refreshAdminAuditLogsEffect(ctx, { reason: auditReason, shouldRender });
  }

  global.TtalkakAdminEffects = Object.freeze({
    ...(global.TtalkakAdminEffects || {}),
    canTransitionAdminTagStatus,
    getAdminTagStatusClass,
    getAdminTagStatusLabel,
    getAdminTagStatusOrder,
    hydrateBackendAdminData,
    normalizeAdminSearchText,
    refreshAdminAfterMutationEffect,
    refreshAdminAuditLogsEffect,
    resolveAdminTagStatus,
  });
})(window);

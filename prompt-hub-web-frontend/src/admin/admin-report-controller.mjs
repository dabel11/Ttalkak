export function createAdminReportController(ctx) {
  async function updateStatus(key, status) {
    if (!key || !["pending", "reviewed", "dismissed", "resolved"].includes(status)) return;
    const record = ctx.getRecord(key);
    if (ctx.isFinal(record.status) && status !== record.status) return ctx.showNotice("처리 완료 또는 기각된 신고의 상태를 다시 변경할 수 없습니다.");
    if (status === "pending" && ["reviewed", "resolved", "dismissed"].includes(record.status)) return ctx.showNotice("완료 또는 기각된 신고는 다시 접수 상태로 되돌릴 수 없습니다.");
    let updated = null;
    let backendChanged = false;
    if (record.backendId && ctx.canUseApi("updateAdminReportStatus")) {
      const result = await ctx.runMutation("updateAdminReportStatus", [record.backendId, ctx.toBackendStatus(status), `${ctx.getStatusLabel(status)} 처리`], { fallbackMessage: "신고 상태 변경 요청에 실패했습니다.", logMessage: "[TTALKAK] /api/admin/reports/{id}/status failed; cancelling local status change.", refreshOnFailure: true, tokenBeforeLast: true });
      if (!result.ok) return;
      updated = result.value;
      backendChanged = true;
    }
    const nextStatus = ctx.applyState(ctx.state, { key, record, status, updated, mapBackendReportStatus: ctx.fromBackendStatus, getReportRecord: ctx.getRecord });
    ctx.showNotice(`신고 상태를 ${ctx.getStatusLabel(nextStatus)}로 변경했습니다.`);
    if (backendChanged) await ctx.refresh({ auditReason: "신고 상태 변경 후" });
  }
  return Object.freeze({ updateStatus });
}

export function createAdminTagController(ctx) {
  async function update(tag, decision) {
    if (!tag || !["pending", "approved", "rejected", "disabled"].includes(decision)) return;
    const backendTag = ctx.state.backendAdminTags.find((item) => item.key === tag || ctx.normalizeTag(item.label) === tag || item.id === tag);
    const currentStatus = backendTag?.status || ctx.state.adminTagDecisions[tag] || "pending";
    if (!ctx.canTransition(currentStatus, decision)) return ctx.showNotice("현재 태그 상태에서는 이 변경을 할 수 없습니다.");
    let updated = null;
    let backendChanged = false;
    if (backendTag?.id && ctx.canUseApi("updateAdminTagStatus")) {
      const result = await ctx.runMutation("updateAdminTagStatus", [backendTag.id, decision], { fallbackMessage: "태그 상태 변경 요청에 실패했습니다.", logMessage: "[TTALKAK] /api/admin/tags/{id}/status failed; cancelling local status change.", refreshOnFailure: true });
      if (!result.ok) return;
      updated = result.value;
      backendChanged = true;
    }
    ctx.applyState(ctx.state, { tag, decision, backendTag, updated, normalizeTag: ctx.normalizeTag });
    ctx.showNotice(`태그 상태를 ${ctx.getStatusLabel(decision)}(으)로 변경했습니다.`);
    if (backendChanged) await ctx.refresh({ auditReason: "태그 상태 변경 후" });
  }
  return Object.freeze({ update });
}

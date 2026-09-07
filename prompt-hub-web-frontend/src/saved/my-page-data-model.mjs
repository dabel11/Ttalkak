export function createMyPageDataModel(ctx) {
  const uniqueComments = (items) => { const seen = new Set(); return items.filter((item) => { const comment = item.comment || {}; const key = String(comment.id || `${item.promptId}:${comment.text || ""}:${comment.createdAt || ""}`); if (seen.has(key)) return false; seen.add(key); return true; }); };
  const collectOwned = (items, promptId, comments, owner) => (comments || []).forEach((comment) => { if (!comment.deleted && [comment.owner, comment.author].some((value) => value === owner || value === "나")) items.push({ promptId, prompt: ctx.findPrompt(promptId), comment }); collectOwned(items, promptId, comment.replies || [], owner); });
  const localComments = () => { const items = []; const owner = ctx.state.currentUser || "나"; Object.entries(ctx.commentsByPrompt).forEach(([id, comments]) => collectOwned(items, id, comments, owner)); return items; };
  const uniqueReports = (reports) => { const seen = new Set(); return reports.filter((report) => { const key = `${report.title || report.status || "report"}:${report.type}:${report.id}`; if (seen.has(key)) return false; seen.add(key); return true; }); };

  function getPrompts() {
    if (ctx.state.myBackendStatus === "fallback" && !ctx.canUseDemoFallback()) return [];
    const local = ctx.savedPrompts.filter((prompt) => prompt.source === "mine" && !ctx.isHiddenDemo(prompt));
    return ctx.uniquePrompts(ctx.state.myBackendStatus === "connected" ? [...ctx.state.backendMyPrompts, ...local] : local);
  }
  function getComments() {
    if (ctx.state.myBackendStatus === "fallback" && !ctx.canUseDemoFallback()) return [];
    const local = localComments();
    if (ctx.state.myBackendStatus !== "connected") return local;
    const backend = ctx.state.backendMyComments.map((comment) => ({ promptId: String(comment.promptId || ""), prompt: comment.prompt || ctx.findPrompt(String(comment.promptId || "")) || { id: String(comment.promptId || ""), title: comment.promptTitle || "삭제된 프롬프트", text: "", author: "" }, comment }));
    return uniqueComments([...backend, ...local]);
  }
  function getReports() {
    if (ctx.state.myBackendStatus === "fallback" && !ctx.canUseDemoFallback()) return [];
    const backend = ctx.state.backendMyReports.map((report) => ({ type: report.type, title: report.type === "comment" ? "댓글 신고" : "프롬프트 신고", id: report.targetId, label: report.reason || report.raw?.targetPreview || report.raw?.promptTitle || "신고 내역", reason: report.reason, memo: report.memo || "", reviewedAt: report.reviewedAt || 0, status: ctx.mapBackendReportStatus(report.status), requestedAt: report.createdAt }));
    const promptReports = [...ctx.state.reportedPromptIds].map((id) => { const record = ctx.getReportRecord(`prompt:${id}`); return { type: "prompt", title: "프롬프트 신고", id, label: ctx.findPrompt(id)?.title || "삭제된 프롬프트", reason: record.reason || "", memo: record.memo || "", reviewedAt: record.reviewedAt || 0, status: record.status, requestedAt: record.createdAt }; });
    const commentReports = [...ctx.state.reportedCommentIds].map((id) => { const record = ctx.getReportRecord(`comment:${id}`); return { type: "comment", title: "댓글 신고", id, label: ctx.findComment(id)?.text || "삭제된 댓글", reason: record.reason || "", memo: record.memo || "", reviewedAt: record.reviewedAt || 0, status: record.status, requestedAt: record.createdAt }; });
    const revisions = Object.entries(ctx.state.adminPromptRevisionRequests).map(([key, request]) => { const target = ctx.getRevisionTarget(key); if (!target || !ctx.isOwnedRevisionTarget(target)) return null; return { type: target.type, title: `${target.type === "prompt" ? "프롬프트" : "댓글"} 수정 요청`, id: target.id, editPromptId: target.type === "prompt" ? target.id : "", label: target.type === "comment" ? target.text : target.title, reason: request.reason, status: "revision-requested", requestedAt: request.requestedAt }; }).filter(Boolean);
    const local = [...revisions, ...promptReports, ...commentReports];
    return uniqueReports(ctx.state.myBackendStatus === "connected" ? [...backend, ...local] : [...local, ...backend]).sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
  }
  return Object.freeze({ getPrompts, getComments, getReports });
}

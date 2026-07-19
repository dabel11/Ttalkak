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

  global.TtalkakAdminEffects = Object.freeze({
    ...(global.TtalkakAdminEffects || {}),
    canTransitionAdminTagStatus,
    getAdminTagStatusClass,
    getAdminTagStatusLabel,
    getAdminTagStatusOrder,
    normalizeAdminSearchText,
    resolveAdminTagStatus,
  });
})(window);

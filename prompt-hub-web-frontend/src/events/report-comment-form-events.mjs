export function bindReportAndCommentFormEvents(root, actions) {
  const bindForm = (selector, callback) => {
    const form = root.querySelector(selector);
    form?.addEventListener("submit", (event) => { event.preventDefault(); callback(form, new FormData(form)); });
  };
  bindForm("[data-report-form]", (form, data) => actions.submitReport(form.dataset.reportType, form.dataset.reportForm, data.get("reason")));
  bindForm("[data-admin-user-block-form]", (form, data) => actions.updateAdminUserBlock(form.dataset.adminUserBlockForm, true, form.dataset.adminUserName, data.get("reason")));
  bindForm("[data-prompt-edit-form]", (form, data) => actions.updatePrompt(form.dataset.promptEditForm, data));
  bindForm("[data-admin-revision-request-form]", (form, data) => actions.requestRevision(form.dataset.adminRevisionRequestForm, data.get("reason")));

  root.querySelectorAll("[data-toggle-comments]").forEach((button) => button.addEventListener("click", () => actions.toggleComments(button.dataset.toggleComments)));
  root.querySelectorAll("[data-show-comments]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); actions.showComments(button.dataset.showComments); }));
  root.querySelectorAll("[data-admin-toggle-comment-hidden]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); const value = String(button.dataset.adminToggleCommentHidden || ""); const separator = value.lastIndexOf(":"); actions.updateCommentHidden(value.slice(0, separator), value.slice(separator + 1) !== "unhide"); }));
  root.querySelectorAll("[data-report-comment]").forEach((button) => button.addEventListener("click", () => actions.openReportComment(button.dataset.reportComment)));
}

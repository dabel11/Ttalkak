"use strict";
  const boundRoots = new WeakSet();
  function updateAskProgress(input) {
    const form = input.closest("[data-ask-answer-form]");
    if (!form) return;
    input.removeAttribute("aria-invalid");
    const required = [...form.querySelectorAll("[data-ask-answer-input][required]")];
    const completed = required.filter((item) => item.value.trim()).length;
    const progress = form.querySelector("[data-ask-answer-progress]");
    if (progress) progress.textContent = required.length ? `필수 답변 ${completed}/${required.length}개 입력` : "답변을 입력해주세요.";
  }
  function bindDelegatedMakeEvents(root, handlers) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);
    root.addEventListener("input", (event) => { const input = event.target.closest?.("[data-ask-answer-input]"); if (input) updateAskProgress(input); handlers.input?.(event); });
    root.addEventListener("keydown", (event) => handlers.keydown?.(event));
    root.addEventListener("change", (event) => handlers.change?.(event));
    root.addEventListener("submit", (event) => handlers.submit?.(event));
    root.addEventListener("click", (event) => handlers.click?.(event));
  }
  function createDelegatedMakeHandlers(ctx) {
    const { actions, state } = ctx;
    const requireFolderAccess = () => {
      if (actions.guard() || !state.isLoggedIn) { actions.notice("로그인하면 대화를 폴더로 정리할 수 있습니다."); return false; }
      return true;
    };
    return {
      input(event) {
        const recentSearch = event.target.closest?.("[data-recent-thread-search]");
        if (recentSearch) {
          const query = String(recentSearch.value || "").trim().toLocaleLowerCase();
          const panel = recentSearch.closest(".make-side-panel");
          panel?.querySelectorAll(".recent-thread").forEach((thread) => {
            thread.hidden = Boolean(query) && !String(thread.textContent || "").toLocaleLowerCase().includes(query);
          });
          panel?.querySelectorAll(".recent-thread-group").forEach((heading) => {
            let next = heading.nextElementSibling;
            let hasVisible = false;
            while (next && !next.classList.contains("recent-thread-group")) {
              if (next.classList.contains("recent-thread") && !next.hidden) hasVisible = true;
              next = next.nextElementSibling;
            }
            heading.hidden = !hasVisible;
          });
          return;
        }
        const textarea = event.target.closest?.("[data-autosize-textarea]");
        if (!textarea) return;
        actions.setDraft(textarea.value);
        actions.autosize(textarea);
      },
      keydown(event) {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        const form = event.target.closest?.("[data-composer], [data-edit-message-form]");
        if (!form) return;
        event.preventDefault();
        actions.submitComposer(form);
      },
      submit(event) {
        const form = event.target.closest?.("form");
        if (!form) return;
        const data = () => new FormData(form);
        if (form.matches("[data-composer]")) { event.preventDefault(); actions.submitPrompt(form); }
        else if (form.matches("[data-ask-answer-form]")) { event.preventDefault(); actions.submitAnswers(form); }
        else if (form.matches("[data-edit-message-form]")) { event.preventDefault(); actions.resend(form.dataset.editMessageForm, data().get("message")); }
        else if (form.matches("[data-folder-create-form]")) { event.preventDefault(); actions.createFolder(data().get("folderName")); }
        else if (form.matches("[data-thread-folder-create-form]")) { event.preventDefault(); actions.createFolderAndMove(form.dataset.threadFolderCreateForm, data().get("folderName")); }
        else if (form.matches("[data-folder-edit-form]")) { event.preventDefault(); actions.renameFolder(form.dataset.folderEditForm, data().get("folderName")); }
      },
      change(event) {
        const select = event.target.closest?.("[data-thread-folder]");
        if (!select) return;
        if (!requireFolderAccess()) { actions.render(); return; }
        state.openThreadMenuId = null;
        actions.moveThread(select.dataset.threadFolder, select.value);
      },
      click(event) {
        const closeFolderMenu = state.openFolderMenuId && !event.target.closest?.("[data-folder-item]");
        const closeThreadMenu = state.openThreadMenuId && !event.target.closest?.("[data-thread-item]");
        if (closeFolderMenu) state.openFolderMenuId = null;
        if (closeThreadMenu) { state.openThreadMenuId = null; state.creatingThreadFolderId = null; }
        const target = event.target.closest?.("[data-template], [data-toggle-templates], [data-cancel-make-request], [data-refine-unchanged], [data-refresh-concurrent], [data-retry-concurrent], [data-retry-message], [data-make-login], [data-copy-message], [data-edit-message], [data-split-thread-from], [data-cancel-message-edit], [data-save-message], [data-share-message], [data-execute-message], [data-new-chat], [data-thread-menu], [data-open-thread], [data-delete-thread], [data-show-folder-form], [data-cancel-folder-create], [data-open-folder], [data-folder-menu], [data-edit-folder], [data-cancel-folder-edit], [data-delete-folder], [data-start-thread-folder-create], [data-cancel-thread-folder-create]");
        if (!target) { if (closeFolderMenu || closeThreadMenu) actions.render(); return; }
        if (closeFolderMenu || closeThreadMenu) actions.render();
        if (target.matches("[data-template]")) actions.applyTemplate(target.dataset.template);
        else if (target.matches("[data-toggle-templates]")) actions.toggleTemplates(target);
        else if (target.matches("[data-cancel-make-request]")) actions.cancelRequest();
        else if (target.matches("[data-refine-unchanged]")) actions.refineUnchanged(target.dataset.refineUnchanged);
        else if (target.matches("[data-refresh-concurrent]")) { const message = state.messages.find((item) => item.id === target.dataset.refreshConcurrent && item.role === "user"); if (message) actions.refreshConcurrent?.(message); }
        else if (target.matches("[data-retry-concurrent]")) { const message = state.messages.find((item) => item.id === target.dataset.retryConcurrent && item.role === "user"); if (message) { actions.reportRetry?.(message); actions.retryConcurrent?.(message); } }
        else if (target.matches("[data-retry-message]")) { const message = state.messages.find((item) => item.id === target.dataset.retryMessage && item.role === "user"); if (message) { actions.reportRetry?.(message); actions.resend(message.id, message.content); } }
        else if (target.matches("[data-make-login]")) actions.openLogin();
        else if (target.matches("[data-copy-message]")) actions.copy(target.dataset.copyMessage);
        else if (target.matches("[data-edit-message]")) { actions.setEditing(target.dataset.editMessage); actions.setPendingScroll(target.dataset.editMessage); actions.render(); }
        else if (target.matches("[data-split-thread-from]")) actions.splitThread(target.dataset.splitThreadFrom);
        else if (target.matches("[data-cancel-message-edit]")) { const form = target.closest("[data-edit-message-form]"); actions.setPendingScroll(form?.dataset.editMessageForm || state.editingMessageId); actions.setEditing(); actions.render(); }
        else if (target.matches("[data-save-message]")) actions.save(target.dataset.saveMessage);
        else if (target.matches("[data-share-message]")) actions.share(target.dataset.shareMessage);
        else if (target.matches("[data-execute-message]")) actions.execute(target.dataset.executeMessage);
        else if (target.matches("[data-new-chat]")) actions.newChat();
        else if (target.matches("[data-thread-menu]")) { event.preventDefault(); event.stopPropagation(); const id = target.dataset.threadMenu; state.openThreadMenuId = state.openThreadMenuId === id ? null : id; if (state.openThreadMenuId !== id) state.creatingThreadFolderId = null; actions.render(); }
        else if (target.matches("[data-open-thread]")) { state.openThreadMenuId = null; actions.openThread(target.dataset.openThread); }
        else if (target.matches("[data-delete-thread]")) { event.preventDefault(); event.stopPropagation(); state.openThreadMenuId = null; actions.confirm({ type: "delete-thread", targetId: target.dataset.deleteThread, title: "대화 삭제", message: "이 대화를 최근 대화 목록에서 삭제할까요?", confirmLabel: "삭제", danger: true }); }
        else if (target.matches("[data-show-folder-form]")) { if (!requireFolderAccess()) return; state.creatingFolder = true; actions.render(); actions.focusLater("[data-folder-create-form] input"); }
        else if (target.matches("[data-cancel-folder-create]")) { state.creatingFolder = false; actions.render(); }
        else if (target.matches("[data-open-folder]")) { state.activeFolderId = target.dataset.openFolder; state.openFolderMenuId = null; actions.render(); }
        else if (target.matches("[data-folder-menu]")) { event.preventDefault(); event.stopPropagation(); if (!requireFolderAccess()) return; const id = target.dataset.folderMenu; state.openFolderMenuId = state.openFolderMenuId === id ? null : id; actions.render(); }
        else if (target.matches("[data-edit-folder]")) { event.preventDefault(); event.stopPropagation(); state.editingFolderId = target.dataset.editFolder; state.openFolderMenuId = null; actions.render(); }
        else if (target.matches("[data-cancel-folder-edit]")) { state.editingFolderId = null; actions.render(); }
        else if (target.matches("[data-delete-folder]")) { event.preventDefault(); event.stopPropagation(); state.openFolderMenuId = null; actions.confirm({ type: "delete-folder", targetId: target.dataset.deleteFolder, title: "폴더 삭제", message: "폴더를 삭제해도 대화는 미분류로 이동합니다. 삭제할까요?", confirmLabel: "삭제", danger: true }); }
        else if (target.matches("[data-start-thread-folder-create]")) { event.preventDefault(); event.stopPropagation(); if (!requireFolderAccess()) return; if (actions.folderCount() >= ctx.maxFolders) { actions.notice(`폴더는 최대 ${ctx.maxFolders}개까지 만들 수 있습니다.`); return; } state.creatingThreadFolderId = target.dataset.startThreadFolderCreate; actions.render(); actions.focusLater("[data-thread-folder-create-form] input"); }
        else if (target.matches("[data-cancel-thread-folder-create]")) { event.preventDefault(); event.stopPropagation(); state.creatingThreadFolderId = null; actions.render(); }
      },
    };
  }
export { bindDelegatedMakeEvents, createDelegatedMakeHandlers, updateAskProgress };

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
  function updateRecentThreadSearch(input) {
    const query = String(input?.value || "").trim().toLocaleLowerCase();
    const panel = input?.closest?.(".make-side-panel");
    if (!panel) return 0;
    const threads = [...panel.querySelectorAll(".recent-thread")];
    let visibleCount = 0;
    threads.forEach((thread) => {
      thread.hidden = Boolean(query) && !String(thread.textContent || "").toLocaleLowerCase().includes(query);
      if (!thread.hidden) visibleCount += 1;
    });
    panel.querySelectorAll(".recent-thread-group").forEach((heading) => {
      let next = heading.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains("recent-thread-group")) {
        if (next.classList.contains("recent-thread") && !next.hidden) hasVisible = true;
        next = next.nextElementSibling;
      }
      heading.hidden = !hasVisible;
    });
    panel.querySelectorAll("[data-clear-recent-thread-search]").forEach((button) => { button.hidden = !query; });
    const status = panel.querySelector("[data-recent-thread-search-status]");
    if (status) {
      status.hidden = !query;
      status.textContent = query ? `검색 결과 ${visibleCount}개` : "";
    }
    const empty = panel.querySelector("[data-recent-thread-search-empty]");
    if (empty) empty.hidden = !query || visibleCount > 0;
    return visibleCount;
  }
  function clearRecentThreadSearch(target) {
    const panel = target?.closest?.(".make-side-panel");
    const input = panel?.querySelector?.("[data-recent-thread-search]");
    if (!input) return;
    input.value = "";
    updateRecentThreadSearch(input);
    input.focus();
  }
  function getMakeDrawerBackgroundTargets(page) {
    const mainArea = page?.closest?.(".main-area");
    const appShell = page?.closest?.(".app-shell");
    return [
      appShell?.querySelector?.(":scope > .sidebar"),
      mainArea?.querySelector?.(":scope > .topbar"),
      ...[...(page?.children || [])].filter((element) => !element.matches?.(".make-side-panel, .make-drawer-backdrop")),
    ].filter(Boolean);
  }
  function setMakeDrawerA11yState(page, open) {
    const panel = page?.querySelector?.(".make-side-panel");
    if (!page || !panel) return;
    if (open) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
    } else {
      panel.removeAttribute("role");
      panel.removeAttribute("aria-modal");
    }
    getMakeDrawerBackgroundTargets(page).forEach((element) => element.toggleAttribute("inert", open));
  }
  function getMakeDrawerFocusable(panel) {
    return [...(panel?.querySelectorAll?.("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex='-1'])") || [])]
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  }
  function trapMakeDrawerFocus(event, page) {
    if (event.key !== "Tab" || !page?.classList.contains("drawer-open")) return false;
    const panel = page.querySelector(".make-side-panel");
    const focusable = getMakeDrawerFocusable(panel);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = panel.ownerDocument.activeElement;
    if (!panel.contains(active) || (!event.shiftKey && active === last) || (event.shiftKey && active === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return true;
    }
    return false;
  }
  function closeMakeDrawer(root, { restoreFocus = false } = {}) {
    const page = root.querySelector?.(".make-page");
    if (!page) return false;
    const wasOpen = page.classList.contains("drawer-open");
    page.classList.remove("drawer-open");
    setMakeDrawerA11yState(page, false);
    const toggle = page.querySelector("[data-toggle-make-drawer]");
    toggle?.setAttribute("aria-expanded", "false");
    if (restoreFocus && wasOpen) toggle?.focus();
    return wasOpen;
  }
  function bindDelegatedMakeEvents(root, handlers) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);
    root.addEventListener("input", (event) => { const input = event.target.closest?.("[data-ask-answer-input]"); if (input) updateAskProgress(input); handlers.input?.(event); });
    root.addEventListener("keydown", (event) => handlers.keydown?.(event));
    root.addEventListener("change", (event) => handlers.change?.(event));
    root.addEventListener("submit", (event) => handlers.submit?.(event));
    root.addEventListener("click", (event) => handlers.click?.(event));
    const rootWindow = root.defaultView || root.ownerDocument?.defaultView;
    rootWindow?.matchMedia?.("(max-width: 760px)")?.addEventListener?.("change", (event) => {
      if (!event.matches) closeMakeDrawer(root);
      handlers.viewportChange?.(event.matches);
    });
  }
  function createDelegatedMakeHandlers(ctx) {
    const { actions, state } = ctx;
    const requireFolderAccess = () => {
      if (actions.guard() || !state.isLoggedIn) { actions.notice("로그인하면 대화를 폴더로 정리할 수 있습니다."); return false; }
      return true;
    };
    return {
      viewportChange() {
        state.mobileTemplateExpanded = false;
        actions.render();
      },
      input(event) {
        const recentSearch = event.target.closest?.("[data-recent-thread-search]");
        if (recentSearch) {
          updateRecentThreadSearch(recentSearch);
          return;
        }
        const textarea = event.target.closest?.("[data-autosize-textarea]");
        if (!textarea) return;
        actions.setDraft(textarea.value);
        actions.autosize(textarea);
      },
      keydown(event) {
        const makePage = event.target.closest?.(".make-page") || (ctx.root || event.currentTarget).querySelector?.(".make-page");
        if (trapMakeDrawerFocus(event, makePage)) return;
        if (event.key === "Escape" && closeMakeDrawer(ctx.root || event.currentTarget, { restoreFocus: true })) {
          event.preventDefault();
          return;
        }
        const recentSearch = event.target.closest?.("[data-recent-thread-search]");
        if (recentSearch && event.key === "Escape" && recentSearch.value) {
          event.preventDefault();
          clearRecentThreadSearch(recentSearch);
          return;
        }
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
        const drawerControl = event.target.closest?.("button");
        if (drawerControl?.dataset && "toggleMakeDrawer" in drawerControl.dataset) {
          const page = drawerControl.closest?.(".make-page");
          const willOpen = !page?.classList.contains("drawer-open");
          page?.classList.toggle("drawer-open", willOpen);
          setMakeDrawerA11yState(page, willOpen);
          drawerControl.setAttribute("aria-expanded", String(willOpen));
          if (willOpen) page?.querySelector(".make-drawer-close")?.focus?.({ preventScroll: true });
          return;
        }
        if (drawerControl?.dataset && "closeMakeDrawer" in drawerControl.dataset) {
          closeMakeDrawer(ctx.root || event.currentTarget, { restoreFocus: true });
          return;
        }
        const closeFolderMenu = state.openFolderMenuId && !event.target.closest?.("[data-folder-item]");
        const closeThreadMenu = state.openThreadMenuId && !event.target.closest?.("[data-thread-item]");
        if (closeFolderMenu) state.openFolderMenuId = null;
        if (closeThreadMenu) { state.openThreadMenuId = null; state.creatingThreadFolderId = null; }
        const target = event.target.closest?.("button");
        if (!target) { if (closeFolderMenu || closeThreadMenu) actions.render(); return; }
        if (closeFolderMenu || closeThreadMenu) actions.render();
        const data = target.dataset;
        const has = (name) => name in data;
        if (has("template")) actions.applyTemplate(data.template);
        else if (has("toggleTemplates")) actions.toggleTemplates(target);
        else if (has("cancelMakeRequest")) actions.cancelRequest();
        else if (has("refineUnchanged")) actions.refineUnchanged(data.refineUnchanged);
        else if (has("refreshConcurrent")) { const message = state.messages.find((item) => item.id === data.refreshConcurrent && item.role === "user"); if (message) actions.refreshConcurrent?.(message); }
        else if (has("retryConcurrent")) { const message = state.messages.find((item) => item.id === data.retryConcurrent && item.role === "user"); if (message) { actions.reportRetry?.(message); actions.retryConcurrent?.(message); } }
        else if (has("concurrencyNewChat")) { const message = state.messages.find((item) => item.id === data.concurrencyNewChat && item.role === "user"); if (message) actions.newChatFromConflict?.(message); }
        else if (has("clearRecentThreadSearch")) clearRecentThreadSearch(target);
        else if (has("retryMessage")) { const message = state.messages.find((item) => item.id === data.retryMessage && item.role === "user"); if (message) { actions.reportRetry?.(message); actions.resend(message.id, message.content); } }
        else if (has("makeLogin")) actions.openLogin();
        else if (has("copyMessage")) actions.copy(data.copyMessage);
        else if (has("editMessage")) { actions.setEditing(data.editMessage); actions.setPendingScroll(data.editMessage); actions.render(); }
        else if (has("splitThreadFrom")) actions.splitThread(data.splitThreadFrom);
        else if (has("cancelMessageEdit")) { const form = target.closest("[data-edit-message-form]"); actions.setPendingScroll(form?.dataset.editMessageForm || state.editingMessageId); actions.setEditing(); actions.render(); }
        else if (has("saveMessage")) actions.save(data.saveMessage);
        else if (has("shareMessage")) actions.share(data.shareMessage);
        else if (has("executeMessage")) actions.execute(data.executeMessage);
        else if (has("newChat")) actions.newChat();
        else if (has("threadMenu")) { event.preventDefault(); event.stopPropagation(); const id = data.threadMenu; state.openThreadMenuId = state.openThreadMenuId === id ? null : id; if (state.openThreadMenuId !== id) state.creatingThreadFolderId = null; actions.render(); }
        else if (has("openThread")) { state.openThreadMenuId = null; actions.openThread(data.openThread); }
        else if (has("deleteThread")) { event.preventDefault(); event.stopPropagation(); state.openThreadMenuId = null; actions.confirm({ type: "delete-thread", targetId: data.deleteThread, title: "대화 삭제", message: "이 대화를 최근 대화 목록에서 삭제할까요?", confirmLabel: "삭제", danger: true }); }
        else if (has("showFolderForm")) { if (!requireFolderAccess()) return; state.creatingFolder = true; actions.render(); actions.focusLater("[data-folder-create-form] input"); }
        else if (has("cancelFolderCreate")) { state.creatingFolder = false; actions.render(); }
        else if (has("openFolder")) { state.activeFolderId = data.openFolder; state.openFolderMenuId = null; actions.render(); }
        else if (has("folderMenu")) { event.preventDefault(); event.stopPropagation(); if (!requireFolderAccess()) return; const id = data.folderMenu; state.openFolderMenuId = state.openFolderMenuId === id ? null : id; actions.render(); }
        else if (has("editFolder")) { event.preventDefault(); event.stopPropagation(); state.editingFolderId = data.editFolder; state.openFolderMenuId = null; actions.render(); }
        else if (has("cancelFolderEdit")) { state.editingFolderId = null; actions.render(); }
        else if (has("deleteFolder")) { event.preventDefault(); event.stopPropagation(); state.openFolderMenuId = null; actions.confirm({ type: "delete-folder", targetId: data.deleteFolder, title: "폴더 삭제", message: "폴더를 삭제해도 대화는 미분류로 이동합니다. 삭제할까요?", confirmLabel: "삭제", danger: true }); }
        else if (has("startThreadFolderCreate")) { event.preventDefault(); event.stopPropagation(); if (!requireFolderAccess()) return; if (actions.folderCount() >= ctx.maxFolders) { actions.notice(`폴더는 최대 ${ctx.maxFolders}개까지 만들 수 있습니다.`); return; } state.creatingThreadFolderId = data.startThreadFolderCreate; actions.render(); actions.focusLater("[data-thread-folder-create-form] input"); }
        else if (has("cancelThreadFolderCreate")) { event.preventDefault(); event.stopPropagation(); state.creatingThreadFolderId = null; actions.render(); }
      },
    };
  }
export { bindDelegatedMakeEvents, clearRecentThreadSearch, createDelegatedMakeHandlers, updateAskProgress, updateRecentThreadSearch };

  "use strict";

  function createModalController(ctx) {
    let returnFocusTarget = null;

    function restoreFocus() {
      const target = returnFocusTarget;
      returnFocusTarget = null;
      globalThis.setTimeout(() => {
        const restoredFolderTrigger = target?.folderId && typeof ctx.root.querySelectorAll === "function"
          ? [...ctx.root.querySelectorAll("[data-folder-item]")].find((item) => item.dataset.folderItem === target.folderId)?.querySelector("[data-folder-menu]")
          : null;
        const focusTarget = restoredFolderTrigger || target?.element;
        if (focusTarget?.isConnected && typeof focusTarget.focus === "function") focusTarget.focus();
      }, 0);
    }

    function closeTop() {
      const preserve = Boolean(ctx.state.executeMessageId || ctx.state.executePromptId);
      if (!ctx.closeState(ctx.state)) return false;
      preserve ? ctx.renderPreservingScroll() : ctx.render();
      restoreFocus();
      return true;
    }

    function focusActive() {
      globalThis.setTimeout(() => {
        if (typeof ctx.root.querySelectorAll !== "function") return;
        const modals = ctx.root.querySelectorAll(".modal");
        const modal = modals[modals.length - 1];
        if (modal?.classList.contains("prompt-detail-modal")) return;
        const preferred = modal?.querySelector("[data-confirm-action]");
        (preferred || modal?.querySelector("input, textarea, button, [href], [tabindex]:not([tabindex='-1'])"))?.focus();
      }, 0);
    }

    function openConfirm(action) {
      const activeElement = ctx.root.activeElement;
      returnFocusTarget = {
        element: activeElement,
        folderId: activeElement?.closest?.("[data-folder-item]")?.dataset.folderItem || "",
      };
      ctx.state.confirmAction = action;
      ctx.render();
      focusActive();
    }

    async function runConfirmed(handlers, useAlternative = false) {
      const action = ctx.state.confirmAction;
      if (!action) return false;
      ctx.state.confirmAction = null;
      const handler = handlers[useAlternative ? action.alternativeType : action.type];
      if (!handler) {
        ctx.render();
        restoreFocus();
        return false;
      }
      const result = await handler(action);
      if (result !== false) {
        ctx.render();
        restoreFocus();
      }
      return true;
    }

    return Object.freeze({ closeTop, focusActive, openConfirm, runConfirmed });
  }

export { createModalController };

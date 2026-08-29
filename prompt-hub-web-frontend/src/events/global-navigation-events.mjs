const compactViewportCleanups = new WeakMap();

export function bindGlobalMenuAndRouteEvents(root, { state, render, closeTopModal, navigateTo }) {
  const topbarMenus = [...root.querySelectorAll(".topbar-settings, .topbar-account, .backend-status-menu")];
  const compactHeader = root.querySelector(".topbar-primary-actions");
  const compactToggle = compactHeader?.querySelector(".topbar-mobile-toggle");
  const closeCompactHeader = ({ restoreFocus = false } = {}) => {
    if (!compactHeader?.classList.contains("compact-open")) return false;
    compactHeader.classList.remove("compact-open");
    compactToggle?.setAttribute("aria-expanded", "false");
    if (restoreFocus) compactToggle?.focus();
    return true;
  };
  const closeTopbarMenus = ({ restoreFocus = false } = {}) => {
    const openMenus = topbarMenus.filter((menu) => menu.open);
    openMenus.forEach((menu) => { menu.open = false; });
    if (restoreFocus) openMenus.at(-1)?.querySelector("summary")?.focus();
    return openMenus.length > 0;
  };
  compactViewportCleanups.get(root)?.();
  const compactViewport = root.defaultView?.matchMedia?.("(max-width: 760px)");
  const resetCompactMenusAtDesktop = (event) => {
    if (event.matches) return;
    closeTopbarMenus();
    closeCompactHeader();
  };
  compactViewport?.addEventListener("change", resetCompactMenusAtDesktop);
  compactViewportCleanups.set(root, () => compactViewport?.removeEventListener("change", resetCompactMenusAtDesktop));
  topbarMenus.forEach((menu) => menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    topbarMenus.forEach((otherMenu) => { if (otherMenu !== menu) otherMenu.open = false; });
  }));
  compactToggle?.addEventListener("click", () => {
    const willOpen = !compactHeader.classList.contains("compact-open");
    closeTopbarMenus();
    compactHeader.classList.toggle("compact-open", willOpen);
    compactToggle.setAttribute("aria-expanded", String(willOpen));
  });
  root.querySelector("#app")?.addEventListener("click", (event) => {
    if (!event.target.closest(".topbar-primary-actions")) {
      closeTopbarMenus();
      closeCompactHeader();
    } else if (!event.target.closest(".topbar-settings, .topbar-account, .backend-status-menu, .topbar-mobile-toggle")) {
      closeTopbarMenus();
    }
    if (!state.openPromptCardMenuId || event.target.closest(".prompt-card-menu-wrap")) return;
    state.openPromptCardMenuId = null;
    render();
  });
  root.onkeydown = (event) => {
    if (event.key !== "Escape") return;
    if (closeTopbarMenus({ restoreFocus: true })) {
      event.preventDefault();
      return;
    }
    if (closeCompactHeader({ restoreFocus: true })) {
      event.preventDefault();
      return;
    }
    closeTopModal();
  };
  root.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.route)));
}

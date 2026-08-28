export function bindGlobalMenuAndRouteEvents(root, { state, render, closeTopModal, navigateTo }) {
  const topbarMenus = [...root.querySelectorAll(".topbar-settings, .topbar-account, .backend-status-menu")];
  const closeTopbarMenus = ({ restoreFocus = false } = {}) => {
    const openMenus = topbarMenus.filter((menu) => menu.open);
    openMenus.forEach((menu) => { menu.open = false; });
    if (restoreFocus) openMenus.at(-1)?.querySelector("summary")?.focus();
    return openMenus.length > 0;
  };
  topbarMenus.forEach((menu) => menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    topbarMenus.forEach((otherMenu) => { if (otherMenu !== menu) otherMenu.open = false; });
  }));
  root.querySelector("#app")?.addEventListener("click", (event) => {
    if (!event.target.closest(".topbar-settings, .topbar-account, .backend-status-menu")) closeTopbarMenus();
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
    closeTopModal();
  };
  root.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.route)));
}

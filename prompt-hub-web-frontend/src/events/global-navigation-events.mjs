export function bindGlobalMenuAndRouteEvents(root, { state, render, closeTopModal, navigateTo }) {
  root.querySelector("#app")?.addEventListener("click", (event) => {
    if (!state.openPromptCardMenuId || event.target.closest(".prompt-card-menu-wrap")) return;
    state.openPromptCardMenuId = null;
    render();
  });
  root.onkeydown = (event) => { if (event.key === "Escape") closeTopModal(); };
  root.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.route)));
}

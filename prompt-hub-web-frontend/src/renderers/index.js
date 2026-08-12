// @ts-check
import { renderers as promptCardRenderers } from "./prompt-card.mjs";
import { renderers as modalRenderers } from "./modal-renderers.mjs";
import { renderers as promptModalRenderers } from "./prompt-modals.mjs";
import { renderers as authModalRenderers } from "./auth-modal.mjs";
import { renderers as adminRevisionRenderers } from "./admin-revision-modal.mjs";
import { renderers as shellNavigationRenderers } from "./shell-navigation.mjs";
import { renderers as homePageRenderers } from "./pages/home-page.mjs";
import { renderers as savedPageRenderers } from "./pages/saved-page.mjs";
import { renderers as appShellRenderers } from "./app-shell.mjs";
import { lazyRouteRenderers } from "./lazy-route-renderers.js";

export const renderers = Object.freeze({
  ...promptCardRenderers, ...modalRenderers, ...promptModalRenderers, ...authModalRenderers,
  ...adminRevisionRenderers, ...shellNavigationRenderers, ...homePageRenderers,
  ...savedPageRenderers, ...appShellRenderers, ...lazyRouteRenderers,
});

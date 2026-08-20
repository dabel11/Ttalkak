// @ts-check
import { renderers as promptCardRenderers } from "./prompt-card.mjs";
import { renderers as shellNavigationRenderers } from "./shell-navigation.mjs";
import { renderers as homePageRenderers } from "./pages/home-page.mjs";
import { renderers as appShellRenderers } from "./app-shell.mjs";
import { lazyRouteRenderers } from "./lazy-route-renderers.js";

export const renderers = Object.freeze({
  ...promptCardRenderers, ...shellNavigationRenderers, ...homePageRenderers,
  ...appShellRenderers, ...lazyRouteRenderers,
});

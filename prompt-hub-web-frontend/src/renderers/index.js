// @ts-check
import "./prompt-card.js";
import "./modal-renderers.js";
import "./prompt-modals.js";
import "./auth-modal.js";
import "./admin-revision-modal.js";
import "./shell-navigation.js";
import "./pages/home-page.js";
import "./pages/saved-page.js";
import "./app-shell.js";
import { lazyRouteRenderers } from "./lazy-route-renderers.js";

export const renderers = Object.freeze({ ...(window.TtalkakRenderers || {}), ...lazyRouteRenderers });

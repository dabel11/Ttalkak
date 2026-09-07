import * as events from "./admin-events.mjs";
import * as controller from "./admin-controller.mjs";
import * as view from "./admin-view.mjs";
import { renderers as panels } from "../renderers/admin-panels.mjs";
import { renderers as page } from "../renderers/pages/admin-page.mjs";
import { renderers as revisionModal } from "../renderers/admin-revision-modal.mjs";

export const renderers = Object.freeze({ ...panels, ...page, ...revisionModal });
export { controller, events, view };

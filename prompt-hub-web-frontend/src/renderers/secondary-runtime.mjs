import { createShareController, getShareTagSuggestions } from "../share/share-controller.mjs";
import { bindShareEvents } from "../share/share-events.mjs";
import { renderers as share } from "./pages/share-page.mjs";
import { renderers as auth } from "./auth-modal.mjs";
import { renderers as modal } from "./modal-renderers.mjs";
import { renderers as prompt } from "./prompt-modals.mjs";
import { renderers as saved } from "./pages/saved-page.mjs";

export const renderers = Object.freeze({ ...auth, ...modal, ...prompt, ...saved, ...share });
export const controller = Object.freeze({ createShareController, getShareTagSuggestions });
export const events = Object.freeze({ bindShareEvents });

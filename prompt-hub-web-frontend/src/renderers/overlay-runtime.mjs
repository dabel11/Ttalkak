import { renderers as auth } from "./auth-modal.mjs";
import { renderers as modal } from "./modal-renderers.mjs";
import { renderers as prompt } from "./prompt-modals.mjs";

export const renderers = Object.freeze({ ...auth, ...modal, ...prompt });

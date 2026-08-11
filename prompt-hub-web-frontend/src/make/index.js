// @ts-check
import "../utils/make-preview.js";
import "../utils/make-message-model.js";
import "./make-state.js";
import "./make-focus.js";
import "./make-persistence.js";

let runtimePromise;
export function loadMakeRuntime() {
  runtimePromise ||= Promise.all([
    // @ts-expect-error Legacy global script is intentionally loaded for its side effect.
    import("./make-controller.js"),
    // @ts-expect-error Legacy global script is intentionally loaded for its side effect.
    import("./make-events.js"),
    import("./make-sync-workflows.js"),
    import("./make-folder-workflows.js"),
    import("./make-execution-workflows.js"),
    import("./make-recent-workflows.js"),
  ]).then(() => import("./make-workflows.js"))
    .then(() => Object.freeze({ controller: window.TtalkakMakeController, events: window.TtalkakMakeEvents, workflows: window.TtalkakMakeWorkflows }));
  return runtimePromise;
}

export const make = Object.freeze({ preview: window.TtalkakMakePreview, messageModel: window.TtalkakMakeMessageModel, state: window.TtalkakMakeState, focus: window.TtalkakMakeFocus, persistence: window.TtalkakMakePersistence, loadRuntime: loadMakeRuntime });

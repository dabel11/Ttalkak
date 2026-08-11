// @ts-check
import "./admin-selectors.js";

let runtimePromise;
export function loadAdminRuntime() {
  runtimePromise ||= Promise.all([
    import("./admin-events.js"),
    import("./admin-controller.js"),
    import("./admin-view.js"),
  ]).then(() => Object.freeze({ events: window.TtalkakAdminEvents, controller: window.TtalkakAdminController, view: window.TtalkakAdminView }));
  return runtimePromise;
}

export const admin = Object.freeze({ selectors: window.TtalkakAdminSelectors, loadRuntime: loadAdminRuntime });

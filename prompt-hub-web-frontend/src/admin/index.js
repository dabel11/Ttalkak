// @ts-check
import "./admin-selectors.js";

let runtimePromise;
export function loadAdminRuntime() {
  runtimePromise ||= import("./admin-runtime.mjs")
    .then(() => Object.freeze({ events: window.TtalkakAdminEvents, controller: window.TtalkakAdminController, view: window.TtalkakAdminView }));
  return runtimePromise;
}

export const admin = Object.freeze({ selectors: window.TtalkakAdminSelectors, loadRuntime: loadAdminRuntime });

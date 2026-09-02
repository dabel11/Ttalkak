// @ts-check
import * as selectors from "./admin-selectors.mjs";

let runtimePromise;
export function loadAdminRuntime() {
  runtimePromise ||= import("./admin-runtime.mjs")
    .then(({ events, controller, view }) => Object.freeze({ events, controller, view }));
  return runtimePromise;
}

export const admin = Object.freeze({ selectors, loadRuntime: loadAdminRuntime });

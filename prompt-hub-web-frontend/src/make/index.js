// @ts-check
import "../utils/make-preview.js";
import "../utils/make-message-model.js";
import { makeState } from "./make-state.mjs";
import "./make-focus.js";
import "./make-persistence.js";
import { makeThreadPolicy } from "./make-thread-policy.mjs";

/** @type {Promise<void> | undefined} */
let stylePromise;
function loadMakeStyles() {
  if (typeof document === "undefined") return Promise.resolve();
  /** @type {HTMLLinkElement | null} */
  const existing = document.querySelector('link[data-make-styles]');
  if (existing?.dataset.loaded === "true" || existing?.sheet) return Promise.resolve();
  if (stylePromise) return stylePromise;
  const link = existing || document.createElement("link");
  link.rel = "stylesheet";
  link.href = document.documentElement.dataset.makeStyleHref || "./src/styles/make.css";
  link.dataset.makeStyles = "true";
  stylePromise = new Promise((resolve, reject) => {
    link.addEventListener("load", () => {
      link.dataset.loaded = "true";
      resolve(undefined);
    }, { once: true });
    link.addEventListener("error", () => reject(new Error("Make styles failed to load.")), { once: true });
  });
  if (!existing) document.head.append(link);
  return stylePromise;
}

let runtimePromise;
export function loadMakeRuntime() {
  runtimePromise ||= Promise.all([loadMakeStyles(), import("./make-runtime.mjs")])
    .then(([, runtime]) => Object.freeze({
      controller: runtime.controller,
      events: runtime.events,
      workflows: runtime.workflows,
      pageAdapter: runtime.pageAdapter,
    }));
  return runtimePromise;
}

export const make = Object.freeze({ preview: window.TtalkakMakePreview, messageModel: window.TtalkakMakeMessageModel, state: makeState, focus: window.TtalkakMakeFocus, persistence: window.TtalkakMakePersistence, threadPolicy: makeThreadPolicy, loadRuntime: loadMakeRuntime });

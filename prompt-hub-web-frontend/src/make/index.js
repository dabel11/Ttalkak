// @ts-check
import { makePreviewUtils as preview } from "../utils/make-preview.mjs";
import messageModel from "../utils/make-message-model.mjs";
import { makeState } from "./make-state.mjs";
import * as focus from "./make-focus.mjs";
import * as persistence from "./make-persistence.mjs";
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

export const make = Object.freeze({ preview, messageModel, state: makeState, focus, persistence, threadPolicy: makeThreadPolicy, loadRuntime: loadMakeRuntime });

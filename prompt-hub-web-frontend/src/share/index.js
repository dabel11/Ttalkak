// @ts-check
let runtimePromise;
export function loadShareRuntime() {
  runtimePromise ||= import("../renderers/secondary-runtime.mjs")
    .then(({ controller, events }) => Object.freeze({ controller, events }));
  return runtimePromise;
}

export const share = Object.freeze({ loadRuntime: loadShareRuntime });

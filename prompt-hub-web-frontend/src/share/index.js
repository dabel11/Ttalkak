// @ts-check
let runtimePromise;
export function loadShareRuntime() {
  runtimePromise ||= import("./share-runtime.mjs")
    .then(() => Object.freeze({ controller: window.TtalkakShareController, events: window.TtalkakShareEvents }));
  return runtimePromise;
}

export const share = Object.freeze({ loadRuntime: loadShareRuntime });

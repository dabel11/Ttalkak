// @ts-check
let runtimePromise;
export function loadShareRuntime() {
  runtimePromise ||= Promise.all([import("./share-controller.js"), import("./share-events.js")])
    .then(() => Object.freeze({ controller: window.TtalkakShareController, events: window.TtalkakShareEvents }));
  return runtimePromise;
}

export const share = Object.freeze({ loadRuntime: loadShareRuntime });

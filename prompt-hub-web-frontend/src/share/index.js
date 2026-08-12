// @ts-check
let runtimePromise;
export function loadShareRuntime() {
  runtimePromise ||= import("./share-runtime.mjs")
    .then(({ controller, events }) => Object.freeze({ controller, events }));
  return runtimePromise;
}

export const share = Object.freeze({ loadRuntime: loadShareRuntime });

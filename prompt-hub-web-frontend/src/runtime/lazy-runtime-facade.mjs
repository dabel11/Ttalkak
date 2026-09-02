export function createLazyRuntimeFacade({ name, load, initialize, onLoading = null, onReady = null, onError = null }) {
  let modules = null;
  let promise = null;

  async function ensure() {
    if (modules) return true;
    onLoading?.();
    promise ||= Promise.resolve(load())
      .then(async (runtime) => {
        modules = Object.freeze(await initialize(runtime));
        onReady?.(modules);
        return true;
      })
      .catch((error) => {
        promise = null;
        onError?.(error);
        return false;
      });
    return promise;
  }

  function get(namespace) {
    return modules?.[namespace] || null;
  }

  function call(namespace, method, fallback, args, { defer = false } = {}) {
    const target = get(namespace);
    if (typeof target?.[method] === "function") return target[method](...args);
    if (defer) ensure().then((loaded) => { if (loaded) get(namespace)?.[method]?.(...args); });
    return fallback;
  }

  function requireMethod(namespace, method) {
    const candidate = get(namespace)?.[method];
    if (typeof candidate !== "function") throw new Error(`${name} runtime method is unavailable: ${namespace}.${method}`);
    return candidate;
  }

  return Object.freeze({ ensure, get, call, requireMethod, isReady: () => Boolean(modules) });
}

export function createMethodFacade(runtime, namespace, definitions, options = {}) {
  return Object.freeze(Object.fromEntries(Object.entries(definitions).map(([method, fallback]) => [
    method,
    (...args) => runtime.call(namespace, method, typeof fallback === "function" ? fallback(...args) : fallback, args, options),
  ])));
}

export function createDeferredMethodFacade({ get, ensure }, definitions) {
  return Object.freeze(Object.fromEntries(Object.entries(definitions).map(([method, fallback]) => [
    method,
    (...args) => {
      const target = get();
      if (typeof target?.[method] === "function") return target[method](...args);
      ensure().then((loaded) => { if (loaded) get()?.[method]?.(...args); });
      return typeof fallback === "function" ? fallback(...args) : fallback;
    },
  ])));
}

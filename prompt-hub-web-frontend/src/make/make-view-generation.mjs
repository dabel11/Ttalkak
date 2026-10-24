// @ts-check
// Transient generations are deliberately excluded from persisted application data.
const generations = new WeakMap();
const listReads = new WeakMap();
function viewGeneration(/** @type {TtalkakApplicationState} */ state) { return generations.get(state); }
function invalidateMakeView(/** @type {TtalkakApplicationState} */ state) { generations.set(state, {}); }

/** @param {TtalkakApplicationState} state */
function beginMakeListRead(state) {
  const request = {};
  listReads.set(state, request);
  return () => listReads.get(state) === request;
}

/** @param {TtalkakApplicationState} state */
function captureMakeView(state) {
  const view = viewGeneration(state), route = state.route, token = state.authToken, editing = state.editingMessageId;
  return () => viewGeneration(state) === view && state.route === route && state.authToken === token && state.editingMessageId === editing;
}
export { viewGeneration, invalidateMakeView, beginMakeListRead, captureMakeView };

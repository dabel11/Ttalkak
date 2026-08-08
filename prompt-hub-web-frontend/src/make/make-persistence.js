(function attachMakePersistence(global) {
  "use strict";
  function normalizeAndPersistMakeState(state, model, stateApi, persist) {
    model.migratePersistedMakeState(state);
    const seen = new Set();
    stateApi.setMakeRecentThreads(state, state.recentThreads.filter((thread, index) => {
      if (!thread.id) thread.id = `legacy-thread-${Date.now()}-${index}`;
      if (seen.has(thread.id)) return false;
      seen.add(thread.id);
      thread.dedupeKey = thread.id;
      return true;
    }));
    persist();
    return state;
  }
  global.TtalkakMakePersistence = Object.freeze({ normalizeAndPersistMakeState });
})(window);

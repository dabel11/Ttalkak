(function attachMakePersistence(global) {
  "use strict";
  function migrateAndPersistMakeState(state, model, persist) { model.migratePersistedMakeState(state); persist(); return state; }
  global.TtalkakMakePersistence = Object.freeze({ migrateAndPersistMakeState });
})(window);

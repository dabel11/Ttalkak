const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/utils/make-message-model.js");

const values = new Map();
global.window = {
  localStorage: {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
};
require("../src/state/app-state.js");

test("legacy localStorage messages are migrated and saved with schemaVersion", () => {
  const storage = global.window.TtalkakState;
  storage.writePersistedPayload({
    state: {
      messages: [{ role: "assistant", improvedPrompt: "구형 본문" }, { role: "assistant" }],
      recentThreads: [{ id: "legacy", messages: [{ role: "assistant", improvedPrompt: "대화 본문" }] }],
    },
  });

  const payload = storage.readPersistedPayload();
  model.migratePersistedMakeState(payload.state);
  storage.writePersistedPayload(payload);
  const saved = storage.readPersistedPayload();

  assert.equal(saved.state.messages.length, 1);
  assert.equal(saved.state.messages[0].schemaVersion, model.SCHEMA_VERSION);
  assert.equal(saved.state.recentThreads[0].messages[0].schemaVersion, model.SCHEMA_VERSION);
});

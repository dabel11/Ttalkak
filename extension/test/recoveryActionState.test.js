import test from "node:test";
import assert from "node:assert/strict";
import { createRecoveryActionCoordinator } from "../src/utils/recoveryActionState.js";

test("recovery actions reject duplicate starts and clear after completion", () => {
  const states = [];
  const coordinator = createRecoveryActionCoordinator((state) => states.push(state));
  const token = coordinator.start("conflict-1", "refresh");

  assert.deepEqual(token, { messageId: "conflict-1", action: "refresh" });
  assert.equal(coordinator.isActive(), true);
  assert.equal(coordinator.start("conflict-1", "refresh"), null);
  assert.equal(coordinator.finish(token), true);
  assert.equal(coordinator.isActive(), false);
  assert.deepEqual(states, [token, { messageId: "", action: "" }]);
});

test("disposing recovery state ignores late completion and future starts", () => {
  const states = [];
  const coordinator = createRecoveryActionCoordinator((state) => states.push(state));
  const token = coordinator.start("conflict-2", "retry");
  coordinator.dispose();

  assert.equal(coordinator.isActive(), false);
  assert.equal(coordinator.finish(token), false);
  assert.equal(coordinator.start("conflict-3", "refresh"), null);
  assert.deepEqual(states, [token]);

  coordinator.activate();
  assert.deepEqual(coordinator.start("conflict-3", "refresh"), { messageId: "conflict-3", action: "refresh" });
});

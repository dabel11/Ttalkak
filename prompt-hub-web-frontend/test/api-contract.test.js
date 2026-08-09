const test = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED_METHODS, assertApiContract, assertRecordResponse, assertCollectionResponse } = require("../src/api/api-contract.js");

function validApi() {
  return Object.fromEntries(REQUIRED_METHODS.map((name) => [name, async () => ({})]));
}

test("API contract accepts the required frontend methods", () => {
  const api = validApi();
  assert.equal(assertApiContract(api), api);
});

test("API contract reports missing and non-callable methods", () => {
  const api = validApi();
  delete api.login;
  api.createMakeFolder = true;
  assert.throws(() => assertApiContract(api), /login, createMakeFolder/);
});

test("response validators reject malformed records and unwrap supported collections", () => {
  assert.deepEqual(assertRecordResponse({ id: 1 }, "create folder"), { id: 1 });
  assert.deepEqual(assertCollectionResponse({ items: [{ id: 1 }] }, "folders"), [{ id: 1 }]);
  assert.deepEqual(assertCollectionResponse([{ id: 2 }], "folders"), [{ id: 2 }]);
  assert.throws(() => assertRecordResponse([], "mutation"), /mutation response/);
  assert.throws(() => assertCollectionResponse({ result: [] }, "folders"), /folders response/);
});

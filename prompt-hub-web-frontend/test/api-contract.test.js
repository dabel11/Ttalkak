const test = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED_METHODS, RESPONSE_CONTRACTS, assertApiContract, assertRecordResponse, assertCollectionResponse, validateApiResponse, wrapApiResponses } = require("../src/api/api-contract.js");

function validApi() {
  return Object.fromEntries(REQUIRED_METHODS.map((name) => [name, async () => ({})]));
}

test("API contract accepts the required frontend methods", () => {
  const api = validApi();
  assert.equal(assertApiContract(api), api);
});

test("every public API method has a runtime response contract", () => {
  assert.deepEqual(REQUIRED_METHODS.filter((name) => !RESPONSE_CONTRACTS[name]), []);
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

test("API response wrapper validates live method results without changing valid payloads", async () => {
  const api = validApi();
  api.getMakeFolders = async () => [{ id: 1 }];
  api.login = async () => ({ accessToken: "token", member: { memberId: 1 } });
  const wrapped = wrapApiResponses(api);
  assert.deepEqual(await wrapped.getMakeFolders(), [{ id: 1 }]);
  assert.deepEqual(await wrapped.login(), { accessToken: "token", member: { memberId: 1 } });

  api.getMakeFolders = async () => ({ result: [] });
  await assert.rejects(() => wrapApiResponses(api).getMakeFolders(), /getMakeFolders response/);
  assert.equal(validateApiResponse("deletePrompt", undefined), undefined);
});

test("authentication responses require both a token and user identity", async () => {
  const api = validApi();
  api.login = async () => ({ accessToken: "token" });
  await assert.rejects(() => wrapApiResponses(api).login(), /token and user identity/);
});

const shared = require("../../../fixtures/prompt-improve-responses.json");

module.exports = Object.freeze({
  ...shared.responses,
  ...shared.errors,
  ...shared.clientMessages,
});

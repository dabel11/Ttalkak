(function attachApiContract(global) {
  "use strict";

  const REQUIRED_METHODS = Object.freeze([
    "login", "signup", "googleLogin", "findId", "requestPasswordReset", "withdrawAccount", "checkUserId", "checkNickname",
    "getMakeThreads", "getMakeThread", "getMakeFolders", "createMakeThread",
    "deleteMakeThread", "createMakeFolder", "updateMakeFolder", "deleteMakeFolder", "moveMakeThread",
    "sharePrompt", "shareExistingPrompt", "updatePrompt", "deletePrompt", "unsharePrompt", "reportPrompt", "reportComment",
    "getAdminReports", "updateAdminReportStatus", "getAdminPrompts", "getAdminTags", "updateAdminTagStatus",
    "searchAdminUsers", "getAdminUserActivity", "blockAdminUser", "unblockAdminUser",
    "getAdminAuditLogs", "getAdminRevisionRequests", "requestAuthorRevision", "updateAuthorRevisionRequest",
    "updateAdminRevisionRequestStatus", "hideAdminComment", "unhideAdminComment", "deleteAdminComment",
    "hideAdminPrompt", "restoreAdminPrompt",
  ]);

  function assertApiContract(api) {
    if (!api || typeof api !== "object") throw new TypeError("TTALKAK_API must be an object.");
    const invalid = REQUIRED_METHODS.filter((name) => typeof api[name] !== "function");
    if (invalid.length) throw new TypeError(`TTALKAK_API contract mismatch: ${invalid.join(", ")}`);
    return api;
  }

  function assertRecordResponse(value, operation) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${operation || "API"} response must be an object.`);
    }
    return value;
  }

  function assertCollectionResponse(value, operation) {
    if (Array.isArray(value)) return value;
    const record = assertRecordResponse(value, operation);
    const candidates = [record.items, record.content, record.data];
    const collection = candidates.find(Array.isArray);
    if (!collection) throw new TypeError(`${operation || "API"} response must contain a collection.`);
    return collection;
  }

  const api = Object.freeze({ REQUIRED_METHODS, assertApiContract, assertRecordResponse, assertCollectionResponse });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakApiContract = api;
  if (typeof window !== "undefined") assertApiContract(global.TTALKAK_API);
})(typeof window !== "undefined" ? window : globalThis);

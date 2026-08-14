  const CONTRACT_METHODS = Object.freeze({
    auth: ["login", "signup", "googleLogin"],
    record: [
      "findId", "requestPasswordReset", "checkUserId", "checkNickname", "proposeTag", "improvePrompt",
      "getMakeThread", "createMakeThread", "createMakeFolder", "sharePrompt", "shareExistingPrompt", "updatePrompt",
      "addComment", "addReply", "updateComment", "requestPromptRevision", "getAdminUserActivitySummary",
      "getAdminUserActivity", "blockAdminUser", "unblockAdminUser", "updateAdminReportStatus", "updateAdminTagStatus",
      "requestAuthorRevision", "updateAuthorRevisionRequest", "updateAdminRevisionRequestStatus", "hideAdminComment",
      "unhideAdminComment", "hideAdminPrompt", "restoreAdminPrompt",
    ],
    collection: [
      "getCommunityPosts", "searchCommunityPosts", "getPopularTags", "searchTags", "getMakeThreads", "getMakeFolders",
      "getPromptComments", "getSavedPrompts", "getMyLibrary", "getMyPrompts", "getMyComments", "getMyReports",
      "getMyRevisionRequests", "getAdminReports", "getAdminPrompts", "getAdminTags", "searchAdminUsers",
      "getAdminAuditLogs", "getAdminRevisionRequests", "getAdminUserPrompts", "getAdminUserComments", "getAdminUserReplies",
      "getAdminUserSubmittedReports", "getAdminUserReceivedReports",
    ],
    "optional-record": [
      "withdrawAccount", "viewPrompt", "savePrompt", "unsavePrompt", "likePrompt", "unlikePrompt", "updateMakeFolder",
      "moveMakeThread", "unsharePrompt", "reportPrompt", "reportComment", "deletePrompt", "deleteMakeThread",
      "deleteMakeFolder", "deleteComment", "likeComment", "unlikeComment", "deleteAdminComment",
    ],
  });

  const RESPONSE_CONTRACTS = Object.freeze(Object.fromEntries(
    Object.entries(CONTRACT_METHODS).flatMap(([contract, methods]) => methods.map((method) => [method, contract])),
  ));
  const REQUIRED_METHODS = Object.freeze(Object.keys(RESPONSE_CONTRACTS));

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

  function assertAuthResponse(value, operation) {
    const record = assertRecordResponse(value, operation);
    const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data : record;
    const token = data.accessToken || data.access_token || data.token || data.authToken || data.jwt;
    const nestedUser = data.user || data.member || data.account;
    const user = nestedUser && typeof nestedUser === "object" && !Array.isArray(nestedUser) ? nestedUser : data;
    const identity = user.id || user.userId || user.memberId || user.nickname || user.username;
    if (typeof token !== "string" || !token.trim() || (typeof identity !== "string" && typeof identity !== "number")) {
      throw new TypeError(`${operation || "Auth API"} response must contain a token and user identity.`);
    }
    return record;
  }

  function validateApiResponse(method, value) {
    const contract = RESPONSE_CONTRACTS[method];
    if (!contract) return value;
    if (contract === "optional-record" && (value === undefined || value === null || value === "")) return value;
    if (contract === "collection") assertCollectionResponse(value, method);
    else if (contract === "auth") assertAuthResponse(value, method);
    else assertRecordResponse(value, method);
    return value;
  }

  function wrapApiResponses(api) {
    const source = assertApiContract(api);
    return Object.fromEntries(Object.entries(source).map(([name, member]) => [
      name,
      typeof member !== "function" || !RESPONSE_CONTRACTS[name]
        ? member
        : function validatedApiMethod(...args) {
            return Promise.resolve(member.apply(source, args)).then((value) => validateApiResponse(name, value));
          },
    ]));
  }

export { REQUIRED_METHODS, RESPONSE_CONTRACTS, assertApiContract, assertRecordResponse, assertCollectionResponse, assertAuthResponse, validateApiResponse, wrapApiResponses };

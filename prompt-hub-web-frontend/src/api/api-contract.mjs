  const REQUIRED_METHODS = Object.freeze([
    "login", "signup", "googleLogin", "findId", "requestPasswordReset", "withdrawAccount", "checkUserId", "checkNickname",
    "getCommunityPosts", "searchCommunityPosts", "getPopularTags", "searchTags", "proposeTag", "viewPrompt", "improvePrompt",
    "savePrompt", "unsavePrompt", "likePrompt", "unlikePrompt",
    "getMakeThreads", "getMakeThread", "getMakeFolders", "createMakeThread",
    "deleteMakeThread", "createMakeFolder", "updateMakeFolder", "deleteMakeFolder", "moveMakeThread",
    "sharePrompt", "shareExistingPrompt", "updatePrompt", "deletePrompt", "unsharePrompt", "reportPrompt", "reportComment",
    "getPromptComments", "addComment", "addReply", "updateComment", "deleteComment", "likeComment", "unlikeComment",
    "getSavedPrompts", "getMyLibrary", "getMyPrompts", "getMyComments", "getMyReports", "getMyRevisionRequests", "requestPromptRevision",
    "getAdminReports", "updateAdminReportStatus", "getAdminPrompts", "getAdminTags", "updateAdminTagStatus",
    "searchAdminUsers", "getAdminUserActivity", "blockAdminUser", "unblockAdminUser",
    "getAdminUserActivitySummary", "getAdminUserPrompts", "getAdminUserComments", "getAdminUserReplies",
    "getAdminUserSubmittedReports", "getAdminUserReceivedReports",
    "getAdminAuditLogs", "getAdminRevisionRequests", "requestAuthorRevision", "updateAuthorRevisionRequest",
    "updateAdminRevisionRequestStatus", "hideAdminComment", "unhideAdminComment", "deleteAdminComment",
    "hideAdminPrompt", "restoreAdminPrompt",
  ]);

  const RESPONSE_CONTRACTS = Object.freeze({
    login: "auth", signup: "auth", googleLogin: "auth", findId: "record", requestPasswordReset: "record",
    withdrawAccount: "optional-record", checkUserId: "record", checkNickname: "record",
    getCommunityPosts: "collection", searchCommunityPosts: "collection", getPopularTags: "collection", searchTags: "collection",
    proposeTag: "record", viewPrompt: "optional-record", improvePrompt: "record",
    savePrompt: "optional-record", unsavePrompt: "optional-record", likePrompt: "optional-record", unlikePrompt: "optional-record",
    getMakeThreads: "collection", getMakeFolders: "collection", getMakeThread: "record",
    createMakeThread: "record", createMakeFolder: "record", updateMakeFolder: "optional-record", moveMakeThread: "optional-record",
    sharePrompt: "record", shareExistingPrompt: "record", updatePrompt: "record",
    unsharePrompt: "optional-record", reportPrompt: "optional-record", reportComment: "optional-record",
    deletePrompt: "optional-record", deleteMakeThread: "optional-record", deleteMakeFolder: "optional-record",
    getPromptComments: "collection", addComment: "record", addReply: "record", updateComment: "record",
    deleteComment: "optional-record", likeComment: "optional-record", unlikeComment: "optional-record",
    getSavedPrompts: "collection", getMyLibrary: "collection", getMyPrompts: "collection", getMyComments: "collection",
    getMyReports: "collection", getMyRevisionRequests: "collection", requestPromptRevision: "record",
    getAdminReports: "collection", getAdminPrompts: "collection", getAdminTags: "collection",
    searchAdminUsers: "collection", getAdminAuditLogs: "collection", getAdminRevisionRequests: "collection",
    getAdminUserActivitySummary: "record", getAdminUserPrompts: "collection", getAdminUserComments: "collection",
    getAdminUserReplies: "collection", getAdminUserSubmittedReports: "collection", getAdminUserReceivedReports: "collection",
    getAdminUserActivity: "record", blockAdminUser: "record", unblockAdminUser: "record",
    updateAdminReportStatus: "record", updateAdminTagStatus: "record", requestAuthorRevision: "record",
    updateAuthorRevisionRequest: "record", updateAdminRevisionRequestStatus: "record",
    hideAdminComment: "record", unhideAdminComment: "record", hideAdminPrompt: "record", restoreAdminPrompt: "record",
    deleteAdminComment: "optional-record",
  });

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
